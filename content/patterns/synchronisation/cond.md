---
title: "Cond"
description: "Make goroutines wait for a shared condition to become true with sync.Cond — rarely the right tool in Go, but the fit when many waiters watch one piece of state."
---

# Cond

**Buys efficient broadcast wakeups for many waiters on one predicate; pays by not composing with `select`, timeouts, or cancellation — a channel almost always wins.**

A `sync.Cond` lets goroutines wait until some condition over shared state becomes true, and lets another goroutine wake them when it changes. A waiter holds a lock, checks the condition, and if it's not satisfied calls `Wait` — which atomically releases the lock and parks the goroutine. When another goroutine changes the state, it calls `Signal` (wake one waiter) or `Broadcast` (wake all), and the parked goroutines re-acquire the lock and re-check.

Here's the honest framing up front: in Go, you usually don't want `sync.Cond`. A channel expresses "wait for something to happen" more clearly and composes with `select`, timeouts, and cancellation, none of which `Cond` does. `sync.Cond` earns its place in a narrow case — **many goroutines waiting on one shared condition**, where a channel would force you into awkward broadcast gymnastics. Know it exists, recognise the niche, and reach for a channel everywhere else.

## Scenario

You're building a bounded queue: producers add items, consumers remove them, capacity is capped. Consumers must *wait* when it's empty; producers must *wait* when it's full. Busy-waiting burns CPU spinning on a locked check:

```go
// BAD — spin-waiting: lock, check, unlock, repeat, pegging a CPU core for nothing.
for {
    q.mu.Lock()
    if len(q.items) > 0 {
        item := q.pop()
        q.mu.Unlock()
        return item
    }
    q.mu.Unlock() // nothing there; loop again immediately, burning cycles
}
```

> **Smell:** A goroutine loops re-checking a condition under a lock, with no blocking in between — a spin loop. It needs to *sleep until woken*, which is exactly what `Cond.Wait` (or a channel) provides.

## Solution

Give the queue two condition variables sharing one mutex — `notEmpty` for consumers, `notFull` for producers. A waiter loops on its condition calling `Wait`; the other side calls `Signal` when it changes the state. This bounded queue runs three consumers against a producer of 30 items and deterministically reports all 30 consumed, summing to 465:

```go:title="main.go":run=true:editable=true
package main

import (
	"fmt"
	"sync"
	"sync/atomic"
)

type Queue struct {
	mu       sync.Mutex
	notEmpty *sync.Cond
	notFull  *sync.Cond
	items    []int
	capacity int
	closed   bool
}

func NewQueue(capacity int) *Queue {
	q := &Queue{capacity: capacity}
	q.notEmpty = sync.NewCond(&q.mu) // both Conds share the one mutex
	q.notFull = sync.NewCond(&q.mu)
	return q
}

func (q *Queue) Push(v int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	for len(q.items) == q.capacity { // ALWAYS wait in a loop, never an if
		q.notFull.Wait()
	}
	q.items = append(q.items, v)
	q.notEmpty.Signal() // wake one waiting consumer
}

func (q *Queue) Pop() (int, bool) {
	q.mu.Lock()
	defer q.mu.Unlock()
	for len(q.items) == 0 && !q.closed {
		q.notEmpty.Wait()
	}
	if len(q.items) == 0 { // closed and drained
		return 0, false
	}
	v := q.items[0]
	q.items = q.items[1:]
	q.notFull.Signal() // wake one waiting producer
	return v, true
}

func (q *Queue) Close() {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.closed = true
	q.notEmpty.Broadcast() // wake EVERY consumer so they can see closed and exit
}

func main() {
	q := NewQueue(5)
	var wg sync.WaitGroup
	var count, total atomic.Int64

	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				v, ok := q.Pop()
				if !ok {
					return
				}
				count.Add(1)
				total.Add(int64(v))
			}
		}()
	}

	for v := 1; v <= 30; v++ {
		q.Push(v)
	}
	q.Close()

	wg.Wait()
	fmt.Println("consumed:", count.Load(), "sum:", total.Load()) // consumed: 30 sum: 465
}
```

Two non-negotiable rules of `Cond`:

