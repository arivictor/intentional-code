---
title: "Mutex"
description: "Protect shared state with a sync.Mutex so only one goroutine enters the critical section at a time — the default tool for any data touched by more than one goroutine."
---

# Mutex

A `sync.Mutex` is a lock. One goroutine holds it at a time; everyone else who calls `Lock()` waits until the holder calls `Unlock()`. The stretch of code between `Lock` and `Unlock` — the **critical section** — runs as if it were single-threaded, which is exactly what you need when several goroutines read and write the same data. It's the most general fix for a [data race](/go/patterns/synchronisation/data-races): when in doubt, a mutex is correct.

## Scenario

You have a value that more than one goroutine updates — a counter, a cache, a map of sessions. A plain field is a race. Reaching for a `Mutex` is right, but the *placement* of the lock is where people slip:

```go
// BAD — the lock and the data it protects are separate, unrelated variables.
var sessions = map[string]Session{}
var mu sync.Mutex

// Nothing forces a caller to hold mu before touching sessions.
// Six months later, someone writes to sessions without the lock and it compiles fine.
```

> **Smell:** A `sync.Mutex` lives next to the data it guards but nothing *binds* them. If a reader of your code can't tell which lock protects which field, neither can the next person who adds a method — and they'll forget the lock.

## Solution

Bundle the mutex with the data it protects inside a struct, and expose access only through methods that take the lock. Now the lock isn't optional — it's the only door in. This program hammers a shared counter with 100 goroutines and always prints `100000`:

```go:title="main.go":run=true:editable=true
package main

import (
	"fmt"
	"sync"
)

// Counter bundles the mutex with the value it protects. Callers can only
// reach `value` through methods that take the lock, so the lock can't be
// forgotten.
type Counter struct {
	mu    sync.Mutex
	value int
}

func (c *Counter) Inc() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.value++
}

func (c *Counter) Value() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.value
}

func main() {
	var c Counter
	var wg sync.WaitGroup

	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 1000; j++ {
				c.Inc()
			}
		}()
	}

	wg.Wait()
	fmt.Println(c.Value()) // always 100000
}
```

Two details make this solid:

- **`defer c.mu.Unlock()` right after `Lock()`.** The unlock fires however the method returns — normal return, early return, or panic. Without `defer`, an early return or a panic mid-section leaves the mutex locked forever and the next caller deadlocks.
- **Reads take the lock too.** `Value()` looks harmless, but reading `value` while another goroutine writes it is still a race. Every access to guarded data — read *and* write — goes through the lock.

## Guarding a map

A map is the classic thing to wrap, because concurrent map writes crash the runtime outright (`fatal error: concurrent map writes`). The pattern is identical — lock around every operation:

```go
type SafeMap struct {
	mu sync.Mutex
	m  map[string]int
}

func NewSafeMap() *SafeMap {
	return &SafeMap{m: make(map[string]int)}
}

func (s *SafeMap) Set(k string, v int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.m[k] = v
}

func (s *SafeMap) Get(k string) (int, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v, ok := s.m[k]
	return v, ok
}
```

If your map is read far more than it's written, the [RWMutex](/go/patterns/synchronisation/rwmutex) lets readers run in parallel. For a write-heavy map, a plain `Mutex` like this is the right call.

## Reducing contention: striped locks

A single mutex serialises *everything*. If a million operations a second all funnel through one lock, the lock itself becomes the bottleneck — goroutines spend their time waiting, not working. **Lock striping** splits the data into N shards, each with its own mutex, so unrelated keys don't block each other:

```go
type StripedMap struct {
	shards [16]struct {
		mu sync.Mutex
		m  map[string]int
	}
}

func (s *StripedMap) shard(key string) *struct {
	mu sync.Mutex
	m  map[string]int
} {
	h := fnv32(key) % uint32(len(s.shards))
	return &s.shards[h]
}
```

A write to key `"a"` and a write to key `"b"` likely land on different shards and proceed in parallel. Striping only helps when access spreads across keys — if every goroutine hammers the same hot key, they still collide on that shard's lock. Measure before adding the complexity; most maps are nowhere near the contention where this pays off.

