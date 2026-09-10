---
title: Synchronisation Patterns
description: The shared-memory side of threading in Godot — Mutex, Semaphore, and the disciplines that stand in for the primitives GDScript doesn't have.
---

Most Godot games never need a thread. Coroutines, signals, and deferred calls cover multi-frame logic on the main thread, and the [concurrency patterns](/patterns/concurrency) show how far that gets you. This section is for the moment it isn't enough: chunk generation, pathfinding over a large grid, serialising a save, parsing a network stream — work that would stall a frame, so it moves to a `Thread` or the `WorkerThreadPool`. The instant it does, two threads can touch the same memory, and everything here exists to make that safe.

## What Godot gives you, and what it doesn't

GDScript ships exactly two primitives: **`Mutex`** (`lock`, `unlock`, `try_lock`) and **`Semaphore`** (`post`, `wait`, `try_wait`). There is no read-write lock, no atomic integer, no condition variable, and no race detector. Every other language's toolbox item has a stand-in here, and knowing the mapping is half the job:

- A **read-write lock** becomes a [Snapshot](/patterns/synchronisation/snapshot): the writer publishes an immutable copy, readers never lock.
- An **atomic flag or counter** becomes a [Mutex](/patterns/synchronisation/mutex) around three lines, or not sharing at all. There is no lock-free write in GDScript, and a "harmless" `bool` across threads is still a race.
- A **condition variable** becomes a [Semaphore](/patterns/synchronisation/semaphore) posted once per change, usually wrapped in a [Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue).
- A **race detector** becomes a stress test you write yourself, plus the engine's debug thread guards — which catch nodes touched from the wrong thread, and nothing else. [Data Races](/patterns/synchronisation/data-races) draws that line precisely.

And one rule that is not a primitive but outranks all of them: **only the main thread touches the scene tree.** Nodes are never guarded by locks, because they are never shared. Workers compute values; the main thread applies them. That is [Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership), and the debug builds enforce it loudly.

## The building blocks

**[Mutex](/patterns/synchronisation/mutex)** — the general-purpose lock, bundled in a class with the data it guards. One thread in the critical section at a time. GDScript has no `defer`, so unlocking on every path is a discipline the page spells out. The default for any plain state a worker and the main thread both mutate.

**[Semaphore](/patterns/synchronisation/semaphore)** — a counted wake-up. A worker thread `wait()`s and sleeps at no cost; a producer `post()`s once per item and the worker wakes exactly that many times. Miss a post and the worker sleeps forever, which is the whole risk.

**[Snapshot](/patterns/synchronisation/snapshot)** — lock-free reads for state that is read constantly and rewritten rarely. The writer builds a fresh copy and swaps it in under a lock held for one assignment; readers hold their copy as long as they like.

**[Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership)** — the rule that keeps the scene tree out of every critical section. `call_deferred`, `call_thread_safe`, and `set_thread_safe` are the hand-offs; the page covers when each applies and why a shared flag isn't one.

**[Once](/patterns/synchronisation/once)** — lazy, exactly-once construction of expensive shared state with a `static var` and a static accessor, guarded by a Mutex when workers may race to trigger it. Permanent by design: no retry, no re-run.

**[Join](/patterns/synchronisation/join)** — waiting for a batch to finish with `wait_to_finish()` or `wait_for_group_task_completion()`, and polling `is_alive()` / `is_task_completed()` per frame so the wait never stalls the main thread. Coordinates *completion*; protects nothing.

**[Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue)** — Mutex plus Semaphore plus Array, assembled once into a class with `push`, `pop_blocking`, and `try_pop`. The standard hand-off between producers and consumers, with a capacity cap and a shutdown sentinel.

**[Data Races](/patterns/synchronisation/data-races)** — what a race is, why `count += 1` is three steps, what the debug guards do and don't catch, and how to reproduce a race deliberately in a GUT or gdUnit4 stress test.

## Where to start

**[Data Races](/patterns/synchronisation/data-races)** first. Every other page is a way to prevent what it describes, and it is where the engine's checks end and your discipline begins.

**[Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership)** second, because it is the rule you cannot opt out of. Get the hand-off plumbing right once and most threading bugs never get the chance to exist.

**[Mutex](/patterns/synchronisation/mutex)** and **[Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue)** are the workhorses. The queue is what you will actually write most often; the mutex is what it's made of, and what guards anything that doesn't fit a queue.

The rest — [Semaphore](/patterns/synchronisation/semaphore), [Snapshot](/patterns/synchronisation/snapshot), [Once](/patterns/synchronisation/once), [Join](/patterns/synchronisation/join) — are specialists for waking a sleeping worker, read-heavy state, one-time setup, and collecting a batch. Reach for each when its shape shows up, and reach for a plain `await` on the main thread before reaching for any of them.

---

Whichever primitive you pick, keep the thread-safety checks on in every debug build, and keep a stress test in the suite for every class that claims to be thread-safe. A race that passes a hundred runs is evidence; a race you reasoned about is a guess.
