---
title: "Module 10: Watching a Host — Pipeline"
description: "The watch command monitors a host continuously. We structure it as a pipeline of goroutines — each with one job, each cancellable."
order: 10
---

# Module 10: Watching a Host — Pipeline

**Pattern: [Pipeline](/patterns/concurrency/pipeline)**

`netscan watch` is the most interesting command to build because it runs forever (until cancelled) and has the clearest separation of concerns. Each concern maps naturally to a pipeline stage.

## Start with the naïve version

```go
func (c *WatchCommand) Run(ctx *cli.Context) error {
    host := ctx.Args[0]
    ticker := time.NewTicker(c.interval)
    defer ticker.Stop()

    var lastReachable *bool

    for {
        select {
        case <-ctx.Ctx.Done():
            return nil
        case <-ticker.C:
            result := scanner.ProbeHost(ctx.Ctx, dialer, host)

            timestamp := time.Now().Format("15:04:05")
            changed := lastReachable == nil || *lastReachable != result.Reachable

            if result.Reachable {
                if changed {
                    fmt.Printf("✓ [%s] %s is UP\n", timestamp, host)
                } else {
                    fmt.Printf("  [%s] still UP\n", timestamp)
                }
            } else {
                if changed {
                    fmt.Printf("✗ [%s] %s is DOWN\n", timestamp, host)
                }
            }

            reachable := result.Reachable
            lastReachable = &reachable
        }
    }
}
```

This works. For one host, watched once, with this exact output format — it's fine.

Now: try to test the diff logic (the "did the state change?" part) independently. You can't — it's embedded in the select case. Try to swap the output format. You have to edit the same function. Try to add a Slack notification when the host goes down. The function is already doing too many things.

The naïve version conflates: tick generation, probe execution, state diffing, and output formatting. Each of those is independently testable and independently replaceable if they're separate.

## The pipeline

```
ticker goroutine       → ticks channel
probe goroutine        → probeResults channel
output goroutine       → (writes to ctx.Out)
```

Each stage has one job. Each is connected to the next by a channel. Cancellation propagates through `ctx.Ctx.Done()`.

```go
func (c *WatchCommand) Run(ctx *cli.Context) error {
    host := ctx.Args[0]
    dialer := scanner.NewDialer(2 * time.Second)
    w := output.New(ctx.Out)
    w.Info("Watching %s every %s…", host, c.interval)

    // Stage 1: ticker
    ticks := make(chan struct{})
    go func() {
        defer close(ticks)
        ticker := time.NewTicker(c.interval)
        defer ticker.Stop()

        ticks <- struct{}{} // immediate first tick

        probeCount := 1
        for {
            select {
            case <-ctx.Ctx.Done():
                return
            case <-ticker.C:
                if c.count > 0 && probeCount >= c.count {
                    return
                }
                ticks <- struct{}{}
                probeCount++
            }
        }
    }()

    // Stage 2: probe
    probeResults := make(chan scanner.ProbeResult)
    go func() {
        defer close(probeResults)
        for range ticks {
            probeCtx, cancel := context.WithTimeout(ctx.Ctx, 2*time.Second)
            result := scanner.ProbeHost(probeCtx, dialer, host)
            cancel()

            select {
            case <-ctx.Ctx.Done():
                return
            case probeResults <- result:
            }
        }
    }()

    // Stage 3: diff + output
    var lastReachable *bool
    for result := range probeResults {
        timestamp := time.Now().Format("15:04:05")
        changed := lastReachable == nil || *lastReachable != result.Reachable

        if result.Reachable {
            if changed {
                w.Success("[%s] %s is UP (latency %s)",
                    timestamp, host, result.Latency.Round(time.Millisecond))
            } else {
                w.Plain("  [%s] still UP (%s)",
                    timestamp, result.Latency.Round(time.Millisecond))
            }
        } else {
            if changed {
                w.Fail("[%s] %s is DOWN: %v", timestamp, host, result.Error)
            } else {
                w.Plain("  [%s] still DOWN", timestamp)
            }
        }

        reachable := result.Reachable
        lastReachable = &reachable
    }

    return nil
}
```

## How cancellation flows through

When the user presses Ctrl-C:

1. `ctx.Ctx` is cancelled (set up in `main.go` via `signal.NotifyContext`)
2. The ticker goroutine's `select` sees `ctx.Ctx.Done()` and returns, closing `ticks`
3. The probe goroutine's `for range ticks` ends (closed channel), it returns, closing `probeResults`
4. The main goroutine's `for result := range probeResults` ends (closed channel)
5. `Run` returns `nil`

No goroutine leaks. No stuck selects. No manual cleanup. The channel closure cascade is the shutdown mechanism — each stage closing its output channel signals the next stage to stop.

This is why the [Done Channel pattern](/patterns/concurrency/done-channel) matters. Without `ctx.Ctx.Done()` in the ticker goroutine, Ctrl-C would cancel the context but the ticker would keep firing — and `ticks <- struct{}{}` would block forever (no reader) while the ticker goroutine leaked.

## Why `time.NewTicker` and not `time.Sleep`

```go
// Don't do this:
for {
    time.Sleep(c.interval)
    probe()
}
```

`time.Sleep` measures elapsed time from the *end* of the previous probe. If probing takes 800ms and the interval is 1s, the actual period is 1800ms. Drift accumulates.

`time.NewTicker` fires on a fixed schedule regardless of how long each iteration takes. The period is stable. For monitoring tools where you want "probe every 5 seconds," this is the right choice.

The immediate first tick (`ticks <- struct{}{}` before the ticker loop) avoids the awkward "you run the command but nothing happens for 5 seconds." The user sees a result immediately, then again every interval.

## What the pipeline pattern enables

**Independent testability.** The probe stage is `scanner.ProbeHost` — already tested. The diff logic is a handful of conditionals — extractable into a pure function and table-tested. The output stage calls `output.Writer` — tested via `bytes.Buffer`.

**Independent replaceability.** Want to add a Slack notification when the host goes down? Add it in the diff stage — or add a stage between probe and output. Nothing else changes.

**Graceful shutdown.** The channel cascade handles cancellation automatically. No explicit "stop signal" needed beyond the standard `context.Context`.

**Readable data flow.** `ticks → probeResults → output` reads left-to-right like a sentence. Compare to the naïve version's single-select-case that does everything.

## The `--count` flag

```go
if c.count > 0 && probeCount >= c.count {
    return // ticker goroutine exits, cascade shuts down
}
```

`--count=0` means run forever. `--count=5` means probe five times and exit. This flag is useful for scripting — `netscan watch host --count=1` is equivalent to `netscan host` but expressed as a watch invocation.

The ticker goroutine is responsible for the count. When it returns, the cascade shuts down exactly as it would for Ctrl-C. The command exits cleanly.

Next: DNS lookups and the Strategy pattern applied to output formatting.