- **Always `Wait` inside a `for` loop that re-checks the condition — never an `if`.** `Wait` can return without the condition being true: a `Broadcast` wakes everyone but only one can act, and spurious wakeups are permitted. Re-checking in a loop is the only correct way; an `if` will let a goroutine proceed on a false condition.
- **Hold the lock around `Wait`, `Signal`, and the state change.** `Wait` releases the lock while parked and re-acquires it before returning, so the check-wait-recheck cycle stays consistent. `Signal`/`Broadcast` should be called with the lock held (or carefully just after) so waiters don't miss the wakeup.

`Close` uses `Broadcast`, not `Signal`, because shutdown must wake *every* blocked consumer — `Signal` would wake one and leave the rest parked forever.

## When to Use

- Many goroutines wait on a single shared condition and must *all* be released when it changes — `Broadcast` is the natural fit and a channel would need an awkward close-and-replace dance.
- You're implementing a low-level concurrent data structure (a bounded buffer, a barrier) where the wait condition is a predicate over shared state, not a simple "value arrived".
- You've measured that a channel-based version is genuinely more complex for your specific many-waiters case.

## When Not to Use

- **Almost always.** If the situation is "wait for a value" or "wait for one event", a channel is clearer, composes with `select`, and supports timeouts and cancellation. Default to channels.
- You need a timeout or context cancellation on the wait — `Cond.Wait` can't be cancelled or timed out; a `select` on a channel and `ctx.Done()` can. This alone rules `Cond` out for most production code.
- One producer, one consumer, "hand off a value" — that's an unbuffered channel, full stop.

## Common Mistakes

**Using `if` instead of `for` around `Wait`.** The single most common `Cond` bug. After `Wait` returns, the condition may *not* hold — another goroutine may have raced in and consumed the state, or it was a spurious/broadcast wakeup. Re-check in a loop, every time.

**`Signal` when you needed `Broadcast`.** `Signal` wakes *one* waiter. If several waiters could now make progress (or all must exit on shutdown), `Signal` leaves the rest asleep. When in doubt, `Broadcast` is safe (just less efficient); `Signal` is an optimisation you use only when you're certain one waiter is enough.

**Changing the state without signalling.** A waiter parked in `Wait` only wakes on `Signal`/`Broadcast`. Mutate the condition's state and forget to signal, and the waiter sleeps forever. Every state change a waiter cares about must be followed by a wakeup.

**Signalling without holding the lock.** Calling `Signal`/`Broadcast` while not holding the associated mutex opens a window where a waiter checks the condition, finds it false, and parks *just after* your signal — missing the wakeup entirely (the "lost wakeup" race). Hold the lock across the state change and the signal.

**Copying the Cond, or the struct that holds it.** `sync.Cond` contains a `noCopy` and must not be copied after first use. Always pass `*Queue`, and create the `Cond` with `sync.NewCond(&q.mu)` so it points at the real mutex.

## The Decision

**Cond vs. channels.**
This is the whole decision, and it almost always lands on channels. A channel *is* a synchronised queue with built-in blocking; `select` gives you timeouts, cancellation, and waiting on several things at once — everything `Cond` lacks. The bounded queue above can be written as a buffered channel in a fraction of the code, and that's the version you should ship for the common case. `sync.Cond` wins only in the specific shape where *many goroutines wait on one predicate and must be released together*, and even then, weigh whether a "broadcast" via `close`-ing a `chan struct{}` (and swapping in a fresh one) is clearer for your team. Treat `Cond` as a specialist tool you'll rarely deploy — but understand it, because you'll meet it in standard-library and framework internals.

## Related Patterns

- **[Mutex](/go/patterns/synchronisation/mutex)**: a `Cond` is always paired with a mutex; you must understand the lock first.
- **[WaitGroup](/go/patterns/synchronisation/waitgroup)**: for "wait until N goroutines finish", which is *not* what `Cond` is for — different question.
- **[Timeout and Select](/go/patterns/concurrency/timeout-select)** and **[Pipeline](/go/patterns/concurrency/pipeline)**: the channel-based approach that replaces `Cond` in nearly every real case.
