---
title: Concurrency Patterns
description: The two halves of doing several things at once in Godot — coroutines on the main thread, and real threads that must hand their results back to it.
---

## What Are Concurrency Patterns?

Godot gives you two tools that both look like "do this in the background", and the first job of this section is to keep them apart.

The first is `await`. A function that awaits a signal or a timer becomes a coroutine: it suspends, the engine carries on running frames, and the function resumes when the thing it waited for happens. No thread is involved. Everything still runs on the main thread, one thing at a time, in an order you can read off the code. Most "concurrency" in a game — cutscenes, attack wind-ups, dialogue, loading screens, waiting for a network reply — is this, and needs nothing more.

The second is threads. `Thread`, `WorkerThreadPool`, `Mutex` and `Semaphore` give you real parallelism on other cores. They are for work that would otherwise stall a frame: pathfinding over a large grid, generating terrain chunks, serialising a big save, decompressing assets. They come with the full cost of shared-memory concurrency — data races, deadlocks, and one rule the engine enforces at runtime rather than at parse time.

## The main-thread rule

Only the main thread touches the scene tree. Not "should only" — in a debug build Godot checks, and a worker thread that reads a node's `position` or calls `add_child` gets an error, not a stale value. Nodes, their properties, signals whose handlers touch nodes, the scene-facing side of the physics and rendering servers: all main thread.

That rule shapes every threaded pattern here. A worker never receives a node; it receives copies of the numbers it needs. It never returns by touching a node; it returns by `call_deferred`, which queues the call for the main thread at the end of the frame step. The worker computes a value; the main thread applies it. [Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership) is the long version.

## When a game actually needs a thread

Reach for a thread when all three are true: the work takes longer than you can hide inside a frame budget; it can be expressed as a computation over data you can copy in; and the result can be applied later, on the main thread, in a step that is cheap. Chunk generation, pathfinding, image processing and save serialisation qualify. Spawning enemies, animating UI, and "waiting for the player" do not — those are `await`, or simply the same work spread over several frames under a time budget in `_process`.

Threads also aren't free on every platform. A web export may run without thread support at all, and a phone has fewer cores than your development machine. Every threaded system in these pages should have a single-threaded fallback that does the same work in smaller slices.

## The Building Blocks

**`await`** suspends the current function until a signal fires or a `SceneTreeTimer` runs out, then resumes it. `await get_tree().process_frame` waits one frame. Any function that contains `await` is a coroutine, and calling one without `await` returns at its first suspension point.

**`call_deferred` / `set_deferred`** queue a call or a property set to run at the end of the current frame step, on the main thread. They are the answer to "I can't change this here" (a collision shape mid-physics, a child during a parent's setup) and the hand-off from a worker thread back to the tree.

**`Thread`** is one OS thread you start, own, and must join with `wait_to_finish()` before it is freed. **`WorkerThreadPool`** is the engine's own fixed pool; `add_task` runs a Callable on it and `add_group_task` runs one over a range of indices. Prefer the pool for anything that finishes on its own.

**`Mutex` and `Semaphore`** are the only synchronisation primitives GDScript has. There is no atomic, no read-write lock, no condition variable. A mutex guards shared state; a semaphore wakes a sleeping thread. Every thread-safe structure in these pages is built from those two, and they are documented in the [Synchronisation](/patterns/synchronisation) family.

## Where to start

**[Coroutines](/patterns/concurrency/coroutines)** is the foundation and the one you'll use every day: `await` on signals and timers to write multi-frame logic as straight-line code. Read it first, because its gotchas — functions silently becoming coroutines, resuming on a freed node — show up in every other page.

**[Await and Timeouts](/patterns/concurrency/await-timeout)** puts a bound on any wait. A signal that never fires or a request that never returns leaves a coroutine suspended forever; racing it against a timer is the fix, and cleaning up the loser is the discipline.

**[Deferred Calls](/patterns/concurrency/call-deferred)** is the hand-off mechanism: to the end of the frame for tree changes the engine won't allow right now, and to the main thread from a worker. Its cost is an ordering you can't read from the code.

**[Worker Thread Pool](/patterns/concurrency/worker-thread-pool)** is where real threads start. One task on the engine's pool, a result copied back via `call_deferred`, never a node in sight.

**[Pipeline](/patterns/concurrency/pipeline)** overlaps stages — a threaded load, an instantiate, a placement — so a streaming world never stalls the frame. It's also where back-pressure becomes your problem.

**[Fan-out / Fan-in](/patterns/concurrency/fan-out-fan-in)** parallelises one slow stage across every core with `add_group_task`, then merges the results on the main thread.

**[Cancellation](/patterns/concurrency/cancellation)** is the discipline that stops threads and coroutines when the scene changes. Read it alongside whichever threaded pattern you adopt first, because a thread that outlives its scene is a crash on quit.

**[Competing Consumers](/patterns/concurrency/competing-consumers)** runs N worker threads against one shared request queue — the shape of a pathfinding service or a background save queue — built on a Mutex and a Semaphore.

---

These pages are about *flow*: when work runs, on which thread, and how the result gets home. The other half — the state that two threads genuinely share, and the locks that keep it correct — is the [Synchronisation patterns](/patterns/synchronisation), starting with [Data Races](/patterns/synchronisation/data-races). The two families are meant to be read together; a worker pool without a mutex around its results is a bug waiting for a particular frame.

[Observer (Signals)](/patterns/behavioral/observer) and [Event Queue](/patterns/architectural/event-queue) sit above both: signals are what coroutines wait on, and a queue is how a threaded system delivers events at a rate the main thread can absorb.
