---
title: Synchronisation Patterns
description: The shared-memory side of Go concurrency — mutexes, atomics, and the primitives that keep state correct when several goroutines touch it at once.
---

Go's [concurrency patterns](/go/patterns/concurrency) follow one slogan: *"Do not communicate by sharing memory; instead, share memory by communicating."* Channels first, shared state avoided. But Go fully supports the other model too, and sometimes it's the simpler one: several goroutines legitimately sharing a piece of state, coordinated by a lock. This section is that other half — the `sync` and `sync/atomic` primitives, and the [data race](/go/patterns/synchronisation/data-races) they exist to prevent.

## When channels, when locks

This is the question that routes you here versus to the concurrency patterns:

- **Use channels** to *transfer ownership* of data and to coordinate *flow* — a value moves from one goroutine to another, hand-off by hand-off. After the send, the sender doesn't touch it. The channel patterns ([pipeline](/go/patterns/concurrency/pipeline), [worker pool](/go/patterns/concurrency/worker-pool), [fan-out/fan-in](/go/patterns/concurrency/fan-out-fan-in)) are built on this.
- **Use a lock** to *protect* a piece of state that several goroutines genuinely share and all need to read and write in place — a counter, a cache, a config struct, a map of sessions. Routing every access to such state through a channel and a single owner goroutine is often more machinery than a small mutex around the state.

Neither is a code smell. Picking the wrong one for the job is. A counter incremented from ten goroutines is a mutex or an atomic, not a channel. A stream of jobs flowing through stages is channels, not a shared slice under a lock.

## The building blocks

**`sync.Mutex`** — the general-purpose lock. One goroutine in the critical section at a time. The default fix for any shared state bigger than a single machine word. Start [here](/go/patterns/synchronisation/mutex).

**`sync.RWMutex`** — a mutex that lets many readers run in parallel and writers go exclusive. Pays off for read-heavy, contended state; otherwise heavier than a plain `Mutex`. See [RWMutex](/go/patterns/synchronisation/rwmutex).

**`sync/atomic`** — lock-free operations on a single integer, boolean, or pointer. The lightest fix when the shared state is exactly one word. See [Atomic](/go/patterns/synchronisation/atomic).

**`sync.Once`** — run an initialiser exactly once, no matter how many goroutines race to trigger it. Lazy, thread-safe setup. See [Once](/go/patterns/synchronisation/once).

**`sync.WaitGroup`** — wait until a set of goroutines finishes. Coordinates *completion*, not access — it does **not** protect shared memory. See [WaitGroup](/go/patterns/synchronisation/waitgroup).

**`sync.Pool`** — reuse short-lived objects to cut GC pressure on hot paths. A performance tool, not a correctness one. See [Pool](/go/patterns/synchronisation/pool).

**`sync.Cond`** — wait for a shared condition to become true. Rarely the right tool in Go (a channel usually wins), but the fit when many goroutines wait on one predicate. See [Cond](/go/patterns/synchronisation/cond).

## Where to start

**[Data Races](/go/patterns/synchronisation/data-races)** is the foundation. What a race actually is, why `counter++` isn't atomic, and how the `-race` detector finds them. Read this first — every other page here is a way to prevent what this page describes.

**[Mutex](/go/patterns/synchronisation/mutex)** is the workhorse. Bundle a lock with the data it guards and expose access only through methods. When in doubt about shared state, this is the correct default.

**[Atomic](/go/patterns/synchronisation/atomic)** is the lightweight alternative when the shared state is a single counter, flag, or pointer — lock-free and fast.

**[WaitGroup](/go/patterns/synchronisation/waitgroup)** is how you wait for a batch of goroutines to finish before using their results. You'll use it constantly, often alongside one of the locks above.

The rest — [RWMutex](/go/patterns/synchronisation/rwmutex), [Once](/go/patterns/synchronisation/once), [Pool](/go/patterns/synchronisation/pool), [Cond](/go/patterns/synchronisation/cond) — are specialists for read-heavy state, one-time setup, allocation pressure, and condition-waiting respectively. Reach for them when their specific situation shows up.

---

Whichever primitive you choose, verify it: run your tests under the race detector (`go test -race ./...`). It has no false positives, and it catches the interleaving bugs you cannot find by reading code.
