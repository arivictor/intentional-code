---
title: "Thread-Safe Queue"
description: "A ThreadSafeQueue class built from a Mutex, a Semaphore, and an Array — push from any thread, pop with or without blocking, cap the size, and shut consumers down with a sentinel."
---

# Thread-Safe Queue

**Buys one correct hand-off channel between producers and consumers, built from a Mutex and a Semaphore; pays in unbounded growth unless you cap it.**

Almost every thread in a game is a producer or a consumer of something: chunk requests in, chunk data out; save jobs in, done notifications out; network packets in, parsed messages out. Each of those hand-offs needs the same three things — a container, a lock so two threads don't corrupt it, and a way for a consumer to sleep until there's an item. Godot gives you the parts: `Array`, [Mutex](/patterns/synchronisation/mutex), [Semaphore](/patterns/synchronisation/semaphore). This page assembles them once, into a class, so the invariant that ties them together — *the semaphore's count equals the number of items* — is written in one place and can't drift.

There is no such class in the engine. You write it in forty lines and use it everywhere.

## Scenario

A chunk streamer has a main thread that requests chunks and a worker that generates them. Each side keeps its own Array, and the mutex, the semaphore, and the Array are three separate fields that every method has to coordinate by hand:

```gdscript:title="res://world/chunk_streamer.gd"
class_name ChunkStreamer extends Node

var _requests: Array[Vector2i] = []
var _requests_mutex := Mutex.new()
var _requests_available := Semaphore.new()
var _results: Array[ChunkData] = []
var _results_mutex := Mutex.new()

func request(coord: Vector2i) -> void:
	_requests_mutex.lock()
	_requests.push_back(coord)
	_requests_mutex.unlock()
	_requests_available.post()

func request_urgent(coord: Vector2i) -> void:
	_requests_mutex.lock()
	_requests.push_front(coord)   # BAD: nobody posted. The worker sleeps through it.
	_requests_mutex.unlock()
```

Six fields for two queues, and a second entry point that forgot the post. The worker will process the urgent chunk only when the *next* ordinary request wakes it, and from then on the count is off by one forever.

> **Smell:** A `Mutex`, a `Semaphore`, and an `Array` live as sibling fields on a node, and more than one method touches them. Every method is a chance to get the pairing wrong, and one already has.

## Solution

Package the three parts into a class with a tiny API: `push`, `pop_blocking`, `try_pop`, `size`. The post lives inside `push` and the wait lives inside `pop_blocking`, so the count can't drift because there is nowhere else to change it.

```
producer(s)          ThreadSafeQueue (RefCounted)          consumer(s)
push(item) ──▶ lock · append · unlock · post
                       Array  ·  Mutex  ·  Semaphore
                    wait · lock · pop_front · unlock ◀── pop_blocking()
                    try_wait ─┘ (non-blocking)      ◀── try_pop()
```

```gdscript:title="res://systems/thread_safe_queue.gd"
class_name ThreadSafeQueue extends RefCounted
## A FIFO that any thread may push to and any thread may pop from.
## Invariant: _items.size() == number of successful posts minus successful waits.
## Every method that changes _items changes the semaphore in the same call.

const UNBOUNDED := -1

var _items: Array = []
var _mutex := Mutex.new()
var _available := Semaphore.new()
var _capacity: int

func _init(capacity: int = UNBOUNDED) -> void:
	_capacity = capacity

## Any thread. Returns false, and drops nothing, if the queue is full.
func push(item: Variant) -> bool:
	_mutex.lock()
	if _capacity != UNBOUNDED and _items.size() >= _capacity:
		_mutex.unlock()
		return false
	_items.push_back(item)
	_mutex.unlock()
	_available.post()
	return true

## Worker threads. Sleeps until an item is available, then removes and returns it.
func pop_blocking() -> Variant:
	_available.wait()
	_mutex.lock()
	var item: Variant = _items.pop_front()
	_mutex.unlock()
	return item

## Main thread. Returns null immediately if nothing is queued.
## Callers that queue nulls on purpose should use try_pop_into() instead.
func try_pop() -> Variant:
	if not _available.try_wait():
		return null
	_mutex.lock()
	var item: Variant = _items.pop_front()
	_mutex.unlock()
	return item

## Main thread. Moves everything currently queued into `out`, in one lock.
func drain_into(out: Array) -> void:
	_mutex.lock()
	while _available.try_wait():
		out.push_back(_items.pop_front())
	_mutex.unlock()

func size() -> int:
	_mutex.lock()
	var count := _items.size()
	_mutex.unlock()
	return count
```

The streamer collapses to two queues and no bookkeeping:

```gdscript:title="res://world/chunk_streamer.gd"
class_name ChunkStreamer extends Node

var _requests := ThreadSafeQueue.new()
var _results := ThreadSafeQueue.new()
var _thread := Thread.new()
var _incoming: Array = []

func _ready() -> void:
	_thread.start(_run)

func request(coord: Vector2i) -> void:
	_requests.push(coord)

func _run() -> void:   # worker thread
	while true:
		var coord: Variant = _requests.pop_blocking()   # sleeps between requests
		if coord == null:
			break                                        # shutdown sentinel
		_results.push(ChunkGenerator.generate(coord))

func _process(_delta: float) -> void:   # main thread
	_results.drain_into(_incoming)
	for chunk: ChunkData in _incoming:
		_build_mesh(chunk)
	_incoming.clear()

func _exit_tree() -> void:
	_requests.push(null)          # wake the worker with the sentinel
	_thread.wait_to_finish()
```

Why each piece is where it is:

