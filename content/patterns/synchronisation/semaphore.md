---
title: "Semaphore"
description: "Put a worker thread to sleep until there is work for it, using Godot's Semaphore as a counted wake-up signal between a producer and a consumer thread."
---

# Semaphore

**Buys a wake-up signal for a sleeping worker thread with no busy-wait; pays in `post`/`wait` bookkeeping — miss one and a thread sleeps forever.**

A `Semaphore` is a counter with two operations. `post()` increments it. `wait()` decrements it — and if the counter is already zero, `wait()` blocks the calling thread until somebody posts. That's the whole primitive, and it is exactly the shape of "a worker thread should sleep until there's something to do": the producer posts once per job, the worker waits once per job, and between jobs the worker costs nothing.

Godot gives you `Mutex` and `Semaphore` and nothing else. There is no condition variable, so the semaphore is also how you build one: anywhere you'd want "sleep until this becomes true", you signal the change with a `post()`. Because the count accumulates, a `post()` that arrives *before* the worker gets round to `wait()` is not lost — the worker just doesn't block on its next call. That property is what makes the primitive usable without a lock around the signal itself.

## Scenario

A save system serialises the world on a background thread so a quicksave doesn't drop frames. The worker thread needs to notice new save requests. The first attempt polls:

```gdscript:title="res://systems/save_worker.gd"
class_name SaveWorker extends Node

var _pending: Array[SaveRequest] = []
var _mutex := Mutex.new()
var _thread := Thread.new()

func _ready() -> void:
	_thread.start(_run)

func _run() -> void:
	while true:
		_mutex.lock()
		var request: SaveRequest = _pending.pop_front()
		_mutex.unlock()
		if request == null:
			OS.delay_msec(10)  # BAD: sleep-and-poll
			continue
		_write(request)
```

That loop wakes a hundred times a second to find nothing, forever. Drop the `delay_msec` and it pegs a core instead. Either way the worker's latency is "whenever the poll happens to land", and on a handheld or a laptop the idle wake-ups are battery you're spending on nothing.

> **Smell:** A thread loop contains `OS.delay_msec` or spins re-checking a container under a lock. The thread needs to *sleep until woken*, and a semaphore is the primitive that does precisely that.

## Solution

Add a `Semaphore`. The producer pushes a request under the mutex, then posts. The worker waits — blocked in the kernel, using no CPU — and wakes exactly once per post.

```
main thread                       save thread
───────────                       ───────────
request_save(r)
  lock, push r, unlock
  _work.post()  ───────────────▶  _work.wait() returns
                                  lock, pop r, unlock
                                  _write(r)
                                  _work.wait()  ── sleeps until the next post
```

```gdscript:title="res://systems/save_worker.gd"
class_name SaveWorker extends Node
## One background thread that writes save files. The semaphore counts
## outstanding requests; the mutex guards the request list.

signal save_finished(slot: int)

var _pending: Array[SaveRequest] = []
var _mutex := Mutex.new()
var _work := Semaphore.new()
var _thread := Thread.new()
var _quit := false

func _ready() -> void:
	_thread.start(_run)

## Main thread. Each call is one job, and one post.
func request_save(request: SaveRequest) -> void:
	_mutex.lock()
	_pending.push_back(request)
	_mutex.unlock()
	_work.post()

func _run() -> void:
	while true:
		_work.wait()  # sleeps until the count is above zero, then decrements it
		if _quit:
			break
		_mutex.lock()
		var request: SaveRequest = _pending.pop_front()
		_mutex.unlock()
		_write(request)
		call_deferred("emit_signal", "save_finished", request.slot)

func _write(request: SaveRequest) -> void:
	var file := FileAccess.open("user://save_%d.json" % request.slot, FileAccess.WRITE)
	file.store_string(JSON.stringify(request.data))

func _exit_tree() -> void:
	_quit = true
	_work.post()  # wake the worker so it can see _quit and leave
	_thread.wait_to_finish()
```

The pairing is the contract: **one `post()` per item pushed, one `wait()` per item popped**. Because the semaphore's count matches the list's length, the worker never wakes to find an empty list and never sleeps while something is waiting. The mutex still guards the Array — a semaphore orders *when* the worker runs, it does not make `push_back` and `pop_front` safe against each other.

Shutdown is the same trick in reverse. Setting `_quit = true` alone does nothing, because the worker is asleep inside `wait()` and will never look at the flag. The extra `post()` is a wake-up with no job attached; the worker checks the flag first and exits. Then `wait_to_finish()` joins the thread — required before the `Thread` object is freed.

`emit_signal` from the worker would run any connected handler on the worker thread, and a handler that touches the HUD would break the [main-thread rule](/patterns/synchronisation/main-thread-ownership). `call_deferred("emit_signal", ...)` schedules the emission on the main thread at the end of the current frame.

