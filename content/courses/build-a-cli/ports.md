---
title: "Module 8: Port Scanning — Fan-out / Fan-in"
description: "Sequential port scanning at 500ms timeout takes 8.5 minutes for 1024 ports. We feel the pain, then reach for fan-out/fan-in."
order: 8
---

# Module 8: Port Scanning — Fan-out / Fan-in

**Patterns: [Fan-out / Fan-in](/go/patterns/concurrency/fan-out-fan-in), [Done Channel](/go/patterns/concurrency/done-channel)**

Start with the sequential version. Feel the problem. Then reach for the pattern.

## The sequential version

```go
func ScanPortsSequential(ctx context.Context, dialer Dialer, host string, start, end int) []PortResult {
    var results []PortResult
    for port := start; port <= end; port++ {
        open, _ := ProbePort(ctx, dialer, host, port)
        results = append(results, PortResult{Port: port, Open: open})
    }
    return results
}
```

Run this:

```bash
netscan ports scanme.nmap.org --range=1-1024 --timeout=500ms
```

With a 500ms timeout per port and 1024 ports: 1024 × 500ms = **512 seconds. 8.5 minutes.**

Port scanning is a problem that is *embarrassingly parallel*: each probe is independent. Port 80 doesn't care what's happening on port 443. They can run at the same time — and they should.

## Why fan-out / fan-in

The [Fan-out / Fan-in pattern](/go/patterns/concurrency/fan-out-fan-in) fits this problem exactly: distribute a set of independent tasks across multiple goroutines (fan-out), then collect all their results into a single channel (fan-in).

```
ports 1..1024
    │
    ├─ goroutine 1: probe port 22 ────┐
    ├─ goroutine 2: probe port 80 ────┤
    ├─ goroutine 3: probe port 443 ───┤ → results channel → collect → sort → return
    ├─ goroutine 4: probe port 8080 ──┤
    └─ ... up to concurrency limit ──┘
```

The same 1024-port scan with 100 concurrent workers: ceiling(1024 / 100) × 500ms ≈ **5 seconds**.

## The implementation

```go
// internal/scanner/portscan.go

type PortResult struct {
    Port int
    Open bool
}

func ScanPorts(ctx context.Context, dialer Dialer, host string, startPort, endPort, concurrency int) []PortResult {
    ports := make(chan int, concurrency)       // work queue
    results := make(chan PortResult, endPort-startPort+1) // results

    // --- Fan-out: spin up `concurrency` workers ---
    // Each worker pulls port numbers from the ports channel until it's closed.
    var wg sync.WaitGroup
    for i := 0; i < concurrency; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for port := range ports {
                select {
                case <-ctx.Done():
                    return
                default:
                }
                open, _ := ProbePort(ctx, dialer, host, port)
                results <- PortResult{Port: port, Open: open}
            }
        }()
    }

    // --- Producer: feed port numbers into the work queue ---
    go func() {
        for port := startPort; port <= endPort; port++ {
            select {
            case <-ctx.Done():
                close(ports)
                return
            case ports <- port:
            }
        }
        close(ports)
    }()

    // --- Fan-in: wait for all workers, then close results ---
    go func() {
        wg.Wait()
        close(results)
    }()

    // Collect results from the fan-in channel.
    var out []PortResult
    for r := range results {
        if r.Open {
            out = append(out, r)
        }
    }

    sort.Slice(out, func(i, j int) bool { return out[i].Port < out[j].Port })
    return out
}
```

Three goroutine groups, each with one job:

1. **Producer goroutine** — pushes port numbers into the `ports` channel, closes when done.
2. **Worker goroutines** (fan-out) — each ranges over `ports`, calls `ProbePort`, sends result.
3. **Closer goroutine** — waits for all workers with `sync.WaitGroup`, then closes `results`.

The main goroutine ranges over `results` until it's closed, collects the open ports, sorts them.

## Why the WaitGroup lives in a separate goroutine

You might wonder why we do `go func() { wg.Wait(); close(results) }()` rather than just:

```go
wg.Wait()
close(results)
```

Because `wg.Wait()` blocks, and we need to be reading from `results` at the same time. If the `results` channel buffer fills up before we start reading, the workers block trying to send — and `wg.Wait()` never returns. Deadlock.

By waiting in a goroutine, we allow the main goroutine to range over `results` while workers are still running. The channel drains as it fills, workers unblock, and eventually `wg.Wait()` completes and `close(results)` ends the range loop.

This is a pattern within the pattern: whenever you need to wait for producers before closing a channel, and there's a consumer that needs to run concurrently, use a goroutine for the wait.

## The Done Channel — handling cancellation

**Pattern: [Done Channel](/go/patterns/concurrency/done-channel)**

Notice this in the worker:

```go
select {
case <-ctx.Done():
    return
default:
}
```

And in the producer:

```go
select {
case <-ctx.Done():
    close(ports)
    return
case ports <- port:
}
```

When the user presses Ctrl-C, `ctx` is cancelled. Without these checks:

- The producer would keep feeding port numbers into the channel
- Workers would keep dialling
- You'd be scanning ports on behalf of a user who already gave up

The Done Channel pattern says: every long-running goroutine should select on a done signal alongside its normal work. When the signal arrives, it cleans up and exits. The pattern is built into Go's `context.Context` — `ctx.Done()` returns a channel that's closed when the context is cancelled.

In `main.go` we'd wire up the signal:

```go
ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
defer cancel()
```

Now Ctrl-C triggers cancellation, which propagates through `ctx` to every goroutine that holds it. The scan stops within one dial-timeout.

## The `--concurrency` flag

The command exposes concurrency as a flag:

```go
// internal/commands/ports.go

cmd.Flags().IntVar(&cmd.concurrency, "concurrency", 100, "number of concurrent probes")
```

This lets users tune the behaviour themselves. Try it:

```bash
netscan ports scanme.nmap.org --range=1-1024 --concurrency=1    # sequential
netscan ports scanme.nmap.org --range=1-1024 --concurrency=100  # fast
netscan ports scanme.nmap.org --range=1-1024 --concurrency=500  # aggressive
```

With `--concurrency=1`, `ScanPorts` spins up one worker, which processes ports one at a time. It degenerates to sequential scanning — useful for demonstrating why concurrency matters, and for networks that rate-limit you.

With `--concurrency=500`, you're running 500 simultaneous dials. Fast, but rude on shared networks and likely to be blocked.

The flag makes the tradeoff visible and the user's choice explicit. That's better than hardcoding 100 and pretending the tradeoff doesn't exist.

## A note on channel buffer sizes

```go
ports := make(chan int, concurrency)
results := make(chan PortResult, endPort-startPort+1)
```

`ports` is buffered to `concurrency` — enough space for each worker to have a port queued. This prevents the producer from blocking immediately; it can stay ahead of the workers.

`results` is buffered to the total number of ports being scanned — large enough that workers never block waiting to send. This is an optimisation: an unbuffered results channel would still work (the consumer goroutine — `for r := range results` — runs concurrently) but a large buffer reduces channel contention.

The right buffer size is context-dependent. Here, the total scan size is known upfront and bounded (max 65535), so a full buffer is fine. If we were scanning an unbounded stream, we'd use a smaller buffer and accept some blocking.

Next: subnet scanning — similar problem, different constraint, different pattern.
