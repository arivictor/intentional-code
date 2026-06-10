---
title: Patterns
description: Browse implementation patterns by family — each with its trade-off in one line, so you can triage before you click.
order: 3
icon: shapes
---

You usually meet a pattern mid-problem: a handler keeps growing, a queue backs up, a service starts reaching somewhere it shouldn't. This catalogue names the shape you're drifting toward and tells you what it costs before you commit.

Each entry states the trade-off in one line — what it **buys** and what you **pay** — so you can rule most of them out without leaving this page. Scan by family, or jump straight to a pattern when you already know the pressure you're under.

## Creational

How objects get made, and who decides which concrete type.

- **[Singleton](/go/patterns/creational/singleton)** — buys one guaranteed shared instance; pays in hidden global dependencies, untestable swaps, and first-caller-wins config. Usually prefer dependency injection.
- **[Factory Method](/go/patterns/creational/factory-method)** — buys open/closed extension (add implementations without touching callers); pays in indirection and runtime-only failure on an unknown name.
- **[Abstract Factory](/go/patterns/creational/abstract-factory)** — buys a compiler-enforced guarantee that product families never mix; pays heavy ceremony — a new product type touches the interface and every family.
- **[Builder](/go/patterns/creational/builder)** — buys defaults plus override-any-subset construction and non-breaking extensibility; pays one function per option and runtime-only validation.
- **[Prototype](/go/patterns/creational/prototype)** — buys correct, independent deep copies of reference fields; pays in manual `Clone()` upkeep the compiler won't check.

## Structural

How types compose without editing the things they wrap.

- **[Adapter](/go/patterns/structural/adapter)** — buys one-place translation isolating a third-party API from your domain; pays in indirection and silent information loss when a rich type is flattened.
- **[Decorator](/go/patterns/structural/decorator)** — buys composable cross-cutting behaviour with no edits to the wrapped code; pays in order-sensitivity the compiler won't catch and opaque stack traces.
- **[Proxy](/go/patterns/structural/proxy)** — buys transparent lazy-init, access control, and caching behind the same interface; pays in keeping the proxy in sync and first-call latency.
- **[Facade](/go/patterns/structural/facade)** — buys one entry point so a sequence change propagates everywhere at once; pays by becoming a god-object magnet unless kept to a single workflow.
- **[Composite](/go/patterns/structural/composite)** — buys clean recursive code treating leaves and trees uniformly; pays when the shared interface grows too coarse and leaves must stub methods that don't apply.
- **[Bridge](/go/patterns/structural/bridge)** — buys turning an N×M type explosion into N+M across two independent axes; pays in extra interfaces until each axis has three-plus options.
- **[Flyweight](/go/patterns/structural/flyweight)** — buys large memory savings by interning shared state; pays in a mutexed package-level cache and an intern map that can leak by never shrinking.

## Behavioural

How objects communicate, distribute responsibility, and choose behaviour at runtime.

- **[Strategy](/go/patterns/behavioral/strategy)** — buys runtime-interchangeable algorithms at near-zero cost via function types; pays because the selection switch relocates to the caller rather than vanishing.
- **[Observer](/go/patterns/behavioral/observer)** — buys clean decoupling (add reactions without touching the subject); pays in visibility, forgotten-unsubscribe leaks, and ordering hazards under concurrency.
- **[Command](/go/patterns/behavioral/command)** — buys undo, queuing, and logging of operations; pays in per-command snapshots that get expensive — use a plain `func()` until you need them.
- **[Chain of Responsibility](/go/patterns/behavioral/chain-of-responsibility)** — buys composable, independently testable steps that can short-circuit; pays in debuggability — you add logging to see where a request stopped.
- **[State](/go/patterns/behavioral/state)** — buys isolated per-state behaviour so adding a state is one new struct; pays in type proliferation and a state-context cycle that surprises newcomers.
- **[Template Method](/go/patterns/behavioral/template-method)** — buys a fixed skeleton with pluggable steps via injected funcs; pays when hooks multiply — an interface beats a struct of nil-able funcs.
- **[Iterator](/go/patterns/behavioral/iterator)** — buys write-once traversal with lazy evaluation and clean early-break; pays in per-level overhead and no bidirectional iteration without materialising a slice.
- **[Mediator](/go/patterns/behavioral/mediator)** — buys O(n) decoupling so participants import nothing from each other; pays in a hub that absorbs all routing and risks becoming a god object.
- **[Memento](/go/patterns/behavioral/memento)** — buys compiler-enforced opaque snapshots for undo; pays in memory per snapshot and deep-copy discipline for reference types.
- **[Visitor](/go/patterns/behavioral/visitor)** — buys open/closed for operations (add a visitor without touching node types); pays in double-dispatch boilerplate. A type switch usually wins.
- **[Interpreter](/go/patterns/behavioral/interpreter)** — buys isolated, testable grammar rules; pays in tree indirection and no parser errors — the wrong tool above small, stable grammars.

