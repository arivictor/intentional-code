---
title: "Atomic"
description: "Lock-free reads and writes on a single integer, flag, or pointer with sync/atomic — the lightest fix for a race when the shared state is exactly one word."
---

# Atomic

**Buys lock-free, fastest protection when shared state is exactly one word; pays by being useless for multi-variable invariants — two atomics aren't one transaction.**

`sync/atomic` provides operations that the CPU guarantees to be indivisible: an atomic add, load, store, or compare-and-swap completes in one step that no other goroutine can interleave with. No lock, no critical section — just a single hardware-backed operation. When the shared state is exactly *one* thing — a counter, a flag, a pointer — atomics are the lightest and fastest way to make it safe. The moment you need to update two things together, atomics stop being enough and you want a [Mutex](/go/patterns/synchronisation/mutex).

Since Go 1.19 there are typed atomic wrappers — `atomic.Int64`, `atomic.Bool`, `atomic.Pointer[T]` — that are clearer and harder to misuse than the older free functions. Prefer them.

## Scenario

You've got the [counter race](/go/patterns/synchronisation/data-races) again: several goroutines incrementing one shared integer. A [Mutex](/go/patterns/synchronisation/mutex) fixes it, but for a single `int` a full lock is more machinery than the job needs — every increment pays lock/unlock overhead to protect one add:

```go
// WORKS, but heavy — a whole mutex to guard a single integer's increment.
mu.Lock()
counter++
mu.Unlock()
```

> **Smell:** Your critical section is exactly one operation on one machine word — an increment, a flag flip, a pointer swap — and the lock exists only to make that single operation indivisible. That's what atomics are for.

## Solution

Replace the `int` with an `atomic.Int64` and call `Add`. It's a single lock-free instruction, and the same 100 goroutines × 1000 increments always lands on `100000`:

```go:title="main.go":run=true:editable=true
package main

import (
	"fmt"
	"sync"
	"sync/atomic"
)

func main() {
	var counter atomic.Int64 // zero value is ready to use
	var wg sync.WaitGroup

	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 1000; j++ {
				counter.Add(1) // indivisible: no lock, no race
			}
		}()
	}

	wg.Wait()
	fmt.Println(counter.Load()) // always 100000
}
```

`counter.Add(1)` reads, adds, and writes back as one uninterruptible step, so the lost-update problem can't happen. `counter.Load()` reads the value atomically — you use it instead of touching the field directly, because even a plain read racing with an atomic write is undefined.

## Flags with atomic.Bool

A boolean that flips once — "have we started shutting down?", "is the cache warm?" — is the other everyday use. `atomic.Bool` makes the check-and-set safe across goroutines:

```go
var shuttingDown atomic.Bool

// In the signal handler:
shuttingDown.Store(true)

// In every worker loop:
if shuttingDown.Load() {
    return
}
```

For *exactly-once* actions (run this setup the first time anyone asks, never again), reach for [`sync.Once`](/go/patterns/synchronisation/once) instead — it handles the "wait until the first caller finishes initialising" case that a bare flag doesn't.

## Copy-on-write with atomic.Pointer

`atomic.Pointer[T]` swaps an entire value behind a single pointer, atomically. This is the lock-free way to hold read-heavy, replace-rarely state like configuration: readers do one atomic load, writers build a fresh value and swap it in. No reader ever takes a lock.

```go
type Config struct {
	Limit   int
	Upstream string
}

var current atomic.Pointer[Config]

func init() {
	current.Store(&Config{Limit: 100, Upstream: "a.internal"})
}

// Readers: one atomic load, zero contention.
func Current() *Config { return current.Load() }

// Writer: build a whole new Config, swap the pointer in one step.
func Reload(c *Config) { current.Store(c) }
```

The rule that makes this safe: the pointed-to `Config` is **immutable** once stored. Readers may be looking at the old value while a writer swaps in the new one — that's fine, because nobody mutates a `Config` in place; writers only ever replace the pointer. This often beats an [RWMutex](/go/patterns/synchronisation/rwmutex) for config, since reads become a bare load.

For "read it, compute a new version, store it only if nobody changed it underneath me", use `CompareAndSwap` in a retry loop — the foundation of lock-free algorithms.

## When to Use

- The shared state is a single integer, boolean, or pointer.
- A counter or flag on a hot path where mutex overhead shows up in a profile.
- Read-heavy state you replace wholesale — `atomic.Pointer` copy-on-write gives lock-free reads.
- Building a lock-free structure with `CompareAndSwap` (advanced; reach for it deliberately).

## When Not to Use

- You need to update more than one variable as a unit, or keep an invariant across several steps — that's a critical section; use a [Mutex](/go/patterns/synchronisation/mutex).
- The logic is "check a condition, then act on it" where the value can change between the check and the act — atomics don't give you that window; a mutex does.
- Readability matters more than the last few nanoseconds and the state is small — a `Mutex` is often easier for the next reader to verify than a clever atomic.

## Common Mistakes

**Mixing atomic and non-atomic access to the same variable.** If one goroutine does `counter.Add(1)` and another reads the field directly, the direct read is a race. *Every* access — read and write — must go through the atomic methods. The typed wrappers help by not exposing the raw value at all.

**Thinking two atomics make a safe transaction.** `if balance.Load() >= amount { balance.Add(-amount) }` is racy: another goroutine can drain the balance between the `Load` and the `Add`. Two atomic operations are not one atomic operation. When the check and the update must be inseparable, that's a `Mutex`, or a single `CompareAndSwap` loop — not two separate atomics.

**Using the old function API on a struct field.** The pre-1.19 functions (`atomic.AddInt64(&x, 1)`) require the variable to be 64-bit aligned, which isn't guaranteed for an `int64` field on 32-bit platforms and silently corrupts or panics. The `atomic.Int64` wrapper handles alignment for you — another reason to prefer the typed forms.

**Copying an atomic after use.** Like a `Mutex`, the typed atomics must not be copied once used (they embed a `noCopy` guard for `vet`). Pass pointers to structs that contain them.

## The Decision

**Atomic vs. Mutex.**
Count the things you're protecting. *One* word — an integer, a flag, a pointer — atomics, lock-free and fast. *More than one*, or an invariant that spans several statements — a mutex, because only a lock can make a multi-step section indivisible. The trap is stretching atomics to cover a transaction ("check then act") they can't actually make atomic; the result compiles, runs, and is subtly wrong. When in doubt, a mutex is never *wrong* — only sometimes heavier than necessary.

**atomic.Pointer vs. RWMutex for read-heavy state.**
For config and other replace-wholesale state, an `atomic.Pointer` swap gives readers a single lock-free load — faster than an [RWMutex](/go/patterns/synchronisation/rwmutex)'s shared lock under heavy read load — at the cost of rebuilding the entire value on every write and keeping it immutable. If writers mutate fields in place rather than swapping the whole object, you need a lock instead.

## Related Patterns

- **[Mutex](/go/patterns/synchronisation/mutex)**: the general fix when more than one word, or an invariant, is in play.
- **[RWMutex](/go/patterns/synchronisation/rwmutex)**: the lock-based alternative for read-heavy state; `atomic.Pointer` is the lock-free counterpart.
- **[Once](/go/patterns/synchronisation/once)**: for exactly-once initialisation, which a bare atomic flag can't express safely.
- **[Data Races](/go/patterns/synchronisation/data-races)**: the problem; this is the lightest fix when the state is a single word.
