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

The done channel pattern gives goroutines a way to stop when their work is no longer needed. A goroutine that outlives its caller is a goroutine leak: it holds memory, may hold resources, and can block other goroutines waiting on its output. The done channel pattern signals goroutines to exit by closing a shared `done` channel or (the modern form) by cancelling a `context.Context`.

Apply this to any goroutine that isn't guaranteed to terminate on its own.

## Scenario

A goroutine ranges over a channel, does work, and sends results. If the caller abandons the operation because of a timeout, an error, or a user cancellation, the goroutine keeps running. It still holds memory. It may still hold a database connection. It can block forever trying to send on a results channel that nobody is reading.

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

Before `context.Context` became standard, the idiom was a plain `done` channel. Closing `done` broadcasts the signal to every goroutine selecting on it.

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

Closing a channel is the right primitive here because a send wakes one reader, while a close wakes all of them at once.

## The modern form: context.Context

`context.Context` replaced the raw done channel for most code. It carries a deadline, a cancellation signal, and arbitrary values. Pass it as the first argument to any function that starts goroutines.

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

`defer cancel()` is the right default. Even when the function returns normally, it releases the context's resources and signals any goroutines that are still running.

## Propagating cancellation through a call chain

`context.Context` matters because cancellation propagates. Cancel a parent context at the top of the call tree and every derived child context is cancelled too.

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

If the client disconnects mid-request, `r.Context()` is cancelled. That cancels `ctx`, stops `startWorker`, closes `jobs` through `generateJobs`, and lets the whole chain unwind cleanly.

## Detecting goroutine leaks in tests

Use `goleak` to catch goroutines that survive past the end of a test:

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

- Every goroutine that could outlive its caller, which is most goroutines.
- Any goroutine that blocks on a channel send or receive.
- Any goroutine that runs in a loop without a guaranteed natural exit.

## When Not to Use

- Short-lived goroutines that terminate immediately after doing a single piece of work with no blocking operations. The overhead of context plumbing is rarely worth it for `go func() { wg.Done() }()` style goroutines.

## The Decision

The cost is verbosity: every blocking operation needs a `select` with `ctx.Done()`. Miss one and you've introduced a goroutine leak that may not show up until production. In return, cancellation stays explicit, composable, and testable. `context.WithTimeout` and `context.WithDeadline` give you time-based cancellation on top of the same mechanism.

## Related Patterns

- **Pipeline**: every stage's goroutine should select on `ctx.Done()` alongside its channel receive to prevent leaks when a consumer exits early.
- **Worker Pool**: the pool's workers need `ctx.Done()` to shut down gracefully before the jobs channel is exhausted.
- **Timeout and Select**: `context.WithTimeout` is the idiomatic way to add a deadline to any goroutine tree.
- **Errgroup**: uses context cancellation internally; calling `errgroup.WithContext` gives you a group-scoped context that cancels all goroutines on the first error.