### `try_wait` for the non-blocking side

`try_wait()` decrements the count if it is above zero and returns `true`; otherwise it returns `false` at once. It is the semaphore's answer to `try_lock()`, and its home is the main thread, which must never block. A worker that signals "one result ready" per `post()` can be polled per frame:

```gdscript:title="res://world/pathfinder_client.gd"
func _process(_delta: float) -> void:
	while _results_ready.try_wait():  # one result per post; drain all that are ready
		var path: PackedVector2Array = _pathfinder.pop_result()
		_apply_path(path)
```

The count does the counting for you. If the worker finished three paths since last frame, `try_wait()` succeeds three times and the fourth call returns `false` without blocking.

## The missed-post hang

Every semaphore bug is the same bug: the number of posts and the number of waits don't match.

- **A push without a post.** Someone adds a second entry point — `request_autosave()` — that pushes to `_pending` but forgets `_work.post()`. The item sits in the list; the worker sleeps until the *next* proper request wakes it, at which point it processes the stale one and leaves the new one behind. The count is now permanently off by one. Route every push through one method so there is one place to forget, and that place has the post.
- **Shutdown without a post.** `_quit = true` followed by `wait_to_finish()` and nothing else. The main thread blocks in the join, the worker blocks in `wait()`, and the game hangs on exit. Post before you join.
- **A wait without a pop.** The worker wakes, decides the request is invalid, and loops back to `wait()` without removing it. Now the list has one more item than the count. Pop first, decide later.
- **Two semaphores for one queue.** The count belongs with the container it counts. If a queue has one semaphore for "items" and another thread posts a different semaphore for the same items, one of them drifts. Package them together — the [Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue) exists so this pairing is written once.

When a worker sleeps and never wakes, pause the debugger and read the semaphore's count and the container's size side by side. They should be equal. Whichever is larger tells you which half of the pair went missing.

## When to Use

- A long-lived worker thread that should sleep between jobs — save serialisation, pathfinding requests, chunk generation, audio analysis.
- A "result ready" signal from a worker that the main thread polls with `try_wait()` once per frame.
- Anywhere you would otherwise write a sleep-and-poll loop or a spin on a mutex.

## When Not to Use

- One-off jobs. A `WorkerThreadPool.add_task()` runs the callable and finishes; there is no idle worker to wake. See [Worker Thread Pool](/patterns/concurrency/worker-thread-pool).
- The consumer is the main thread and the producer is a worker with a single result — return it from the thread's callable and collect it with `wait_to_finish()`, or hand it over with `call_deferred()`. No count to maintain.
- Multi-frame logic that doesn't need a thread at all — `await` a signal or a timer. A coroutine sleeping on `await` is cheaper and safer than any thread; see [Coroutines](/patterns/concurrency/coroutines).
- You need to wait on *several* things at once or with a timeout. `wait()` blocks on exactly one semaphore, indefinitely. Shape the design so each worker has one queue, or move the waiting to the main thread and use [Await and Timeouts](/patterns/concurrency/await-timeout).

## The Decision

**Semaphore vs. polling with a delay.** Polling is easier to write and easier to get wrong slowly. A `delay_msec(10)` loop is fine for a prototype and wrong for a shipped game: latency is bounded below by the delay, CPU use is bounded above by nothing, and the delay you pick becomes a magic number that someone else tunes blindly. The semaphore's `wait()` costs nothing while idle and wakes in microseconds. It is more code only by the four lines of bookkeeping, and that bookkeeping is the whole cost of the pattern.

**Semaphore vs. queue class.** A raw semaphore next to a raw mutex and a raw Array is three things that must agree. The moment there is more than one producer, or more than one method that pushes, wrap them in a [Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue) so the post lives inside `push()` and the wait lives inside `pop_blocking()`, and nobody outside can get the count wrong. This page shows the primitive; the queue is how you use it.

**Semaphore as a condition variable.** Without `Cond`, "wake everyone when the level changes" needs one post per waiter — and you must know how many there are. That is fragile, and usually a sign the waiting should happen on the main thread with signals instead. Keep semaphores for the one-producer-many-items or one-item-one-consumer shapes, where the count means something concrete. That is [the simplest thing](/philosophy/build-the-simplest-thing) that handles the case you actually have.

## Related Patterns

- **[Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue)**: the semaphore and mutex packaged with the container they protect; the form you'll actually use.
- **[Mutex](/patterns/synchronisation/mutex)**: still required for the container. A semaphore orders threads; it does not make data safe.
- **[Join](/patterns/synchronisation/join)**: the shutdown half — post to wake, then `wait_to_finish()`.
- **[Competing Consumers](/patterns/concurrency/competing-consumers)**: several workers waiting on one semaphore, each `wait()` claiming one item.
- **[Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership)**: why the worker's `emit_signal` goes through `call_deferred`.
