---
title: Patterns
description: Browse Godot and GDScript patterns by family — each with its trade-off in one line, so you can triage before you click.
order: 3
icon: shapes
---

You usually meet a pattern mid-problem: a player script keeps growing, an enemy reaches into the HUD with `get_node("../../")`, a level stutters every time a wave spawns, an Autoload knows about everything. This catalogue names the shape you're drifting toward and tells you what it costs before you commit.

Each entry states the trade-off in one line — what it **buys** and what you **pay** — so you can rule most of them out without leaving this page. Scan by family, or jump straight to a pattern when you already know the pressure you're under.

## Creational

How scenes, nodes, and Resources get made, and who decides which concrete one.

- **[Singleton (Autoload)](/patterns/creational/singleton)** — buys one guaranteed, globally reachable instance via an Autoload; pays in hidden dependencies, scenes that can't run alone, and tests that share state — prefer passing references for anything that isn't truly global.
- **[Factory Method](/patterns/creational/factory-method)** — buys spawning by name or data so callers never `preload` a concrete scene; pays in indirection and runtime-only failure on an unknown id.
- **[Abstract Factory](/patterns/creational/abstract-factory)** — buys a guarantee that a family of scenes (a faction's units, projectiles, and effects) never mixes; pays heavy ceremony — a new product type touches the factory contract and every family.
- **[Builder](/patterns/creational/builder)** — buys defaults plus override-any-subset construction for complex objects like tweens, levels, and encounters; pays one method per option and validation that only fails at runtime.
- **[Prototype](/patterns/creational/prototype)** — buys cheap, independent copies of configured nodes and Resources via `duplicate()`; pays in shallow-versus-deep copy rules the engine won't check for you.
- **[Object Pool](/patterns/creational/object-pool)** — buys frame-stable spawning for bullets and particles by reusing instances instead of instantiating; pays in reset bugs — a pooled object that remembers its last life fails at the worst time.

## Structural

How nodes and scripts compose without editing the things they wrap.

- **[Adapter](/patterns/structural/adapter)** — buys one-place translation isolating a platform SDK or third-party addon from your game code; pays in indirection and silent information loss when a rich API is flattened.
- **[Decorator](/patterns/structural/decorator)** — buys stackable modifiers (buffs, status effects, damage multipliers) with no edits to the thing they wrap; pays in order-sensitivity nothing checks and effects that are hard to trace.
- **[Proxy](/patterns/structural/proxy)** — buys transparent lazy loading, access control, and caching behind the same interface as the real object; pays in keeping the proxy in sync and first-use latency.
- **[Facade](/patterns/structural/facade)** — buys one entry point so a sequence change (start a level, open a shop) propagates everywhere at once; pays by becoming a god-autoload magnet unless kept to a single workflow.
- **[Composite](/patterns/structural/composite)** — buys uniform recursion over the scene tree so a squad and a single unit answer the same call; pays when the shared contract grows too coarse and leaves must stub methods that don't apply.
- **[Bridge](/patterns/structural/bridge)** — buys turning an N×M scene explosion (every weapon × every wielder) into N+M along two independent axes; pays in extra classes until each axis has three-plus options.
- **[Flyweight](/patterns/structural/flyweight)** — buys large memory savings by sharing immutable data in Resources across thousands of instances; pays in the shared-mutation trap — edit a shared Resource and every user changes with it.

## Behavioural

How nodes communicate, distribute responsibility, and choose behaviour at runtime.

- **[Strategy](/patterns/behavioral/strategy)** — buys swappable behaviour (movement, targeting, AI) via Resources or Callables without touching the node that uses them; pays because the selection logic moves to whoever assigns the strategy rather than vanishing.
- **[Observer (Signals)](/patterns/behavioral/observer)** — buys clean decoupling — react to a change without the emitter knowing who listens; pays in visibility, connections that outlive their nodes, and an order nobody guarantees.
- **[Command](/patterns/behavioral/command)** — buys undo, replay, input buffering, and remappable controls by turning actions into objects; pays in per-command state that gets expensive — use a plain method call until you need one of those.
- **[Chain of Responsibility](/patterns/behavioral/chain-of-responsibility)** — buys composable, independently testable handlers that can short-circuit, the way Godot's own input propagation works; pays in debuggability — you add logging to see where an event stopped.
- **[State](/patterns/behavioral/state)** — buys isolated per-state behaviour so adding a state is one new script; pays in class proliferation and a state–owner cycle that surprises newcomers.
- **[Template Method](/patterns/behavioral/template-method)** — buys a fixed skeleton with pluggable steps via virtual methods, Godot's own `_ready`/`_process` model; pays when hooks multiply — composition beats a base class of empty methods.
- **[Iterator](/patterns/behavioral/iterator)** — buys write-once traversal (a spiral search, a tree walk) with lazy evaluation and clean early-break via `_iter_*`; pays in per-step overhead and no random access without materialising an Array.
- **[Mediator](/patterns/behavioral/mediator)** — buys O(n) decoupling so siblings never reach for each other with `get_node("../")`; pays in a hub that absorbs all routing and risks becoming a god object.
- **[Memento](/patterns/behavioral/memento)** — buys opaque snapshots for undo, checkpoints, and save states; pays in memory per snapshot and deep-copy discipline for Arrays, Dictionaries, and Resources.
- **[Visitor](/patterns/behavioral/visitor)** — buys open/closed for operations (add an exporter, a stat summary, a validator without touching node types); pays in double-dispatch boilerplate. A `match` on type usually wins.
- **[Interpreter](/patterns/behavioral/interpreter)** — buys isolated, testable rules for a small scripting language (dialogue conditions, cheat codes, quest logic); pays in tree indirection and no parser errors — the wrong tool above small, stable grammars.

## Concurrency

How to spread work across frames and threads while the main thread keeps owning the scene tree.

- **[Coroutines](/patterns/concurrency/coroutines)** — buys sequential-looking code for multi-frame logic (cutscenes, attack sequences, dialogue) with no threads; pays in functions that quietly become coroutines and resume on freed nodes.
- **[Await and Timeouts](/patterns/concurrency/await-timeout)** — buys a bound on any wait — a signal that may never fire, a request that may never return; pays in racing timers you must cancel and one-shot connections you must clean up.
- **[Deferred Calls](/patterns/concurrency/call-deferred)** — buys a safe hand-off to the main thread and to the end of the frame for tree changes; pays in ordering you can't see — a deferred call runs later than the code beneath it.
- **[Worker Thread Pool](/patterns/concurrency/worker-thread-pool)** — buys a fixed ceiling on threads and amortised startup for background work (pathfinding, chunk generation, save serialisation); pays in results that arrive out of order and main-thread hand-off plumbing.
- **[Pipeline](/patterns/concurrency/pipeline)** — buys overlapping stages (load, instantiate, place) so the frame never stalls; pays in cross-thread debugging and back-pressure you must build yourself.
- **[Fan-out / Fan-in](/patterns/concurrency/fan-out-fan-in)** — buys parallelism for a slow stage via group tasks behind one call; pays in lost input order and a merge step that can become the bottleneck.
- **[Cancellation](/patterns/concurrency/cancellation)** — buys threads and coroutines that stop when the scene changes, preventing orphaned work; pays in verbosity — every loop checks a flag, every await checks validity.
- **[Competing Consumers](/patterns/concurrency/competing-consumers)** — buys horizontal throughput by adding workers to one shared queue; pays in lost ordering and a queue whose emptiness you must signal, not poll.

## Synchronisation

The primitives and disciplines that keep state correct when a worker thread and the main thread touch it at once.

- **[Mutex](/patterns/synchronisation/mutex)** — buys an obviously-correct critical section for any state a worker thread shares with the main thread; pays in serialised access, contention, and deadlock risk if you mishandle it.
- **[Semaphore](/patterns/synchronisation/semaphore)** — buys a wake-up signal for a sleeping worker thread with no busy-wait; pays in `post`/`wait` bookkeeping — miss one and a thread sleeps forever.
- **[Snapshot](/patterns/synchronisation/snapshot)** — buys lock-free reads for read-dominated state by publishing immutable copies; pays a full copy per write — wrong when writes are frequent or the state is large.
- **[Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership)** — buys freedom from locks around the scene tree by letting only the main thread touch nodes; pays in hand-off plumbing — workers compute values, the main thread applies them.
- **[Once](/patterns/synchronisation/once)** — buys correct-by-construction lazy setup for expensive shared state; pays by being permanent — no retry on failure and no re-run.
- **[Join](/patterns/synchronisation/join)** — buys simple block-until-done coordination for a batch of threads or tasks; pays by doing only that — no errors, no cancellation, and a stalled frame if you join on the main thread.
- **[Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue)** — buys one correct hand-off channel between producers and consumers, built from a Mutex and a Semaphore; pays in unbounded growth unless you cap it.
- **[Data Races](/patterns/synchronisation/data-races)** — buys early, loud failure by keeping thread-safety checks on in debug builds; pays in a detector that catches only the interleavings it observes — the discipline is yours.

## Architectural

How whole games are shaped — scene boundaries, data flow, and the seam between simulation and presentation.

- **[Node Composition](/patterns/architectural/composition)** — buys behaviour assembled from reusable child nodes (health, hitbox, movement) instead of a deep inheritance tree; pays in wiring — components must find each other without hard-coded paths.
- **[Feature Modules](/patterns/architectural/feature-modules)** — buys folder-per-feature boundaries with in-process speed and one project; pays in the discipline to stop features reaching into each other with `get_node("../../")`.
- **[Data-Driven Design](/patterns/architectural/data-driven)** — buys content designers tune in the inspector without code changes, via custom Resources; pays in a schema you must migrate and shared-Resource mutation traps.
- **[Scene Flow](/patterns/architectural/scene-flow)** — buys one owner for menu → loading → level → pause transitions instead of scenes swapping each other; pays in a manager every scene depends on and that you must keep small.
- **[Simulation / Presentation Split](/patterns/architectural/simulation-presentation)** — buys a deterministic fixed-tick simulation and a presentation that can be interpolated, skipped, or replaced; pays in doubled state and a sync step that must run every frame.
- **[Layered](/patterns/architectural/layered)** — buys testable game rules and a swappable presentation or storage layer; pays in lasagne code and heavy changes when one stat touches every layer.
- **[Clean Architecture](/patterns/architectural/clean-architecture)** — buys a simulation independent of nodes and the engine loop, testable without a scene tree; pays in mapping boilerplate between plain classes and nodes and a rule the engine won't enforce.
- **[Hexagonal](/patterns/architectural/hexagonal)** — buys full game-logic tests with no real input, storage, or platform services via in-memory adapters; pays in port proliferation and steady mapping at every edge.
- **[Repository](/patterns/architectural/repository)** — buys game-logic tests without touching disk and an explicit save contract; pays in interface sprawl and leaks once queries and versioning creep in.
- **[MVC / MVP / MVVM](/patterns/architectural/mvc)** — buys UI that reflects state through signals instead of polling and a model testable without Controls; pays in indirection — more scripts, more wiring.
- **[Domain-Driven Design](/patterns/architectural/domain-driven-design)** — buys invariants enforced in one place (an Inventory that can't overflow) and code that speaks the designers' language; pays dearly when boundaries are drawn wrong.
- **[Event-Driven](/patterns/architectural/event-driven)** — buys producer/consumer decoupling so achievements, audio, and analytics react without the emitter knowing; pays in flow you can't read top-to-bottom and handlers that must tolerate any order.
- **[Publish/Subscribe](/patterns/architectural/pub-sub)** — buys one-to-many fan-out across scenes that never reference each other; pays in lost observability — the bus hides who talks to whom.
- **[Event Queue](/patterns/architectural/event-queue)** — buys decoupled timing — emit now, process later at a bounded rate; pays in events that go stale before they're handled and a queue that can grow without limit.
- **[Event Sourcing](/patterns/architectural/event-sourcing)** — buys replays, ghosts, and debuggable desyncs by recording inputs and events as the source of truth; pays in strict determinism and forever-compatible event formats.
- **[Service Locator](/patterns/architectural/service-locator)** — buys swappable global services (audio, save, analytics) behind one lookup, with a null service for tests; pays in hidden dependencies — the same tax as an Autoload, slightly better disguised.
- **[Microkernel](/patterns/architectural/microkernel)** — buys a core that grows by loading plugins and mods instead of edits; pays in a load-bearing contract you must version and behaviour that's harder to trace.
- **[Pipe and Filter](/patterns/architectural/pipe-and-filter)** — buys independently testable, reorderable stages for procedural generation and damage calculation; pays in intermediate allocations and stages that only make sense in one order.
- **[Rate Limiting](/patterns/architectural/rate-limiting)** — buys bounded load — ability cooldowns, throttled pathfinding, capped audio spam; pays the drop-versus-delay choice and a limiter that lives per instance.
- **[Client-Server Multiplayer](/patterns/architectural/client-server)** — buys an authoritative simulation clients cannot cheat; pays the distributed-systems tax from day one — latency, prediction, and state that is eventually consistent.
- **[Strangler Fig](/patterns/architectural/strangler-fig)** — buys incremental, reversible migration off a legacy system (an old save format, a hand-rolled state machine) scene by scene; pays in running two implementations and a routing layer that can become permanent.
