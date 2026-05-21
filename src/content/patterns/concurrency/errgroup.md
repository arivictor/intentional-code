---
title: "Errgroup"
category: concurrency
intent: "Run a group of goroutines and collect their errors, automatically cancelling all goroutines if any one fails."
idiomSummary: "Use golang.org/x/sync/errgroup; call g.Go for each goroutine; call g.Wait to block until all complete and get the first non-nil error."
relatedSlugs: ["done-channel", "worker-pool", "fan-out-fan-in", "pipeline"]
tags: [concurrency, testability, interfaces, events]
isFeatured: false
---

# Errgroup

`errgroup` coordinates a group of goroutines that can fail. It collects errors from all goroutines and returns the first non-nil error. When used with `errgroup.WithContext`, it also cancels a shared context the moment any goroutine fails — stopping the rest of the group automatically.

This is the right tool for the pattern that looks like: "start N concurrent operations, wait for all to complete or any to fail, stop everything on the first failure."

## Problem

You need to fetch data from three services in parallel. If any fetch fails, you want to cancel the others and return immediately rather than waiting for the slow ones to time out.

```go
// Manual coordination — verbose and easy to get wrong.
var wg sync.WaitGroup
errs := make(chan error, 3)

wg.Add(3)
go func() { defer wg.Done(); if err := fetchUsers(ctx); err != nil { errs <- err } }()
go func() { defer wg.Done(); if err := fetchOrders(ctx); err != nil { errs <- err } }()
go func() { defer wg.Done(); if err := fetchProducts(ctx); err != nil { errs <- err } }()

wg.Wait()
close(errs)

// This doesn't cancel the other goroutines on first failure.
// It also doesn't propagate cancellation to fetchUsers et al.
for err := range errs {
    if err != nil {
        return err // returns only after all goroutines finish
    }
}
```

## Solution

`errgroup` with a derived context handles both concerns: collecting errors and cancelling on failure.

> **Setup**: `go mod init example && go get golang.org/x/sync/errgroup && go run main.go`

```go
package main

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

func fetchUsers(ctx context.Context) error {
	fmt.Println("fetched users")
	return nil
}

func fetchOrders(ctx context.Context) error {
	fmt.Println("fetched orders")
	return nil
}

func fetchProducts(ctx context.Context) error {
	fmt.Println("fetched products")
	return nil
}

func fetchAll(ctx context.Context) error {
	g, ctx := errgroup.WithContext(ctx)

	g.Go(func() error { return fetchUsers(ctx) })
	g.Go(func() error { return fetchOrders(ctx) })
	g.Go(func() error { return fetchProducts(ctx) })

	return g.Wait()
}

func main() {
	if err := fetchAll(context.Background()); err != nil {
		fmt.Println("error:", err)
	}
}
```

When any `g.Go` func returns an error:
1. `errgroup` cancels the derived `ctx`
2. The other goroutines receive `ctx.Done()` on their next blocking operation and return early
3. `g.Wait()` returns as soon as all goroutines have exited
4. The first non-nil error is returned to the caller

## Collecting results alongside errors

`errgroup` doesn't have a built-in results mechanism, but since `g.Go` closures can capture variables, you can collect results by writing to a pre-allocated slice (safe when each goroutine writes to its own index) or by using a mutex.

```go
package main

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

type User struct{ ID, Name string }

func fetchUser(ctx context.Context, id string) (User, error) {
	return User{ID: id, Name: "User-" + id}, nil
}

func fetchAll(ctx context.Context, ids []string) ([]User, error) {
	users := make([]User, len(ids))
	g, ctx := errgroup.WithContext(ctx)

	for i, id := range ids {
		i, id := i, id
		g.Go(func() error {
			u, err := fetchUser(ctx, id)
			if err != nil {
				return fmt.Errorf("fetching user %s: %w", id, err)
			}
			users[i] = u
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}
	return users, nil
}

func main() {
	users, err := fetchAll(context.Background(), []string{"u1", "u2", "u3"})
	if err != nil {
		fmt.Println("error:", err)
		return
	}
	for _, u := range users {
		fmt.Printf("%+v\n", u)
	}
}
```

Writing to `users[i]` is safe without a mutex because each goroutine writes to a distinct index. If goroutines need to append to a shared slice, protect it with a mutex or collect into a channel instead.

## Bounding concurrency with errgroup

`errgroup` can be combined with `SetLimit` (added in Go 1.21) to cap simultaneous goroutines, replacing the semaphore pattern when errgroup is already in use:

```go
g, ctx := errgroup.WithContext(ctx)
g.SetLimit(20) // at most 20 concurrent g.Go calls running at once

for _, url := range urls {
    url := url
    g.Go(func() error {   // blocks if 20 are already running
        return fetch(ctx, url)
    })
}

return g.Wait()
```

## When to Use

- You run multiple goroutines and want to return the first error.
- You want automatic cancellation of all goroutines when one fails.
- You'd otherwise write: a `WaitGroup` + an error channel + a context cancel call.

## When Not to Use

- You want all errors, not just the first. `errgroup` returns only the first non-nil error. If you need a full list, collect errors into a slice with a mutex.
- Goroutines should continue despite individual failures (e.g., process 1,000 items and log failures without stopping). Use a worker pool that writes errors to a results channel.
- You don't need cancellation. A bare `sync.WaitGroup` is simpler and has no dependency.

## Tradeoffs

`errgroup`'s cancellation is cooperative. The derived context is cancelled, but goroutines only stop when they check `ctx.Done()`. A goroutine that ignores context (a CPU-bound loop, a blocking syscall) will keep running until it finishes naturally. This means `g.Wait()` can block longer than expected after the first failure if goroutines aren't context-aware. The fix is to make all blocking operations select on `ctx.Done()` — which is good practice regardless of errgroup.

## Related Patterns

- **Done Channel** — the cancellation mechanism errgroup uses internally; understand it to know why goroutines must select on `ctx.Done()` to respond to errgroup cancellation.
- **Worker Pool** — for processing a stream of jobs where errors are per-job, not fatal to the whole group.
- **Fan-out / Fan-in** — errgroup is a cleaner replacement for a `WaitGroup` + error channel in fan-out scenarios.
- **Pipeline** — use errgroup to coordinate the goroutines in a pipeline where any stage failure should stop the whole pipeline.
