---
title: "Timeout and Select"
category: concurrency
intent: "Use select to wait on multiple channel operations simultaneously, with timeouts and cancellation to prevent indefinite blocking."
idiomSummary: "select multiplexes channel operations; context.WithTimeout is the idiomatic deadline; time.NewTimer is preferred over time.After in loops to avoid timer leaks."
relatedSlugs: ["done-channel", "pipeline", "worker-pool", "errgroup"]
tags: [concurrency, channels, state, performance]
isFeatured: false
---

# Timeout and Select

`select` is Go's multiplexer for channel operations. It waits until one of several channel cases can proceed, then executes it. Combined with `time.After`, `time.NewTimer`, or `context.WithTimeout`, it gives you precise control over how long a goroutine is willing to wait: for a value, for a result, for a downstream service to respond.

Every goroutine that blocks on a channel without a timeout is a goroutine that can block forever. A select with a timeout or done channel is the discipline that prevents that.

## Basic select

`select` picks whichever case is ready. If multiple cases are ready simultaneously, it chooses one at random (intentionally, to prevent starvation).

```go
select {
case msg := <-messages:
    fmt.Println("received:", msg)
case <-time.After(5 * time.Second):
    fmt.Println("timed out waiting for message")
}
```

With a `default` case, select is non-blocking:

```go
select {
case msg := <-messages:
    process(msg)
default:
    // nothing ready — continue without blocking
}
```

## Timeout with context

`context.WithTimeout` is the idiomatic way to apply a deadline to a unit of work. It composes with any function that accepts a context.

```go
func fetchWithTimeout(url string) ([]byte, error) {
    ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
    defer cancel() // releases resources even if the deadline isn't hit

    req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
    if err != nil {
        return nil, err
    }
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return nil, fmt.Errorf("fetching %s: %w", url, err)
    }
    defer resp.Body.Close()
    return io.ReadAll(resp.Body)
}
```

`defer cancel()` is non-negotiable. Without it, the context's internal timer goroutine leaks until the deadline expires.

## Timeout on a channel receive

When waiting for a result from a goroutine, select on both the result channel and the deadline.

```go
package main

import (
	"errors"
	"fmt"
	"time"
)

type Job struct{ ID string }
type Result struct{ Value string }

func compute(job Job) Result {
	time.Sleep(50 * time.Millisecond) // simulate work
	return Result{Value: "result-" + job.ID}
}

func processWithTimeout(job Job) (Result, error) {
	results := make(chan Result, 1)
	go func() {
		results <- compute(job)
	}()

	select {
	case r := <-results:
		return r, nil
	case <-time.After(1 * time.Second):
		return Result{}, errors.New("computation timed out")
	}
}

func main() {
	r, err := processWithTimeout(Job{ID: "42"})
	if err != nil {
		fmt.Println("error:", err)
		return
	}
	fmt.Println(r.Value)
}
```

The `results` channel is buffered (capacity 1) so the goroutine doesn't leak if the timeout fires first. It can send its result and exit even if nobody is reading.

## time.After vs time.NewTimer in loops

`time.After(d)` creates a new timer on every call. In a loop, this leaks timers until they fire (after duration `d`):

```go
// BAD in a loop — a new timer is created every iteration.
// Old timers accumulate in memory until they fire.
for {
    select {
    case msg := <-ch:
        handle(msg)
    case <-time.After(idleTimeout):
        return errors.New("idle timeout")
    }
}
```

```go
// GOOD in a loop — one timer, reset explicitly.
timer := time.NewTimer(idleTimeout)
defer timer.Stop()
for {
    select {
    case msg := <-ch:
        if !timer.Stop() {
            <-timer.C // drain if already fired
        }
        timer.Reset(idleTimeout)
        handle(msg)
    case <-timer.C:
        return errors.New("idle timeout")
    }
}
```

In a one-shot select (outside a loop), `time.After` is fine.

## Multiplexing with priority

`select` chooses randomly when multiple cases are ready. When you need to drain a high-priority channel before processing low-priority work, use a nested select:

```go
for {
    // Always check for cancellation first.
    select {
    case <-ctx.Done():
        return ctx.Err()
    default:
    }

    // Then handle normal work.
    select {
    case <-ctx.Done():
        return ctx.Err()
    case job := <-jobs:
        process(job)
    }
}
```

The first `select` with a `default` is non-blocking: it checks `ctx.Done()` without waiting. If cancellation is pending, it returns immediately without risking processing another job.

## Nil channels to disable cases

A receive on a nil channel blocks forever. This makes nil channels useful for dynamically disabling select cases:

```go
func merge(a, b <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for a != nil || b != nil {
            select {
            case v, ok := <-a:
                if !ok {
                    a = nil // disable this case
                    continue
                }
                out <- v
            case v, ok := <-b:
                if !ok {
                    b = nil // disable this case
                    continue
                }
                out <- v
            }
        }
    }()
    return out
}
```

When `a` is closed, setting `a = nil` removes it from the select. The loop continues until both channels are nil.

## When to Use

- Any channel receive or send that should not block indefinitely.
- Waiting for the first result from multiple concurrent operations.
- Implementing idle timeouts, heartbeat checks, or request deadlines.
- Draining or merging multiple channels.

## When Not to Use

- Simple sequential logic where a straightforward function call with a context deadline suffices. Not every operation needs explicit channel multiplexing.
- You only have one channel and no timeout needed. A plain `<-ch` is cleaner.

## Tradeoffs

`select` is inherently non-deterministic when multiple cases are ready. For most uses this is correct behaviour, but it means you cannot rely on case ordering for priority. The priority pattern above (double select) is the workaround and adds complexity. Timer management in loops is also easy to get wrong: the leak from `time.After` in loops is subtle and only shows up under sustained load.

## Related Patterns

- **Done Channel**: `ctx.Done()` is the done channel; this pattern explains how to use it inside a select.
- **Pipeline**: each stage's goroutine typically selects on both its input channel and `ctx.Done()`.
- **Worker Pool**: workers select on the jobs channel and `ctx.Done()` so they stop cleanly on cancellation.
- **Errgroup**: uses `context.WithCancel` internally; when any goroutine fails the context is cancelled, which workers detect via select on `ctx.Done()`.