## Concurrency

How to combine goroutines and channels into systems that stay correct, bounded, and cancellable.

- **[Worker Pool](/go/patterns/concurrency/worker-pool)** — buys a hard ceiling on goroutines and amortised startup for job streams; pays in channel plumbing and out-of-order results.
- **[Semaphore](/go/patterns/concurrency/semaphore)** — same ceiling as a worker pool, simpler with no standing pool; pays per-job goroutine startup. Use the semaphore for a known batch, the pool for a stream.
- **[Pipeline](/go/patterns/concurrency/pipeline)** — buys overlapping concurrent stages with sequential clarity and low memory; pays in cross-goroutine debugging — over-buffering hides back-pressure.
- **[Fan-out / Fan-in](/go/patterns/concurrency/fan-out-fan-in)** — buys parallelism for a slow stage behind one channel interface; pays in lost input order and a possible fan-in bottleneck.
- **[Done Channel](/go/patterns/concurrency/done-channel)** — buys explicit, composable cancellation that prevents goroutine leaks; pays in verbosity — every blocking op needs a `select` on `ctx.Done()`.
- **[Timeout and Select](/go/patterns/concurrency/timeout-select)** — buys deadlines and cancellation so a goroutine never blocks forever; pays in non-deterministic case ordering and easy-to-leak timers in loops.
- **[Errgroup](/go/patterns/concurrency/errgroup)** — buys first-error collection plus automatic cancellation; pays with cooperative-only stop and only the first error returned.
- **[Competing Consumers](/go/patterns/concurrency/competing-consumers)** — buys horizontal throughput as you add consumers; pays in lost global ordering and at-least-once redelivery you must make idempotent.

## Synchronisation

The shared-memory primitives that keep state correct when several goroutines touch it at once.

- **[Mutex](/go/patterns/synchronisation/mutex)** — buys an obviously-correct critical section for any multi-word shared state; pays in serialised access, contention, and deadlock risk if mishandled.
- **[RWMutex](/go/patterns/synchronisation/rwmutex)** — buys parallel reads for read-dominated, contended state; pays heavier per-op bookkeeping — slower than a plain Mutex unless reads truly dominate.
- **[Atomic](/go/patterns/synchronisation/atomic)** — buys lock-free, fastest protection when shared state is one word; pays by being useless for multi-variable invariants.
- **[Once](/go/patterns/synchronisation/once)** — buys correct-by-construction lazy, thread-safe initialisation; pays by being permanent — no retry on failure and no re-run.
- **[WaitGroup](/go/patterns/synchronisation/waitgroup)** — buys simple block-until-the-batch-completes coordination; pays by doing only that — no errors or cancellation (reach for [Errgroup](/go/patterns/concurrency/errgroup)).
- **[Cond](/go/patterns/synchronisation/cond)** — buys efficient broadcast wakeups for many waiters on one predicate; pays by not composing with `select`, timeouts, or cancellation — a channel usually wins.
- **[Pool](/go/patterns/synchronisation/pool)** — buys reduced GC pressure on a measured hot path; pays in reset-bug risk — the GC can drop items anytime, so it's not a cache.
- **[Data Races](/go/patterns/synchronisation/data-races)** — buys near-zero-false-positive detection when you run the suite under `-race` in CI; pays a test-time CPU/memory multiplier and catches only the interleavings it observes.

