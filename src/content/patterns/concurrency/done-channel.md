---
title: "Done Channel"
category: concurrency
intent: "Signal goroutines to stop work by closing a shared channel or cancelling a context, preventing goroutine leaks."
idiomSummary: "Pass context.Context as the first argument to any function that spawns goroutines; select on ctx.Done() alongside every blocking channel operation."
relatedSlugs: ["pipeline", "worker-pool", "fan-out-fan-in", "timeout-select"]
tags: [concurrency, channels, testability, state]
isFeatured: false
---

# Done Channel

A goroutine that nobody can stop is a goroutine leak. It consumes stack memory, holds open file descriptors, and may block goroutines downstream that are waiting on its output. The done channel pattern gives every goroutine a way to be told to stop — either by closing a dedicated `done` channel, or (the modern form) by cancelling a `context.Context`.

This is not a pattern you reach for occasionally. It is a discipline applied to every goroutine that isn't guaranteed to terminate on its own.

## Problem

A goroutine ranges over a channel, doing work and sending results. If the caller abandons the operation — because of a timeout, an error, or a user cancellation — the goroutine keeps running. It holds memory. It may hold a database connection. It blocks forever trying to send to a results channel that nobody is reading.

```go
// Leaks a goroutine if the caller stops reading from results.
func startWorker(jobs <-chan string) <-chan string {
    results := make(chan string)
    go func() {
        for job := range jobs {
            results <- "done:" + job // blocks forever if nobody reads
        }
    }()
    return results
}
```

## The original pattern: done channel

Before `context.Context` was standard, the idiom was a plain `done` channel. Closing `done` broadcasts to all goroutines selecting on it.

```go
package main

import "fmt"

func startWorker(done <-chan struct{}, jobs <-chan string) <-chan string {
	results := make(chan string)
	go func() {
		defer close(results)
		for {
			select {
			case job, ok := <-jobs:
				if !ok {
					return
				}
				select {
				case results <- "done:" + job:
				case <-done:
					return
				}
			case <-done:
				return
			}
		}
	}()
	return results
}

func main() {
	jobs := make(chan string, 3)
	jobs <- "job-1"
	jobs <- "job-2"
	jobs <- "job-3"
	close(jobs)

	done := make(chan struct{})
	results := startWorker(done, jobs)

	for r := range results {
		fmt.Println(r)
	}

	close(done)
}
```

Closing a channel is the right primitive here because a send would wake only one reader, but a close wakes all of them simultaneously.

## The modern form: context.Context

`context.Context` supersedes the raw done channel. It carries a deadline, a cancellation signal, and arbitrary values. Pass it as the first argument to any function that starts goroutines.

```go
package main

import (
	"context"
	"fmt"
)

func startWorker(ctx context.Context, jobs <-chan string) <-chan string {
	results := make(chan string)
	go func() {
		defer close(results)
		for {
			select {
			case job, ok := <-jobs:
				if !ok {
					return
				}
				select {
				case results <- "done:" + job:
				case <-ctx.Done():
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()
	return results
}

func main() {
	jobs := make(chan string, 3)
	jobs <- "job-1"
	jobs <- "job-2"
	jobs <- "job-3"
	close(jobs)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	for r := range startWorker(ctx, jobs) {
		fmt.Println(r)
	}
}
```

`defer cancel()` is idiomatic: even if the function returns normally, calling cancel cleans up the context's resources and sends the done signal to any goroutines still running.

## Propagating cancellation through a call chain

The power of `context.Context` is propagation. A parent context cancelled at the top of the call tree cancels every derived child context simultaneously.

```go
func (s *Server) HandleRequest(w http.ResponseWriter, r *http.Request) {
    // r.Context() is cancelled when the client disconnects.
    // Passing it down cancels all goroutines the handler spawns.
    ctx := r.Context()

    results, err := s.service.Process(ctx, parseRequest(r))
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    json.NewEncoder(w).Encode(results)
}

func (s *service) Process(ctx context.Context, req Request) ([]Result, error) {
    jobs := generateJobs(ctx, req)
    return collectResults(ctx, startWorker(ctx, jobs))
}
```

If the client disconnects mid-request, `r.Context()` is cancelled, which cancels `ctx`, which stops `startWorker`'s goroutine, which closes `jobs` via `generateJobs`, which causes the whole chain to unwind cleanly.

## Detecting goroutine leaks in tests

Use `goleak` to catch goroutines that survive beyond a test:

```go
import "go.uber.org/goleak"

func TestWorker(t *testing.T) {
    defer goleak.VerifyNone(t)

    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    jobs := make(chan Job, 1)
    results := startWorker(ctx, jobs)
    jobs <- Job{ID: "test"}
    close(jobs)

    for range results {} // drain
    // goleak will fail the test if any goroutines are still running
}
```

## When to Use

- Every goroutine that could outlive its caller — which is most goroutines.
- Any goroutine that blocks on a channel send or receive.
- Any goroutine that runs in a loop without a guaranteed natural exit.

## When Not to Use

- Short-lived goroutines that terminate immediately after doing a single piece of work with no blocking operations. The overhead of context plumbing is rarely worth it for `go func() { wg.Done() }()` style goroutines.

## Tradeoffs

The main cost is verbosity: every blocking operation needs a `select` with `ctx.Done()`. Forgetting one is a goroutine leak that doesn't show up until production. The benefit is that the cancellation model is explicit, composable, and testable. `context.WithTimeout` and `context.WithDeadline` give you time-based cancellation for free on top of the same mechanism.

## Related Patterns

- **Pipeline** — every stage's goroutine should select on `ctx.Done()` alongside its channel receive to prevent leaks when a consumer exits early.
- **Worker Pool** — the pool's workers need `ctx.Done()` to shut down gracefully before the jobs channel is exhausted.
- **Timeout and Select** — `context.WithTimeout` is the idiomatic way to add a deadline to any goroutine tree.
- **Errgroup** — uses context cancellation internally; calling `errgroup.WithContext` gives you a group-scoped context that cancels all goroutines on the first error.
