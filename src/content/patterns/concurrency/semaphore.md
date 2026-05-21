---
title: "Semaphore"
category: concurrency
intent: "Limit the number of goroutines accessing a resource concurrently using a buffered channel or the x/sync semaphore."
idiomSummary: "A buffered channel of empty structs acts as a counting semaphore: send to acquire, receive to release; capacity sets the concurrency limit."
relatedSlugs: ["worker-pool", "done-channel", "fan-out-fan-in"]
tags: [concurrency, channels, performance, state]
isFeatured: false
---

# Semaphore

A semaphore limits concurrent access to a resource. In Go, a buffered channel of empty structs is the idiomatic semaphore: the channel's capacity is the limit, sending to it acquires a slot, and receiving from it releases one. When the channel is full, any goroutine that tries to send blocks until another goroutine releases a slot.

The semaphore sits between two extremes: a mutex (only one goroutine at a time) and no limit (unlimited concurrency). Use it when you know how many concurrent operations a downstream system can handle and want to enforce that ceiling without managing a persistent goroutine pool.

## Problem

You need to make 500 outbound HTTP requests to a third-party API. Spawning 500 goroutines simultaneously would exceed the API's rate limit and likely trigger a 429. You need to cap concurrency at 20 while still doing work in parallel.

```go
// Unbounded — 500 goroutines, 500 simultaneous HTTP calls, rate limit errors.
var wg sync.WaitGroup
for _, url := range urls {
    wg.Add(1)
    go func(u string) {
        defer wg.Done()
        fetch(u)
    }(url)
}
wg.Wait()
```

## Solution

A buffered channel as a semaphore:

```go
const maxConcurrent = 20

sem := make(chan struct{}, maxConcurrent)
var wg sync.WaitGroup

for _, url := range urls {
    wg.Add(1)
    sem <- struct{}{} // acquire: blocks when 20 goroutines are already running
    go func(u string) {
        defer wg.Done()
        defer func() { <-sem }() // release: always runs, even on panic
        fetch(u)
    }(url)
}
wg.Wait()
```

The acquire (`sem <- struct{}{}`) happens before the goroutine is spawned, in the loop goroutine. This ensures at most `maxConcurrent` goroutines are active at any time. The release (`<-sem`) is deferred so it runs even if `fetch` panics.

## With context cancellation

```go
func fetchAll(ctx context.Context, urls []string) error {
    sem := make(chan struct{}, 20)
    var wg sync.WaitGroup
    errs := make(chan error, len(urls))

    for _, url := range urls {
        select {
        case sem <- struct{}{}:
        case <-ctx.Done():
            break
        }
        wg.Add(1)
        go func(u string) {
            defer wg.Done()
            defer func() { <-sem }()
            if err := fetch(ctx, u); err != nil {
                errs <- err
            }
        }(url)
    }

    wg.Wait()
    close(errs)

    for err := range errs {
        if err != nil {
            return err
        }
    }
    return nil
}
```

## The x/sync weighted semaphore

For more control — dynamic weights, or avoiding a separate goroutine per job — use `golang.org/x/sync/semaphore`:

```go
import "golang.org/x/sync/semaphore"

// A semaphore with a total weight of 10.
// Each Acquire call takes a weight; Release returns it.
sem := semaphore.NewWeighted(10)

for _, job := range jobs {
    // Acquire blocks until weight is available.
    if err := sem.Acquire(ctx, 1); err != nil {
        return err // ctx cancelled
    }
    go func(j Job) {
        defer sem.Release(1)
        process(j)
    }(job)
}

// Wait for all goroutines to finish by acquiring the full weight.
if err := sem.Acquire(ctx, 10); err != nil {
    return err
}
sem.Release(10)
```

Weighted semaphores are useful when jobs have different costs — a large file upload might acquire weight 4 while a small metadata request acquires weight 1.

## Semaphore vs Worker Pool

Both limit concurrency. The choice is about lifecycle:

| | Semaphore | Worker Pool |
|---|---|---|
| Goroutine count | One per in-flight job | Fixed N, persistent |
| Goroutine startup cost | Per job | Once at pool creation |
| Backpressure | Acquire blocks the sender | Jobs channel buffers |
| Best for | Short bursts, known job set | Long-running, streaming jobs |

If jobs arrive continuously over time, a [Worker Pool](/go/patterns/concurrency/worker-pool) amortises goroutine startup cost. If you're processing a known set of items once and the goroutine startup cost is acceptable, a semaphore is simpler.

## When to Use

- You need to cap concurrent access to a downstream resource (an API, a database, a file system).
- You spawn one goroutine per item but need to bound how many run simultaneously.
- The jobs are short-lived enough that a persistent goroutine pool would be idle most of the time.

## When Not to Use

- Goroutine startup cost dominates. If you're processing many small jobs rapidly, a worker pool with persistent goroutines is more efficient.
- You need to cancel individual jobs. A semaphore has no per-job handle; use a worker pool with context-per-job.
- You need to drain the queue on shutdown in a specific order.

## Tradeoffs

The buffered-channel semaphore is simple but has one edge: the acquire (`sem <- struct{}{}`) happens in the calling goroutine before the worker goroutine is spawned. If the context is cancelled while the caller is blocked on the acquire, the cancellation is detected only if you select on `ctx.Done()` — a plain `sem <- struct{}{}` will block forever. The `x/sync/semaphore` package handles this correctly with `Acquire(ctx, n)`.

## Related Patterns

- **Worker Pool** — a persistent pool of N goroutines consuming a jobs channel; better for high-volume, continuous workloads.
- **Fan-out / Fan-in** — fan-out with a semaphore bound is a common lightweight alternative to a full worker pool.
- **Done Channel** — combine a semaphore with context cancellation to stop new acquisitions when the parent operation is cancelled.
