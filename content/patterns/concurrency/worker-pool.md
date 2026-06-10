---
title: "Worker Pool"
description: "Process jobs concurrently using a fixed number of goroutines, bounding memory use and preventing goroutine explosion."
---

# Worker Pool

A worker pool processes a queue of jobs using a fixed number of goroutines. Rather than spawning one goroutine per job (which can exhaust memory under load) a pool creates N workers at startup and keeps them running, each drawing jobs from a shared channel. Work is bounded: at most N jobs run simultaneously regardless of how many are enqueued.

**Buys a hard ceiling on goroutines and amortised startup for job streams; pays in channel plumbing and out-of-order results.** It's the concurrency pattern you'll reach for most often.

## Scenario

You need to process 10,000 incoming HTTP webhooks concurrently. The naive approach spawns one goroutine per webhook, which means up to 10,000 goroutines simultaneously, each consuming stack memory and holding a database connection. Under burst traffic, this exhausts resources.

```go
// BAD — unbounded goroutine spawn.
// 10,000 simultaneous requests → 10,000 goroutines → OOM or DB connection exhaustion.
for _, event := range events {
    go processEvent(event)
}
```

> **Smell:** Your `for _, item := range input` loop launches `go process(item)` with no semaphore, no pool, and the size of `input` is caller-controlled or network-derived. You've delegated your resource ceiling to whoever sends you a big enough slice.

## Solution

Create a buffered jobs channel and start N worker goroutines. Each worker loops over the jobs channel. The sender closes the channel when done, which causes all workers to exit their range loops cleanly. Run it:

```go:title="main.go":run=true:editable=true
package main

import (
	"fmt"
	"sync"
)

type Job struct {
	ID      string
	Payload []byte
}

type Result struct {
	JobID string
	Err   error
}

func processJob(job Job) error {
	fmt.Printf("  processed job %s (%d bytes)\n", job.ID, len(job.Payload))
	return nil
}

func NewPool(workers int, jobs <-chan Job) <-chan Result {
	results := make(chan Result, workers)
	var wg sync.WaitGroup

	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func() {
			defer wg.Done()
			for job := range jobs {
				err := processJob(job)
				results <- Result{JobID: job.ID, Err: err}
			}
		}()
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	return results
}

func main() {
	events := []struct {
		ID   string
		Data []byte
	}{
		{"evt-1", []byte(`{"type":"click"}`)},
		{"evt-2", []byte(`{"type":"view"}`)},
		{"evt-3", []byte(`{"type":"buy"}`)},
	}

	jobs := make(chan Job, 100)
	results := NewPool(3, jobs)

	go func() {
		defer close(jobs)
		for _, event := range events {
			jobs <- Job{ID: event.ID, Payload: event.Data}
		}
	}()

	for r := range results {
		if r.Err != nil {
			fmt.Printf("job %s failed: %v\n", r.JobID, r.Err)
		}
	}
}
```

## With context cancellation

Production pools need to shut down early on context cancellation. Workers should select on both `jobs` and `ctx.Done()`, stopping when the context is done even if there are still jobs in the channel.

```go
func NewPool(ctx context.Context, workers int, jobs <-chan Job) <-chan Result {
    results := make(chan Result, workers)
    var wg sync.WaitGroup

    wg.Add(workers)
    for range workers {
        go func() {
            defer wg.Done()
            for {
                select {
                case job, ok := <-jobs:
                    if !ok {
                        return // jobs channel closed
                    }
                    err := processJob(job)
                    select {
                    case results <- Result{JobID: job.ID, Err: err}:
                    case <-ctx.Done():
                        return
                    }
                case <-ctx.Done():
                    return
                }
            }
        }()
    }

    go func() {
        wg.Wait()
        close(results)
    }()

    return results
}
```

## Dynamic sizing with semaphore

When you can't predetermine the right worker count, a [Semaphore](/patterns/concurrency/semaphore) gives you the same bound with a simpler structure: spawn one goroutine per job but limit how many run concurrently.

```go
// Semaphore alternative — simpler when job count is known at call time.
sem := make(chan struct{}, maxConcurrent)
var wg sync.WaitGroup

for _, job := range jobs {
    wg.Add(1)
    sem <- struct{}{} // acquire
    go func(j Job) {
        defer wg.Done()
        defer func() { <-sem }() // release
        processJob(j)
    }(job)
}
wg.Wait()
```

## Choosing pool size

```go
// CPU-bound work (encoding, hashing, image processing):
workers := runtime.NumCPU()

// I/O-bound work (HTTP calls, DB queries, file I/O):
// workers can exceed CPUs; tune to the downstream limit.
// DB connection pool of 20 → no point in more than 20 workers.
workers := db.Stats().MaxOpenConnections
```

Profile under realistic load. Too few workers: throughput is bounded by worker count. Too many: memory pressure and contention on shared resources.

## When to Use

