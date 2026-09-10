---
title: "Mutex"
description: "Guard state that a worker thread shares with the main thread behind a Mutex bundled with the data, so the lock can't be forgotten and the critical section stays small."
---

# Mutex

**Buys an obviously-correct critical section for any state a worker thread shares with the main thread; pays in serialised access, contention, and deadlock risk if you mishandle it.**

A `Mutex` is a lock. One thread holds it at a time; every other thread that calls `lock()` blocks until the holder calls `unlock()`. The code between those two calls — the **critical section** — runs as if the game were single-threaded, which is exactly what you need when a `Thread` or a `WorkerThreadPool` task writes something the main thread reads. It is the most general fix for a [data race](/patterns/synchronisation/data-races) in GDScript, and the only general-purpose one: there are no atomics and no read-write lock in the language, so when state is genuinely shared and genuinely mutable, this is the tool.

Godot's `Mutex` is re-entrant — the same thread can lock it twice as long as it unlocks it twice. That removes one classic deadlock but not the others, and GDScript has no `finally` or `defer`, so unlocking on every exit path is a discipline you keep by hand.

## Scenario

A chunked open world generates terrain on a background thread so the frame never stalls. The generator writes finished chunks into a Dictionary; the main thread pulls them out each frame and builds meshes. The first version shares the Dictionary directly:

```gdscript:title="res://world/chunk_generator.gd"
class_name ChunkGenerator extends Node

var ready_chunks: Dictionary[Vector2i, PackedByteArray] = {}
var _thread: Thread

func _ready() -> void:
	_thread = Thread.new()
	_thread.start(_generate_forever)

func _generate_forever() -> void:
	for coord: Vector2i in _pending_coords():
		ready_chunks[coord] = _generate(coord)  # BAD: written on the worker...

func _process(_delta: float) -> void:
	for coord: Vector2i in ready_chunks.keys():  # ...and read on the main thread
		_build_mesh(coord, ready_chunks[coord])
		ready_chunks.erase(coord)
```

A Dictionary is not safe to mutate from two threads. The worker's insert can rehash the table while `_process` iterates it; the symptom is an occasional crash, a chunk that vanishes, or a mesh built from half-written bytes — and it only reproduces on the tester's eight-core machine, never on yours.

> **Smell:** A container is written from a `Thread` callable and read from `_process`, and you can't point at the lock that orders those two accesses. "The generator is slow, they'll never overlap" is timing, not synchronisation.

## Solution

Bundle the mutex with the data it guards inside one class, and expose the data only through methods that take the lock. Now the lock isn't optional — it's the only door in.

```
ChunkGenerator (Node)              main thread
  └── owns ChunkCache (RefCounted) ── Mutex + Dictionary
           ▲                 ▲
   store() │                 │ take_ready()
   worker thread         main thread, once per frame
```

```gdscript:title="res://world/chunk_cache.gd"
class_name ChunkCache extends RefCounted
## Thread-safe holder for chunks that are generated but not yet built.
## Every access to _chunks goes through the mutex. Nothing else touches it.

var _mutex := Mutex.new()
var _chunks: Dictionary[Vector2i, PackedByteArray] = {}

## Called from the generator thread.
func store(coord: Vector2i, data: PackedByteArray) -> void:
	_mutex.lock()
	_chunks[coord] = data
	_mutex.unlock()

## Called from the main thread. Hands back everything ready and clears the
## cache in one step, so the caller never holds a reference we still mutate.
func take_ready() -> Dictionary[Vector2i, PackedByteArray]:
	_mutex.lock()
	var taken := _chunks
	_chunks = {}
	_mutex.unlock()
	return taken

func has(coord: Vector2i) -> bool:
	_mutex.lock()
	var found := _chunks.has(coord)
	_mutex.unlock()
	return found
```

```gdscript:title="res://world/chunk_generator.gd"
class_name ChunkGenerator extends Node

@export var view_distance: int = 4

var _cache := ChunkCache.new()
var _thread := Thread.new()
var _quit := false

func _ready() -> void:
	_thread.start(_generate_forever)

func _generate_forever() -> void:
	while not _quit:
		var coord := _next_coord()
		if not _cache.has(coord):
			_cache.store(coord, _generate(coord))

func _process(_delta: float) -> void:
	var ready := _cache.take_ready()
	for coord: Vector2i in ready:
		_build_mesh(coord, ready[coord])

func _exit_tree() -> void:
	_quit = true
	_thread.wait_to_finish()
```

Three details carry the weight:

- **Reads lock too.** `has()` looks harmless, but reading a Dictionary while another thread inserts is the same race as writing. Every access — read *and* write — goes through the lock.
- **`take_ready()` swaps the container instead of returning it.** If it returned `_chunks` directly, the main thread would hold a reference to the very Dictionary the worker keeps inserting into, outside the lock. Swapping in a fresh Dictionary means the returned one is now owned by exactly one thread. Arrays and Dictionaries are references in GDScript; a mutex around the *lookup* does nothing for a reference that escapes.
- **The critical section is three lines.** The lock is held for an insert or a swap, never across `_generate()`. Generation takes milliseconds; the lock is held for microseconds.

### Unlocking on every path

GDScript has no `defer` and no `try`/`finally`. If a function locks, then takes an early `return` before it unlocks, the mutex is held forever and the next `lock()` anywhere hangs the game. Two shapes keep you honest.

The first is a single exit: compute the answer under the lock, unlock, then branch on it.

```gdscript
func try_claim(coord: Vector2i) -> bool:
	_mutex.lock()
	var already := _claimed.has(coord)
	if not already:
		_claimed[coord] = true
	_mutex.unlock()
	return not already
```