- **`post()` is called after `unlock()`, not inside the lock.** The semaphore has its own synchronisation; posting while holding the mutex only lengthens the critical section and makes the woken consumer immediately block on the lock you're still holding. The count is still consistent, because both the append and the post happen before `push` returns.
- **`pop_blocking` waits before it locks.** If it locked first and then waited, it would sleep holding the mutex, and no producer could ever push. The wait is the sleep; the lock is the two-line critical section after it.
- **`drain_into` pairs every `pop_front` with a `try_wait`.** It would be simpler to move the whole Array and reset the semaphore — but there is no reset. The count must be decremented once per item taken, so the loop does exactly that. Because it holds the mutex throughout, no producer can push between the `try_wait` and the `pop_front`.
- **The main thread never calls `pop_blocking`.** It uses `try_pop` or `drain_into`, both of which return at once. A blocking pop on the main thread is a dropped frame at best and, if the worker is already gone, a hang.

### Capacity

Unbounded is the default and the trap. A producer that outpaces its consumer — the camera sweeping across a world faster than chunks generate — fills the queue with requests for chunks the player has already left behind, and memory grows until something gives. `ThreadSafeQueue.new(64)` caps it: `push` returns `false` when full, and the caller decides.

The two honest responses to a full queue are **drop** and **wait**. Drop is right for requests that go stale — a chunk request from ten seconds ago is worthless; the streamer can simply not queue it and let the next frame's visibility check re-request what still matters. Wait is right for things that must not be lost, like save jobs, and belongs on a worker thread, never the main one:

```gdscript
func _push_or_wait(queue: ThreadSafeQueue, item: Variant) -> void:   # worker only
	while not queue.push(item):
		OS.delay_msec(1)
```

If a blocking push on a full queue is a hot path, add a second semaphore for free slots (posted `capacity` times in `_init`, waited in `push`, posted in `pop`). Most games never need it; the drop-and-re-request shape is simpler and matches how streaming actually behaves.

### Shutdown sentinel

A consumer asleep in `pop_blocking()` will never see a `_quit` flag. The clean wake-up is an item that means "stop": push `null` (or a dedicated `const SHUTDOWN := &"shutdown"` if `null` is a legitimate payload), and have the consumer loop check for it before doing work. With N consumers, push N sentinels — each consumer takes exactly one and exits. Then join each thread with `wait_to_finish()`; see [Join](/patterns/synchronisation/join).

Items still queued behind the sentinel are dropped. If that matters — pending saves — push the sentinel only after the producer has stopped producing, and let the consumer drain naturally: the sentinel is last in FIFO order, so everything ahead of it is processed first.

## When to Use

- Any producer/consumer hand-off between threads: requests to a worker, results back to the main thread, packets from a network thread, jobs to a pool of [Competing Consumers](/patterns/concurrency/competing-consumers).
- The consumer should sleep when idle. A `pop_blocking()` loop is the standard body of a long-lived worker thread.
- More than one method or more than one thread pushes. The class is what keeps them from disagreeing about the count.

## When Not to Use

- Single result, single job. Return the value from the `Thread` callable and collect it with `wait_to_finish()`, or hand it over with `call_deferred()`. A queue for one item is ceremony.
- Both sides are the main thread. Coroutines and signals don't need a lock; an `Array` and an `await` do the job — see [Coroutines](/patterns/concurrency/coroutines) and [Event Queue](/patterns/architectural/event-queue).
- The consumer needs to pick items by priority or key rather than in order. That's a different structure — a priority heap or a Dictionary under the same Mutex-plus-Semaphore discipline — and you should build that rather than bend a FIFO.
- Throughput is enormous (hundreds of thousands of items per second). One mutex per push and pop is fine for thousands; at that scale batch items into Arrays and push the batch, so the lock is taken once per hundred items.

## The Decision

**One class vs. inline primitives.** Inline is three fields and four lines per method, and it's wrong the third time someone adds a method. The class is forty lines once. The value is not code saved; it is that the invariant — count equals size — has one owner and can be tested in isolation with GUT or gdUnit4, on a `RefCounted` with no scene tree, by spinning up a `WorkerThreadPool` group task of producers and asserting every item arrives exactly once.

**Bounded vs. unbounded.** Unbounded is the default because it's the one that never fails a push, and that is precisely why it's dangerous: the failure moves from the push to the memory graph twenty minutes later. Cap every queue whose producer can outrun its consumer, and pick drop or wait deliberately for each one. A queue you haven't thought about capping is a queue that will surprise you in the [name-the-trade-off](/philosophy/name-the-trade-off) sense — the trade was made, it just wasn't named.

**What `Variant` costs you.** `_items: Array` accepts anything, and `pop_blocking() -> Variant` returns anything. Typed wrappers (`ChunkRequestQueue extends ThreadSafeQueue` with a typed `push`) buy static checking on each side, at the price of a class per payload. Do it for the two or three queues that carry real domain objects; leave the generic one for the rest.

## Related Patterns

- **[Mutex](/patterns/synchronisation/mutex)** and **[Semaphore](/patterns/synchronisation/semaphore)**: the two primitives this class is made of — read both before trusting the invariant.
- **[Competing Consumers](/patterns/concurrency/competing-consumers)**: several workers calling `pop_blocking()` on one queue; the queue is the shared part.
- **[Pipeline](/patterns/concurrency/pipeline)**: a queue between each pair of stages, with capacity as the back-pressure.
- **[Join](/patterns/synchronisation/join)**: the sentinel wakes the consumer; the join collects it.
- **[Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership)**: why the main thread drains results with `try_pop` and applies them itself, rather than letting the worker touch nodes.