## When to Use

- Any data structure touched by more than one goroutine where the access is more than a single machine word (a struct, a map, a slice, a multi-field invariant).
- A critical section that must stay consistent across several statements — "read the balance, check it, then subtract" must be one atomic step, which a mutex gives you and an [atomic](/go/patterns/synchronisation/atomic) does not.
- You want the simplest thing that's obviously correct. A mutex is harder to get subtly wrong than lock-free code.

## When Not to Use

- The shared state is a single integer, flag, or pointer — [`sync/atomic`](/go/patterns/synchronisation/atomic) is lighter and lock-free.
- The data is read constantly and written rarely — an [RWMutex](/go/patterns/synchronisation/rwmutex) lets readers run concurrently.
- You can avoid sharing entirely by passing data through channels — prefer that; no lock means no deadlock. See the [concurrency patterns](/go/patterns/concurrency).

## Common Mistakes

**Forgetting to unlock on an early return.** Any `return`, `break`, or `panic` between `Lock()` and a manual `Unlock()` skips the unlock and deadlocks the next caller. `defer mu.Unlock()` immediately after `Lock()` makes this impossible. Only drop the `defer` when you've measured that the deferred-call overhead matters and the critical section has exactly one exit.

**Copying a mutex.** A `sync.Mutex` must not be copied after first use — a copy has its own independent lock state, so two goroutines "locking" what they think is the same mutex actually lock different ones. This is why methods that touch the lock take a pointer receiver (`func (c *Counter)`), and why you pass `*Counter`, never `Counter`, around. `go vet` catches most copies.

**Holding the lock during slow work.** A mutex held across a network call or disk I/O serialises every other goroutine behind that latency. Take the lock, grab or update what you need, release it, *then* do the slow work. Keep critical sections short.

**Locking at the wrong granularity.** One lock for an entire large struct means an update to field A blocks a read of unrelated field B. If that contention shows up in a profile, split into finer-grained locks (or stripe). But start coarse — one lock is easy to reason about, and most code never hits the contention that justifies splitting.

**Recursive locking.** `sync.Mutex` is not reentrant. If a method holding the lock calls another method that tries to take the *same* lock, it deadlocks against itself. Structure your code so locked methods call only lock-free helpers.

## The Decision

**Mutex vs. atomic.**
If the shared state is exactly one integer, pointer, or boolean, [`sync/atomic`](/go/patterns/synchronisation/atomic) does the job lock-free and faster. The moment you need to update *two* things together, or keep an invariant across several statements ("if balance ≥ amount, subtract amount"), atomics can't help — the check and the update would be two separate atomic operations with a race in the gap. That's a critical section, and a critical section needs a mutex.

**Mutex vs. RWMutex.**
An [RWMutex](/go/patterns/synchronisation/rwmutex) allows many concurrent readers, which sounds strictly better but isn't: it's a heavier lock, and if your workload isn't genuinely read-dominated and contended, the extra bookkeeping makes it *slower* than a plain `Mutex`. Default to `Mutex`. Switch to `RWMutex` only when a profile shows readers contending on a lock that writes rarely touch.

**Mutex vs. channels.**
The Go proverb says *share memory by communicating*, but a mutex around a small piece of shared state is often simpler and clearer than routing every access through a goroutine and channel. Use channels for *transferring ownership* of data and for coordinating *flow*; use a mutex for *protecting* a piece of state that several goroutines legitimately share. Neither is a code smell — picking the wrong one for the job is.

## Related Patterns

- **[Data Races](/go/patterns/synchronisation/data-races)**: the problem a mutex solves; start there if "critical section" isn't yet second nature.
- **[RWMutex](/go/patterns/synchronisation/rwmutex)**: the read-optimised variant for read-heavy state.
- **[Atomic](/go/patterns/synchronisation/atomic)**: lighter, lock-free protection for a single word of state.
- **[Once](/go/patterns/synchronisation/once)**: built on a mutex internally; the right tool when the critical section is one-time initialisation.
- **[Singleton](/go/patterns/creational/singleton)**: uses a mutex (or `Once`) to make lazy construction safe under concurrency.
