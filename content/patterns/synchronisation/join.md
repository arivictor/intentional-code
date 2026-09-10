---
title: "Join"
description: "Wait for a batch of threads or pool tasks to finish with wait_to_finish and wait_for_task_completion — or poll is_alive and is_task_completed per frame so the main thread never stalls."
---

# Join

**Buys simple block-until-done coordination for a batch of threads or tasks; pays by doing only that — no errors, no cancellation, and a stalled frame if you join on the main thread.**

Joining answers one question: *is the work finished?* A `Thread` is joined with `wait_to_finish()`, which blocks until the callable returns and hands back its return value. A `WorkerThreadPool` task is joined with `wait_for_task_completion(id)`, a group task with `wait_for_group_task_completion(gid)`. That's the whole job. A join coordinates **completion**, not access — it does nothing to make shared memory safe. If two tasks write the same Array, you still need a [Mutex](/patterns/synchronisation/mutex) or disjoint slots; the join only tells you when they're both done.

There are two further facts about Godot that make joining non-optional. A started `Thread` must be joined before the `Thread` object is freed, or the engine reports an error and leaks the OS thread. And every `WorkerThreadPool` task id must be waited on — the pool holds the task's bookkeeping until you do. Joining isn't a nicety; it is how the engine reclaims the work.

## Scenario

A level is generated in four pieces on four threads. The main thread needs all four before it can stitch them. First attempt, in `_ready()`:

```gdscript:title="res://world/level_builder.gd"
class_name LevelBuilder extends Node

func _ready() -> void:
	var threads: Array[Thread] = []
	for quadrant: int in 4:
		var thread := Thread.new()
		thread.start(_generate_quadrant.bind(quadrant))
		threads.append(thread)
	for thread: Thread in threads:
		_stitch(thread.wait_to_finish())   # BAD: main thread blocks here for seconds
	_spawn_player()
```

It works, and the game freezes for as long as the slowest quadrant takes, with no loading bar and no way to cancel. The threads bought parallelism and the join gave the stall straight back to the main thread. Worse, if `_generate_quadrant` errors on one thread, `wait_to_finish` returns `null`, `_stitch(null)` throws a second error, and the other three threads are never joined because the function bailed out.

> **Smell:** `wait_to_finish()` or `wait_for_task_completion()` called from `_ready`, `_process`, or a signal handler on the main thread, on a thread that hasn't already finished. Every one of those calls is a frame you've chosen to drop.

## Solution

Start the work, then poll for completion once per frame. `Thread.is_alive()` and `WorkerThreadPool.is_task_completed(id)` are non-blocking; the frame keeps rendering and the loading bar keeps moving. Join only when polling says the work is done, at which point the join returns immediately.

```
_ready: start 4 threads
_process (frame 1..N): any still alive? → return, draw progress
_process (frame N+1): all dead → wait_to_finish() × 4 (instant) → stitch → done
```

```gdscript:title="res://world/level_builder.gd"
class_name LevelBuilder extends Node
## Generates four quadrants in parallel and stitches them when all are done.
## Threads are polled per frame and joined only once finished, so the frame
## never blocks on generation.

signal level_ready
signal progress_changed(fraction: float)

var _threads: Array[Thread] = []
var _results: Array[QuadrantData] = []

func _ready() -> void:
	_results.resize(4)
	for quadrant: int in 4:
		var thread := Thread.new()
		thread.start(_generate_quadrant.bind(quadrant))
		_threads.append(thread)

func _generate_quadrant(quadrant: int) -> QuadrantData:   # worker thread
	return QuadrantGenerator.new().generate(quadrant, _seed)

func _process(_delta: float) -> void:
	var finished := 0
	for thread: Thread in _threads:
		if not thread.is_alive():
			finished += 1
	progress_changed.emit(float(finished) / _threads.size())
	if finished < _threads.size():
		return
	for quadrant: int in _threads.size():
		_results[quadrant] = _threads[quadrant].wait_to_finish()   # already finished: no wait
	_threads.clear()
	set_process(false)
	_stitch(_results)
	level_ready.emit()

func _exit_tree() -> void:
	for thread: Thread in _threads:   # scene changed mid-generation: still must join
		thread.wait_to_finish()
	_threads.clear()
```

The pieces that matter:

- **Each thread returns its result.** `wait_to_finish()` returns the callable's return value, so the worker never writes into a shared Array — it hands ownership back through the join. No lock, no race.
- **`is_alive()` gates the join.** By the time `wait_to_finish()` is called the thread has already exited, so the join is a bookkeeping call that returns at once.
- **`_exit_tree` still joins.** If the player backs out to the menu while quadrants are generating, the node leaves the tree with four live threads. Joining there blocks briefly — you can add a cancel flag the workers check, which is [Cancellation](/patterns/concurrency/cancellation) — but it is required. A `Thread` freed while running is an engine error, and the OS thread carries on writing into memory you've released.

### Joining pool tasks

`WorkerThreadPool` has the same shape with different names. For a batch, a group task is one id to wait on instead of N:

