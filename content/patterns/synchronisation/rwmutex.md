---
title: "RWMutex"
description: "Let many goroutines read shared state in parallel while writers get exclusive access — the right lock for data that's read constantly and written rarely."
---

# RWMutex

A `sync.RWMutex` is a lock with two modes. Any number of goroutines can hold the **read** lock at the same time, but the **write** lock is exclusive — while a writer holds it, no readers and no other writers get in. The payoff is parallel reads: if your data is read far more often than it's written, readers stop queuing behind each other and only block during the rare write. For read-heavy shared state — configuration, caches, routing tables — this can be a real throughput win over a plain [Mutex](/go/patterns/synchronisation/mutex).

The catch: an `RWMutex` is heavier than a `Mutex`. It only pays off when reads genuinely dominate *and* the lock is contended. Otherwise the extra bookkeeping makes it the slower choice.

## Scenario

You have configuration that's read on every single request — feature flags, rate limits, upstream addresses — and reloaded only when an operator pushes a change, maybe once an hour. A plain `Mutex` makes every request serialise on the lock even though they're all just reading:

```go
// SUBOPTIMAL — every reader blocks every other reader, though none of them mutate.
func (c *Config) Limit() int {
    c.mu.Lock()         // a plain Mutex: exclusive even for a read
    defer c.mu.Unlock()
    return c.limit
}
```

> **Smell:** A lock is taken thousands of times a second, almost always to *read*, and the writes that change the data are rare and bursty. Every reader is waiting on every other reader for no reason — they don't conflict with each other, only with the occasional writer.

## Solution

Swap `sync.Mutex` for `sync.RWMutex`. Readers call `RLock()` / `RUnlock()` and run concurrently; the writer calls `Lock()` / `Unlock()` for exclusive access. This program runs 50 readers flat-out against a config that a single writer reloads 5 times, then prints the final value deterministically:

```go:title="main.go":run=true:editable=true
package main

import (
	"fmt"
	"sync"
)

// Config is read on every request and reloaded rarely. RWMutex lets all the
// readers run in parallel; the writer briefly takes exclusive access to swap.
type Config struct {
	mu    sync.RWMutex
	limit int
}

func (c *Config) Limit() int {
	c.mu.RLock()         // shared: many readers at once
	defer c.mu.RUnlock()
	return c.limit
}

func (c *Config) Reload(newLimit int) {
	c.mu.Lock()          // exclusive: blocks all readers and writers
	defer c.mu.Unlock()
	c.limit = newLimit
}

func main() {
	cfg := &Config{limit: 100}
	var wg sync.WaitGroup

	// 50 readers, each reading the limit 1000 times in parallel.
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 1000; j++ {
				_ = cfg.Limit()
			}
		}()
	}

	// One writer reloads the config a handful of times.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for n := 1; n <= 5; n++ {
			cfg.Reload(100 + n*10)
		}
	}()

	wg.Wait()
	fmt.Println("final limit:", cfg.Limit()) // final limit: 150
}
```

The reader methods take `RLock`; the writer takes `Lock`. While `Reload` holds the write lock, every reader waits — but that window is tiny and rare, so in aggregate the readers spend almost all their time running side by side.

## Copy-on-write: an even lighter alternative

When reads vastly outnumber writes and you want readers to take *no lock at all*, store the data behind an atomic pointer and replace it wholesale on write. Readers load the current pointer; writers build a brand-new value and swap it in. See [Atomic](/go/patterns/synchronisation/atomic) for the full pattern — it's often the better choice for config specifically, because a read becomes a single atomic load with zero contention.

`RWMutex` sits between a plain `Mutex` (simple, fully serialised) and copy-on-write (lock-free reads, but you rebuild the whole value on every write). Reach for `RWMutex` when readers need a lock but you want them to share it.

## When to Use

- Reads outnumber writes by a wide margin (think 10:1 or more) and the lock is hot.
- Read operations are long enough that running them in parallel actually matters — a read that copies a slice or walks a map, not a read that returns a single `int`.
- The data is too large or too structured for an [atomic](/go/patterns/synchronisation/atomic) pointer swap to be convenient.

## When Not to Use

- Reads and writes are roughly balanced, or the lock is barely contended — use a plain [Mutex](/go/patterns/synchronisation/mutex); it's simpler and, in the uncontended case, faster.
- The critical section is a single-word read — use [`sync/atomic`](/go/patterns/synchronisation/atomic).
- The read work is trivially short. The overhead of `RLock`/`RUnlock` can exceed the read itself, and you'd have been faster with a `Mutex` or an atomic.

## Common Mistakes

**Writing while holding only the read lock.** `RLock` permits concurrent readers; if you mutate under it, those readers see a torn write — a race. Any modification needs the full `Lock()`. If you discover mid-read that you need to write, you must release the read lock and acquire the write lock (the two are not upgradable in Go), and re-check your assumptions, since the state can change in the gap.

**Assuming RWMutex is always faster than Mutex.** It isn't. The read/write bookkeeping has real cost, and under low contention or a balanced read/write mix a plain `Mutex` wins. Don't switch on a hunch — switch when a profile shows readers contending on a write-rare lock.

**Calling a write method from inside a read-locked section.** Same reentrancy trap as `Mutex`: if a method holding `RLock` calls a method that takes `Lock` (or even `RLock` again, in some deadlock scenarios with a pending writer), you can deadlock. Keep locked sections free of calls back into the locked type.

**Holding the read lock during slow work.** A long-held read lock blocks writers, and a blocked writer can in turn block *new* readers (Go's `RWMutex` prevents writer starvation by queuing readers behind a waiting writer). Read out what you need, release, then do the slow part.

## The Decision

**RWMutex vs. Mutex.**
Default to `Mutex`. It's simpler, and for the common case — short critical sections, moderate contention — it's as fast or faster. Move to `RWMutex` only with evidence: a profile showing a lock that's read overwhelmingly more than written, with readers actually contending. The mental model: `RWMutex` trades a higher per-operation cost for the ability to run reads in parallel. That trade only wins when there are many parallel reads to be had.

**RWMutex vs. copy-on-write with atomics.**
For read-dominated state that you replace wholesale — a config struct, a routing table — an [`atomic.Pointer`](/go/patterns/synchronisation/atomic) swap gives readers a lock-free load, which beats even an `RWMutex`'s shared lock under heavy read load. The cost is that every write rebuilds the entire value, so it fits *replace* better than *mutate in place*. If readers need a lock and writers mutate fields rather than swapping the whole object, `RWMutex` is the better fit.

## Related Patterns

- **[Mutex](/go/patterns/synchronisation/mutex)**: the simpler default; reach for `RWMutex` only when reads dominate and contend.
- **[Atomic](/go/patterns/synchronisation/atomic)**: copy-on-write via `atomic.Pointer` gives lock-free reads for replace-wholesale state.
- **[Data Races](/go/patterns/synchronisation/data-races)**: why reads need a lock at all, not just writes.