## Architectural

How whole systems are shaped — boundaries, messaging, and resilience.

- **[Clean Architecture](/go/patterns/architectural/clean-architecture)** — buys domain independence and a second delivery mechanism almost for free; pays in inter-ring mapping boilerplate and a rule the compiler won't enforce.
- **[Hexagonal](/go/patterns/architectural/hexagonal)** — buys full application-logic tests with no real infrastructure via in-memory adapters; pays in port proliferation and steady domain-to-infrastructure mapping.
- **[Layered](/go/patterns/architectural/layered)** — buys testable business rules and a swappable storage backend; pays in lasagne code and heavy changes when one field touches every layer.
- **[Repository](/go/patterns/architectural/repository)** — buys domain tests without a database and an explicit persistence contract; pays in interface sprawl and leaks once pagination and filtering creep in.
- **[MVC / MVP / MVVM](/go/patterns/architectural/mvc)** — buys a reusable, testable service layer and a response shape that stops domain types leaking into the API; pays in indirection — more files, types, and wiring.
- **[Modular Monolith](/go/patterns/architectural/modular-monolith)** — buys microservice-like boundaries with in-process speed and one deploy; pays in the discipline to stop modules decaying back to mud.
- **[Microservices](/go/patterns/architectural/microservices)** — buys independent deploy and scaling per team; pays the distributed-systems tax from day one and a high operational baseline.
- **[Backends for Frontends](/go/patterns/architectural/bff)** — buys each frontend an edge it owns and can change alone; pays in extra deployables, duplicated glue, and fan-out latency.
- **[Microkernel](/go/patterns/architectural/microkernel)** — buys a core that grows by adding plugins instead of edits; pays in a load-bearing contract you must version and harder-to-trace behaviour.
- **[Domain-Driven Design](/go/patterns/architectural/domain-driven-design)** — buys invariants enforced in one aggregate and code that speaks the business's language; pays dearly when aggregate boundaries are drawn wrong.
- **[CQRS](/go/patterns/architectural/cqrs)** — buys independently shaped read and write models; pays in doubled handlers and eventual consistency that surprises users reading their own write.
- **[Event Sourcing](/go/patterns/architectural/event-sourcing)** — buys a built-in audit trail and time-travel via replay; pays in projection complexity, eventually consistent reads, and forever-compatible event schemas.
- **[Event-Driven](/go/patterns/architectural/event-driven)** — buys producer/consumer decoupling and fault isolation; pays in eventual consistency, mandatory idempotency, and broker operational work.
- **[Publish/Subscribe](/go/patterns/architectural/pub-sub)** — buys one-to-many fan-out across processes; pays in lost flow observability and at-least-once delivery needing idempotent consumers.
- **[Transactional Outbox](/go/patterns/architectural/outbox)** — buys an event recorded atomically with the state change, killing the dual-write; pays in delivery latency, a relay to operate, and downstream dedup.
- **[Saga](/go/patterns/architectural/saga)** — buys cross-service consistency without a distributed transaction; pays in idempotent compensations that must never permanently fail and durable saga state.
- **[Pipe and Filter](/go/patterns/architectural/pipe-and-filter)** — buys independently testable, reorderable, composable stages; pays in hard-to-diagnose channel stalls and per-stage allocation pressure.
- **[Circuit Breaker](/go/patterns/architectural/circuit-breaker)** — buys fail-fast protection against a slow dependency exhausting your goroutines; pays in tuning a threshold and per-instance, unshared state.
- **[Retry](/go/patterns/architectural/retry)** — buys recovery from transient failures via bounded backoff with jitter; pays in added latency, retry amplification, and a hard dependency on idempotency.
- **[Rate Limiting](/go/patterns/architectural/rate-limiting)** — buys a bounded load that respects a downstream quota; pays the shed-vs-throttle choice and a per-instance limiter that won't enforce a global cap.
- **[Strangler Fig](/go/patterns/architectural/strangler-fig)** — buys incremental, reversible migration off a legacy system; pays in running two implementations, data-sync drift, and a routing layer that can become permanent.
