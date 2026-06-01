---
title: "Click Analytics"
order: 2
description: "Count clicks without slowing redirects: a fixed worker pool drains a buffered channel of click events while the hot path returns instantly."
---

## The Hot Path Stays Hot

We want to know how often each link is clicked. The naive version increments a counter inside the redirect handler:

```go
s.counts[code]++ // on the single hottest path in the service
http.Redirect(w, r, link.URL, http.StatusFound)
```

That one line is a trap. The redirect is the most-hit route we have, and now every click contends on a shared lock — or worse, once counts are persisted, *waits on a disk write* before the user is sent on their way. Side-work has crept onto the critical path, and the symptom is a redirect that's fast in the demo and slow under load.

The principle: **the redirect should do the absolute minimum, and counting is not minimum.** So we move counting *off* the request path. The handler fires the click into a buffered channel and returns immediately; a pool of background goroutines does the actual counting. This is the [Worker Pool pattern](/go/patterns/concurrency/worker-pool) — a fixed set of workers fanning out across a shared queue of work.

## A Pool of Counters

The analytics component owns a buffered channel of click events and a fixed number of workers draining it:

```go
package shortener

import (
	"sync"
	"sync/atomic"
)

// Analytics counts clicks off the request path. Handlers fire-and-forget a
// code into a buffered channel; a fixed pool of workers drains it. The
// redirect never blocks on counting.
type Analytics struct {
	events  chan string
	wg      sync.WaitGroup
	dropped atomic.Uint64 // events shed because the buffer was full

	mu     sync.Mutex
	counts map[string]int64
}

func NewAnalytics(workers, buffer int) *Analytics {
	a := &Analytics{
		events: make(chan string, buffer),
		counts: make(map[string]int64),
	}
	a.wg.Add(workers)
	for i := 0; i < workers; i++ {
		go a.worker()
	}
	return a
}

// worker drains events until the channel is closed, then exits — which is
// how a clean shutdown drains the backlog before the process stops.
func (a *Analytics) worker() {
	defer a.wg.Done()
	for code := range a.events {
		a.mu.Lock()
		a.counts[code]++
		a.mu.Unlock()
	}
}
```

The `for code := range a.events` loop is the entire worker. It blocks when the channel is empty, wakes when work arrives, and — crucially — *ends* when the channel is closed. That last property is what lets us drain cleanly on shutdown, which the next chapter relies on.

## Fire-and-Forget, Without Blocking

The hook the redirect calls must never block — not even when the buffer is full and workers are behind. A `select` with a `default` case makes the send non-blocking:

```go
// Record hands a click to the workers. If the buffer is full it drops the
// event rather than slow the redirect: analytics are best-effort, redirects
// are not. That tradeoff is the whole design in one method.
func (a *Analytics) Record(code string) {
	select {
	case a.events <- code:
		// queued
	default:
		a.dropped.Add(1) // shed load instead of blocking the caller
	}
}

func (a *Analytics) Count(code string) int64 {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.counts[code]
}

func (a *Analytics) Dropped() uint64 { return a.dropped.Load() }
```

The `default` branch is the design decision made explicit. Under a traffic spike big enough to fill the buffer *and* outrun the workers, we drop click events — and that is the correct choice. A dropped analytics event costs you a slightly-off number; a blocked redirect costs a user a slow page. We protect the thing that matters and instrument the thing we sacrificed via the `dropped` counter, so the loss is visible rather than silent.

The redirect handler gains exactly one line, and it returns instantly:

```go
func (s *Server) handleRedirect(w http.ResponseWriter, r *http.Request) error {
	code := r.PathValue("code")
	link, err := s.svc.Resolve(code)
	if errors.Is(err, ErrNotFound) {
		return notFound("no link exists for code " + code)
	}
	if err != nil {
		return err
	}
	s.analytics.Record(code) // fire-and-forget — does not touch the lock or disk
	http.Redirect(w, r, link.URL, http.StatusFound)
	return nil
}
```

(`Server` now carries an `*Analytics`, supplied in `NewServer` — the same dependency-injection shape as the `Service` and `baseURL`.)

## Why a Pool, Not a Goroutine Per Click

A reasonable instinct is to skip the channel and just write `go func() { count(code) }()` on each click. It even looks simpler. It fails under exactly the load you built this for: a million clicks a minute spawns a million goroutines racing on one lock, and goroutine count — and memory — climbs without limit. **The pool's fixed size is the feature.** Ten workers means at most ten counts happen at once and at most a bounded buffer of pending work exists, no matter how hard the front door is hit. You've converted unbounded concurrency into bounded, predictable throughput. That bounding is precisely what separates a worker pool from "just start a goroutine."

If lock contention among the workers ever shows up in a profile, the next move is batching: a worker pulls *many* events, tallies them in a local map, and takes the shared lock once per batch. The channel makes that change local to `worker` — the redirect path doesn't change at all. (Draining many items at once like this is the [Fan-out / Fan-in](/go/patterns/concurrency/fan-out-fan-in) shape: many producers, a pool of consumers, one aggregated result.)

## Draining on Shutdown

Buffered events still in the channel when the process exits are lost unless we drain them. `Close` stops new work and waits for the workers to finish the backlog:

```go
// Close stops accepting events and blocks until workers drain the buffer.
// Call it during graceful shutdown, after the HTTP server has stopped
// accepting requests (so no new events arrive mid-drain).
func (a *Analytics) Close() {
	close(a.events) // workers' range loops will end once the buffer empties
	a.wg.Wait()     // wait for every in-flight and buffered event to be counted
}
```

Closing the channel makes every worker's `range` loop terminate *after* it has consumed what's buffered, and `wg.Wait` blocks until all of them return. The ordering matters — stop the HTTP server first so `Record` isn't called after `close`, since sending on a closed channel panics. That sequencing is exactly what the next chapter's graceful shutdown orchestrates.

## Tradeoffs

This is deliberately a best-effort, single-node analytics pipeline. The honest limits:

- **Drops under extreme load.** By design — see the `default` branch. Size the buffer and worker count for your peak, and watch `Dropped()`; a non-zero value is your signal to tune.
- **Counts vanish on restart.** They live in memory. Persisting them (periodically flushing the map to the same kind of append-only log we built for links) is a natural extension, left out to keep the pool the focus.
- **No exactly-once.** A dropped event is simply uncounted. For billing you'd need durability and acknowledgement; for "roughly how popular is this link," approximate is fine, and approximate is what we built.

The pattern underneath — *push slow or bursty work onto a bounded background pool and return the fast path immediately* — is one you'll reuse far beyond click counting: sending emails, writing audit logs, warming caches. Anything that doesn't have to finish before you answer the user.

## What's Next

The service is hardened: abuse is throttled, and analytics ride a background pool instead of dragging the redirect. What's left is everything around the edges of a real deployment — reading configuration from the environment, and shutting down without dropping in-flight requests or that buffer of un-drained clicks. That's the final chapter: [Production](/go/philosophy/twelve-factor).