- Processing a bounded or streaming queue of independent jobs concurrently.
- You need to cap goroutine count regardless of input volume.
- Downstream resources (DB connections, API rate limits) impose a natural concurrency ceiling.
- Jobs are long-lived or I/O-heavy, so the pool amortises goroutine startup cost.

## When Not to Use

- Jobs are extremely fast (microseconds). Channel overhead and goroutine scheduling may exceed the work itself; a simple loop is faster.
- You need strict ordering of results. Pool workers return results out of order; tag jobs with sequence numbers if order matters.
- You need one goroutine per connection or client (a network server, for instance). Use `go handleConn(conn)` directly; each connection is long-lived and its goroutine exits naturally.

## Common Mistakes

**Forgetting to close the jobs channel.** Workers loop with `for job := range jobs`, which blocks until the channel is closed. If the producer returns early — due to an error, a panic, or a missing `defer close(jobs)` — all workers hang forever. Always defer the close:

```go
go func() {
    defer close(jobs) // runs even if the loop body panics or returns early
    for _, item := range work {
        jobs <- buildJob(item)
    }
}()
```

**Closing the channel from multiple places.** Closing a closed channel panics. If your producer can exit from more than one path, use `defer` and a single return point, or protect the close with a `sync.Once`.

**Ignoring the results channel.** If your consumer stops reading `results` while workers are still running, workers block trying to send, `wg.Wait()` never returns, and the program hangs. Either drain results in a separate goroutine, or buffer it large enough for all results when you know the count up front.

**Pool size equal to job count.** `workers = len(jobs)` recreates the unbounded goroutine problem. The pool's value is a *fixed* ceiling. Set it from system constraints (CPU count for CPU-bound work, connection pool size for I/O-bound work), not from how many jobs happen to exist right now.

## The Decision

**Worker pool vs. goroutine per request.**
Go's `net/http` doesn't use a worker pool; it spawns `go serve(conn)` for every incoming request. That's the right model when each connection is long-lived, independent, and exits naturally when the client disconnects — the goroutine *is* the job, and the runtime's scheduler handles the rest. A worker pool adds complexity that `net/http` doesn't need.

Use a worker pool when jobs arrive in batches or as a stream, when the work is CPU- or I/O-bound in ways that exhaust a fixed resource, and when you need an explicit concurrency ceiling. Use goroutine-per-request when work is bounded by connection lifecycle and you trust the runtime to schedule efficiently.

**Persistent pool vs. ephemeral semaphore-bounded spawn.**
A worker pool pays goroutine startup cost once and amortises it across all jobs. This matters when you're processing a continuous stream of small jobs. A [semaphore](/patterns/concurrency/semaphore) spawns a goroutine per job but limits how many run simultaneously — simpler code, and the startup cost difference only matters when job count is large and job duration is short (a few hundred microseconds or less).

Rule of thumb: streaming jobs over the lifetime of the program → pool. A known batch processed once → semaphore.

**Back-pressure and channel buffer sizing.**
An unbuffered jobs channel (`make(chan Job)`) means the producer blocks until a worker is ready. This couples producer latency to worker latency: when workers are slow, the producer slows to match — natural back-pressure. A large buffer decouples them: the producer can run ahead of the workers, but memory grows with the queue. Under sustained overload without a bound, you've traded a slow producer for an OOM.

A buffer of one to two times the worker count is a reasonable starting point: it absorbs temporary bursts without unbounded growth.

**Error model.**
The simple pool above collects errors into the results channel and lets the consumer decide. The [Errgroup](/patterns/concurrency/errgroup) pattern cancels the whole pool on the first error, which is appropriate when any failure makes the rest of the work pointless (batch imports, parallel validation steps). Choose based on whether your consumer needs to know which jobs failed independently, or just whether the whole operation succeeded.

Every one of these is the same move — [naming the trade-off](/philosophy/name-the-trade-off) before you reach for the pool. The ceiling, the amortised startup, and the back-pressure are real gains, but each is bought with channel plumbing and out-of-order results; if you can't say which one you're buying, goroutine-per-job is the honest default.

## Related Patterns

- **Fan-out / Fan-in**: a more dynamic alternative: spawn one goroutine per item, limited by a semaphore, rather than a fixed pool. Better when job count is known upfront and the pool size would be awkward to predetermine.
- **Semaphore**: a lighter-weight alternative that bounds concurrency without a persistent pool of goroutines.
- **Pipeline**: a pool is often one stage in a larger pipeline; the jobs channel is the pipeline's upstream and the results channel is its downstream.
- **Done Channel**: the cancellation discipline; essential for pools that need to shut down before the jobs channel is exhausted.
- **Errgroup**: cancel all workers on the first error rather than collecting all errors into a results channel.
- **Competing Consumers**: the worker pool *is* the in-process competing-consumers pattern. That page names the idea as a messaging pattern and extends it to consumers that are separate processes draining a broker queue (SQS, NATS queue groups, Kafka consumer groups).