The second is an explicit unlock on every branch, when a single exit would twist the logic. Make each `return` sit directly beneath its `unlock()` so a reviewer can pair them by eye.

```gdscript
func pop_nearest(origin: Vector2i) -> Variant:
	_mutex.lock()
	if _chunks.is_empty():
		_mutex.unlock()
		return null
	var best: Vector2i = _chunks.keys()[0]
	for coord: Vector2i in _chunks:
		if origin.distance_squared_to(coord) < origin.distance_squared_to(best):
			best = coord
	var data: PackedByteArray = _chunks[best]
	_chunks.erase(best)
	_mutex.unlock()
	return data
```

The same discipline rules out calling anything you don't control while the lock is held. A script error inside the critical section does not unwind the stack the way an exception would — the engine reports it, the function returns `null`, and your `unlock()` never runs.

### `try_lock` on the main thread

`lock()` blocks. On the main thread that means a stalled frame if the worker happens to be inside the critical section — brief when the section is small, but a hitch nonetheless if you lock a hundred times per frame. `try_lock()` returns `false` immediately instead of waiting; the main thread can skip this frame and try again next one.

```gdscript:title="res://world/chunk_cache.gd"
## Non-blocking variant for the main thread. Returns false if the worker
## holds the lock right now; the caller simply tries again next frame.
func try_take_ready(into: Dictionary[Vector2i, PackedByteArray]) -> bool:
	if not _mutex.try_lock():
		return false
	into.merge(_chunks)
	_chunks.clear()
	_mutex.unlock()
	return true
```

```gdscript:title="res://world/chunk_generator.gd"
func _process(_delta: float) -> void:
	if not _cache.try_take_ready(_pending):
		return  # worker was mid-insert; the chunks will still be there next frame
	for coord: Vector2i in _pending:
		_build_mesh(coord, _pending[coord])
	_pending.clear()
```

Use it when the main thread can tolerate "not now", which is most of the time. A worker thread, which has nothing better to do, should just `lock()`.

## Deadlocks

Godot's re-entrant mutex means a method holding the lock can call another method that locks the same mutex. The deadlocks that remain are the ones no primitive can prevent:

- **A lock never released.** The early-return bug above. Every `lock()` needs an `unlock()` on every path, including error paths.
- **Two mutexes in opposite order.** Thread A locks the chunk cache then the entity list; thread B locks the entity list then the chunk cache. Each waits for the other forever. Fix by ordering: if you ever need two locks at once, every thread takes them in the same order, always. Better: never hold two.
- **Locking while waiting for the main thread.** A worker holds the mutex and calls `call_deferred()` then waits for a result; the main thread's deferred handler tries to lock the same mutex. Nobody moves. Never block on another thread inside a critical section.

When the game freezes with no error, pause the debugger and look at which thread is sitting in `lock()`. That stack is the answer.

## When to Use

- A `Thread` or `WorkerThreadPool` task writes a container, a counter, or a multi-field object that the main thread (or another worker) also reads or writes.
- An invariant spans several statements — "if the chunk isn't claimed, claim it" must be one indivisible step, and only a lock gives you that.
- You want the simplest thing that is obviously correct. A three-line critical section is easier to verify than any lock-free trick, and in GDScript there are no lock-free tricks anyway.

## When Not to Use

- The state is a node or anything in the scene tree. Locks don't make the tree thread-safe; only the main thread touches it — see [Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership).
- Readers vastly outnumber writers — publish an immutable [Snapshot](/patterns/synchronisation/snapshot) so readers never lock at all.
- The sharing is a hand-off, not shared ownership: the worker produces a value, the main thread consumes it. Return it from the thread and pick it up with `wait_to_finish()`, or push it through a [Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue). Data that only one thread owns at a time needs no lock.
- The work fits in one frame. Threads exist for work that would stall the frame; a mutex on single-threaded code is pure overhead.

## The Decision

**Mutex vs. not sharing.** Before you add a lock, ask whether the worker could return its result instead. `Thread.wait_to_finish()` gives you the callable's return value; `call_deferred()` delivers a value to the main thread; a queue hands values one at a time. All three move *ownership* rather than sharing it, and none can deadlock. A mutex is for the case where both threads legitimately need the same mutable state over time — a cache, a claimed-set, a progress tally. That case is real but rarer than it first looks.

**Mutex vs. Snapshot.** A mutex serialises everyone, readers included. If the HUD, the minimap, and three AI tasks all read the world map every frame while one thread rewrites it every few seconds, they will queue on a lock for no reason. A [Snapshot](/patterns/synchronisation/snapshot) makes the writer pay for a copy so the readers pay nothing. Start with the mutex; switch when the profiler shows readers waiting.

**Lock scope.** The trade-off inside the pattern is contention against correctness. A lock held across `_generate()` is trivially correct and serialises the whole game behind the generator. A lock held for one insert is nearly free but forces you to think about which references escape. Keep the section small, swap containers rather than return them, and never call out of the section into code you don't own. This is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off) in miniature: every extra line under the lock is a line the rest of the game waits on.

## Related Patterns

- **[Data Races](/patterns/synchronisation/data-races)**: the problem a mutex solves; read it first if "critical section" isn't yet second nature.
- **[Snapshot](/patterns/synchronisation/snapshot)**: lock-free reads for read-dominated state, at the price of a copy per write.
- **[Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership)**: the discipline that keeps nodes out of critical sections entirely.
- **[Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue)**: a mutex plus a semaphore, packaged as the standard producer/consumer hand-off.
- **[Once](/patterns/synchronisation/once)**: the one-time-initialisation case, guarded by a mutex only when threads may race.
- **[Worker Thread Pool](/patterns/concurrency/worker-thread-pool)**: where the worker threads that contend for this lock usually come from.
