---
title: Concurrency Patterns
lede: Patterns for goroutines, channels, and coordinated concurrent work — the building blocks of Go's concurrency model.
---

Go's concurrency model is built on two primitives: goroutines and channels. Goroutines are cheap, independently-scheduled functions. Channels are typed conduits that let goroutines communicate and synchronise without shared memory. The language slogan captures the philosophy: *"Do not communicate by sharing memory; instead, share memory by communicating."*

These primitives are powerful and composable, but raw goroutines have failure modes that aren't obvious at first. Goroutines can leak — run forever because nothing signals them to stop. Channels can block forever when their sender or receiver exits early. Panics in goroutines kill the whole process if unrecovered. The patterns in this section are the established idioms for avoiding those failure modes and building concurrent systems that are correct, bounded, and cancellable.

## The building blocks

**Goroutines** are the unit of concurrency. Spawning one is as cheap as a function call — Go programs routinely run thousands. The cost of getting them wrong is also low-friction, which is why discipline around their lifecycle matters.

**Channels** are the synchronisation mechanism. An unbuffered channel forces sender and receiver to meet — it's a handshake. A buffered channel allows the sender to proceed without waiting, up to the buffer size. Choosing the wrong kind is a common source of subtle bugs and deadlocks.

**`select`** multiplexes channel operations. It waits until one of several channel operations can proceed, then executes it. With a `default` case, it becomes non-blocking. With a done channel or `context.Done()`, it becomes cancellable.

**`sync.WaitGroup`** coordinates goroutine completion without channels. Use it when you launch N goroutines and need to wait for all of them to finish, but don't need to stream results back.

**`context.Context`** is the standard cancellation carrier. Pass it as the first argument to any function that starts goroutines or performs I/O. When the context is cancelled, everything downstream should stop.

## Goroutine lifecycle discipline

Every goroutine you start must have a clear answer to three questions:

1. **How does it stop?** Via a done channel, context cancellation, or channel close.
2. **Who owns it?** The spawning function is responsible for ensuring it exits.
3. **What happens if it panics?** Unrecovered panics crash the process — use `defer recover()` in long-running goroutines.

If you can't answer these questions, the goroutine will eventually leak.

## Where to start

**[Pipeline](/go/patterns/concurrency/pipeline)** is the foundation — data flowing through goroutine stages connected by channels. Understanding pipeline gives you the mental model for all the other patterns.

**[Worker Pool](/go/patterns/concurrency/worker-pool)** is the most common pattern in production Go code. A fixed number of goroutines processing a shared job queue. Start here when you need bounded concurrency.

**[Fan-out / Fan-in](/go/patterns/concurrency/fan-out-fan-in)** distributes work across goroutines and collects results. The natural extension of Pipeline when a single stage needs parallelism.

**[Done Channel](/go/patterns/concurrency/done-channel)** covers cancellation and goroutine lifecycle — the discipline that prevents goroutine leaks. Read this alongside whichever pattern you adopt first.

**[Semaphore](/go/patterns/concurrency/semaphore)** bounds concurrent access to a resource using a buffered channel or `golang.org/x/sync/semaphore`. Use it when a worker pool is too rigid but you still need a concurrency ceiling.

**[Errgroup](/go/patterns/concurrency/errgroup)** coordinates goroutines that can fail, cancelling the group on the first error. The right tool when you'd otherwise reach for a `WaitGroup` plus a channel of errors.

**[Timeout and Select](/go/patterns/concurrency/timeout-select)** covers deadline patterns using `select`, `time.After`, and `context.WithTimeout`. Use it whenever a goroutine operation must not wait indefinitely.

---

The [Observer](/go/patterns/behavioral/observer) and [Event-Driven Architecture](/go/patterns/architectural/event-driven) patterns use channels and goroutines for async notification — the concurrency patterns here are the implementation vocabulary for those higher-level designs.