```gdscript:title="res://world/level_builder.gd"
var _group_id: int = -1
var _results: Array[QuadrantData] = []

func _ready() -> void:
	_results.resize(4)
	_group_id = WorkerThreadPool.add_group_task(_generate_into, 4, -1, false, "Level quadrants")

func _generate_into(quadrant: int) -> void:   # pool thread; each index owns its own slot
	_results[quadrant] = QuadrantGenerator.new().generate(quadrant, _seed)

func _process(_delta: float) -> void:
	var done := WorkerThreadPool.get_group_processed_element_count(_group_id)
	progress_changed.emit(float(done) / 4)
	if not WorkerThreadPool.is_group_task_completed(_group_id):
		return
	WorkerThreadPool.wait_for_group_task_completion(_group_id)   # releases the task; instant
	_group_id = -1
	set_process(false)
	_stitch(_results)
	level_ready.emit()

func _exit_tree() -> void:
	if _group_id != -1:
		WorkerThreadPool.wait_for_group_task_completion(_group_id)
```

Here each task writes `_results[quadrant]` — its own slot, which no other task touches. That's the cleanest way to share an Array across a batch: disjoint indices, and read the whole thing only after the join. Resizing the Array *before* starting the tasks matters; `resize()` during the batch would be a write to the container itself, racing with every task.

For single tasks the calls are `add_task(callable)`, `is_task_completed(id)`, and `wait_for_task_completion(id)`. A task's callable can't return a value through the pool, so it writes its result somewhere the main thread reads after the join — a slot, or a [Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue).

### When blocking is fine

Joining blocks, and sometimes that's exactly right:

- **A worker joining its own sub-workers.** A pool task that fans out into three more tasks and waits for them stalls only itself. The main thread never notices.
- **Shutdown.** `_exit_tree` and `NOTIFICATION_WM_CLOSE_REQUEST` are the moments where a brief block to collect threads is preferable to leaking them.
- **A dedicated loading scene.** If the loading screen is itself driven by `_process` polling, it's not blocking. If you'd rather write a linear coroutine, `await get_tree().process_frame` between `is_alive()` checks gets you sequential-looking code that still yields every frame — see [Coroutines](/patterns/concurrency/coroutines).

What is never fine is a join in `_process` on a thread you haven't confirmed finished, or in a signal handler. Those are frames dropped by choice.

## When to Use

- A known batch of threads or tasks whose results you need all at once — quadrants, a set of files to parse, a batch of paths.
- Cleanup: every started `Thread` and every pool task id needs one join before the owner goes away.
- Simple "wait for the sub-jobs" inside a worker, where blocking hurts nothing.

## When Not to Use

- The results should be applied as they arrive rather than when the last one lands — deliver each with `call_deferred()` as it finishes ([Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership)) or through a queue the main thread drains per frame.
- The work is a stream, not a batch: a long-lived worker that never "finishes" is a [Semaphore](/patterns/synchronisation/semaphore)-driven loop, joined only at shutdown.
- You need to stop on the first failure or cancel the rest. A join has no opinion about errors; the callable returns `null` and the others keep running. Combine with a shared cancel flag — [Cancellation](/patterns/concurrency/cancellation) — and check results after the join.
- You're trying to protect shared memory. A join orders *completion*; two tasks writing the same slot before the join is still a [data race](/patterns/synchronisation/data-races).

## The Decision

**Poll vs. block.** `wait_to_finish()` is a hard stop; `is_alive()` in `_process` is a one-line check per frame. On the main thread the poll is nearly always right, because the alternative is a frame the player sees hitch. The cost is that your completion logic lives in `_process` instead of reading top-to-bottom — the same trade every [coroutine](/patterns/concurrency/coroutines) makes. Off the main thread, block: a worker waiting on its sub-tasks is spending time it had nothing else to do with.

**Threads vs. the pool for a batch.** Four `Thread` objects give you four return values through `wait_to_finish()` and four things to join. One `add_group_task` gives you one id, disjoint slots for results, and no thread startup cost — but no return values and a callable that must write somewhere. For a batch that runs once per level, either is fine. For batches that recur every few seconds, the pool wins, and the [Worker Thread Pool](/patterns/concurrency/worker-thread-pool) page argues why.

**What a join doesn't tell you.** It tells you the work finished, not that it succeeded. Design the result type so failure is visible after the join — `null`, an `error` field on the result, an empty `PackedByteArray` — and check it on the main thread. This is [the simplest thing](/philosophy/build-the-simplest-thing) the primitive does; the errors and the cancellation are yours to add, and only when you need them.

## Related Patterns

- **[Cancellation](/patterns/concurrency/cancellation)**: the flag that lets a join in `_exit_tree` return quickly instead of waiting out the whole job.
- **[Worker Thread Pool](/patterns/concurrency/worker-thread-pool)**: where the task ids you join come from, and why group tasks beat a Thread per item.
- **[Fan-out / Fan-in](/patterns/concurrency/fan-out-fan-in)**: the group-task pattern this page's second example is a piece of.
- **[Mutex](/patterns/synchronisation/mutex)**: what you also need if tasks share mutable state — a join doesn't protect memory.
- **[Semaphore](/patterns/synchronisation/semaphore)**: for the long-lived worker that never finishes and is joined only at shutdown.
