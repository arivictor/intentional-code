---
title: "Main-Thread Ownership"
description: "Keep every node mutation on the main thread: worker threads compute plain values and hand them back with call_deferred or call_thread_safe, so the scene tree never needs a lock."
---

# Main-Thread Ownership

**Buys freedom from locks around the scene tree by letting only the main thread touch nodes; pays in hand-off plumbing — workers compute values, the main thread applies them.**

The scene tree is not thread-safe, and Godot does not pretend otherwise. Adding a child, setting a position, playing an animation, emitting a signal whose handler touches a node — all of these assume they run on the main thread, between one frame and the next. Rather than guard the tree with locks (which would make every `_process` call pay for the rare thread), Godot's answer is ownership: **the main thread owns every node, and nobody else mutates one.** Worker threads exist to compute — a path, a chunk, a serialised save, a parsed file — and the value they compute crosses back to the main thread through a hand-off the engine provides.

Kept honestly, the rule eliminates an entire class of bugs. There is no lock around `position` because there is no second writer of `position`. The price is that every worker result needs a few lines of plumbing to get applied, and the temptation to skip those lines "just this once" is where the crashes come from.

## Scenario

A pathfinding worker computes a route for each enemy and, being helpful, moves the enemy along it:

```gdscript:title="res://ai/path_worker.gd"
class_name PathWorker extends Node

var _thread := Thread.new()

func _ready() -> void:
	_thread.start(_run)

func _run() -> void:
	for enemy: Enemy in get_tree().get_nodes_in_group("enemies"):  # BAD: tree walk off-thread
		var path := _compute_path(enemy.global_position, _target)
		enemy.path = path
		enemy.get_node("Sprite2D").modulate = Color.RED   # BAD: node property from a worker
		enemy.state_changed.emit("pursuing")              # BAD: handlers run on this thread
```

In a debug build this stops immediately with an error like `Caller thread can't call this function in this node (/root/Level/Enemies/Grunt3). Use call_deferred() or call_thread_group() instead.` In a release build the checks are gone and the code runs — sometimes. `get_nodes_in_group()` can return a node that the main thread is freeing at that moment. Setting `modulate` from two threads at once can leave the CanvasItem's render state half-updated. The emitted signal runs every connected handler on the worker, so the HUD script that listens for `state_changed` now updates a `Label` from a thread too. The bugs cascade from one crossing.

> **Smell:** A `Thread` callable or `WorkerThreadPool` task holds a reference to a `Node` and calls a method or sets a property on it. Any method, any property. If a node appears on the left of an assignment inside a worker, the rule is already broken.

## Solution

Split the work: the worker computes plain values from plain inputs, and the main thread applies them. The worker never holds a node.

```
main thread                        worker thread
───────────                        ─────────────
gather inputs (positions, grid) ─▶ _compute_path(from, to, grid)
                                   returns PackedVector2Array
apply: enemy.path = result      ◀─ call_deferred / call_thread_safe
```

```gdscript:title="res://ai/path_worker.gd"
class_name PathWorker extends Node
## Owns one worker thread. The thread only ever sees Vector2s and a grid copy;
## nodes are read and written on the main thread on either side of it.

var _grid: NavGrid            # immutable once built; safe to read from any thread
var _thread := Thread.new()

## Main thread: gather inputs as plain values, hand them to the worker.
func request_path(enemy: Enemy, target: Vector2) -> void:
	var from := enemy.global_position
	var enemy_id := enemy.get_instance_id()
	_thread.start(_run.bind(from, target, enemy_id))

## Worker thread: pure computation. No nodes in, no nodes out.
func _run(from: Vector2, to: Vector2, enemy_id: int) -> void:
	var path := _grid.find_path(from, to)   # PackedVector2Array
	_apply_path.call_deferred(enemy_id, path)

## Main thread, end of frame: the only place a node is touched.
func _apply_path(enemy_id: int, path: PackedVector2Array) -> void:
	var enemy := instance_from_id(enemy_id) as Enemy
	if not is_instance_valid(enemy):
		return   # it died while we were computing; nothing to apply
	enemy.path = path
	enemy.state_changed.emit("pursuing")
```

The crossing points are explicit and narrow:

- **Inputs cross as values.** `enemy.global_position` is read on the main thread and passed as a `Vector2`. The worker gets an instance id, not the node, so it cannot touch the node even by accident.
- **Outputs cross through `call_deferred`.** `Callable.call_deferred()` queues the call to run on the main thread at the end of the current frame. By the time `_apply_path` runs, the worker is done with the result and the main thread is the only owner.
- **The main thread re-validates.** A frame or two passed. The enemy may have been freed. `instance_from_id` plus `is_instance_valid` handles it; holding a direct `Enemy` reference across the thread would have been a dangling pointer waiting to happen.

### The three hand-offs

Godot gives you three ways to ask the main thread to do something, and the choice depends on where the caller is.

**`call_deferred("method", args)` / `callable.call_deferred(args)`** always queues. From a worker it's the standard delivery; from the main thread it delays to end of frame, which is also how you defer tree changes out of a signal handler — see [Deferred Calls](/patterns/concurrency/call-deferred).

**`object.call_thread_safe("method", args)` / `set_thread_safe("prop", value)`** check the calling thread. On the main thread they call or set immediately; on any other thread they defer. Use these in code that may be called from either side — a helper that both `_process` and a worker invoke — so the main-thread path pays no deferral latency.

**`emit_signal` via `call_deferred("emit_signal", "name", args)`.** Signals are synchronous: emitting from a worker runs every handler on the worker. Route the emission through `call_deferred` and the handlers run on the main thread as they expect. `notify_thread_safe(what)` does the same for notifications.

```gdscript
# In a worker:
call_deferred("emit_signal", "chunk_generated", coord)   # handlers run on main
set_thread_safe("progress", 0.5)                          # deferred from here
# On the main thread the same line:
set_thread_safe("progress", 0.5)                          # applied immediately
```

### The debug checks

In debug builds (and in the editor), Node methods that affect the tree carry a thread guard. Call one from a thread other than the main thread and you get the "Caller thread can't call this function in this node" error, with the node path, and the call is skipped. The guard covers the tree operations — `add_child`, `remove_child`, `queue_free`, `get_node`, property setters that reach the servers — not your own script variables. It catches the crossing, not the data race behind it; that distinction is the whole of [Data Races](/patterns/synchronisation/data-races).

`Thread.set_thread_safety_checks_enabled(false)` turns the guard off for the calling thread. It exists for people who have read the source and know a specific call is safe from a specific thread. If you are reaching for it to make an error message go away, the error was correct and you are about to ship the crash to a release build where no one will tell you.

The engine offers one sanctioned exception: a node can set `process_thread_group` to `PROCESS_THREAD_GROUP_SUB_THREAD`, and then its `_process` and its descendants' run on a pool thread. That subtree becomes its own island with the same rule — nodes in the group can touch each other, and everything else is reached through `call_thread_group` or deferred calls. It is an advanced tool for heavy simulation subtrees, not a way around the rule.

## Why a bool flag across threads is still a race

The tempting shortcut: the worker writes `_done = true` when the result is ready, and `_process` checks the flag. No lock, one bool, what could go wrong?

In GDScript, two things. First, there are no atomics and no memory-ordering guarantees in the language. The worker writes the result *then* the flag; nothing promises the main thread sees those two writes in that order. It can read `_done == true` and then read a result that isn't there yet. On a desktop x86 CPU you will probably never observe this; on an ARM phone or console you might, and it will not reproduce in the editor.

Second, a `bool` in a script is a `Variant` slot, and a Variant write is not a single machine store. In practice a bool assignment usually is, but "in practice" is not what the language guarantees, and you can't test the difference.

Both hand-offs the engine provides — `call_deferred` and a [Mutex](/patterns/synchronisation/mutex) — establish the ordering the flag lacks. The deferred call is queued through a lock inside the engine; by the time it runs, everything the worker wrote before queuing it is visible. That is why "just `call_deferred` the result" is not merely tidier than the flag: it is the version that is actually correct.

## When to Use

- Always, for nodes. This is not an option you weigh; it's the contract the engine is built on. The question is only how the hand-off is written.
- Any background work whose result lands in the tree: pathfinding, chunk generation, save serialisation, `ResourceLoader.load_threaded_request` results, network parsing.
- Plain shared objects too, when the reads are all on the main thread — a [Snapshot](/patterns/synchronisation/snapshot) delivered by `call_deferred` needs no mutex at all.

## When Not to Use

- Heavy per-frame results that would flood the deferred queue. Ten thousand `call_deferred` calls a frame is a queue you'll feel. Batch them: the worker fills an Array, and one deferred call applies the batch — or push them through a [Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue) that the main thread drains each frame.
- Workers that need to *read* tree state continuously. Don't reach into nodes from the thread; copy the state out as values once per job (or publish a [Snapshot](/patterns/synchronisation/snapshot) from the main thread) and let the worker read the copy.
- Work that fits in a frame. If the computation takes half a millisecond, do it in `_process` and skip the thread, the hand-off, and the validity check.

## The Decision

**Ownership vs. locks.** A lock around the tree would be impossible to get right (which lock, around which subtree, held by whom during `_process`?) and unbearably slow. Ownership makes the fast path — the main thread, every frame — completely free, and puts all the cost on the rare crossing. That's the right way round. What you give up is convenience: a worker can't "just set" something, and you'll write a small `_apply_*` method per result type.

**`call_deferred` vs. `call_thread_safe`.** Deferred is the explicit, always-later choice; use it when the caller is definitely a worker or when you *want* end-of-frame timing. `call_thread_safe` and `set_thread_safe` are for shared helpers, where deferring on the main thread would add a frame of latency for nothing. Neither is wrong; picking `call_thread_safe` everywhere hides which calls actually cross threads, and that visibility is worth keeping.

**Where the rule bites.** The failure mode is never the obvious `add_child` in a thread — the debug guard catches that in seconds. It is the handler three signals away that touches a `Label`, or the `Array[Enemy]` captured into a `bind()` "just to read positions". Keep the rule mechanical: nodes never cross into a `Thread` callable or a `WorkerThreadPool` task, in either direction. Instance ids, Vector2s, PackedArrays, Dictionaries, and Resources cross freely. This is [keeping changes local](/philosophy/keep-changes-local) applied to threads — the worker's world is values in, values out, and the tree stays where it can be reasoned about.

## Related Patterns

- **[Deferred Calls](/patterns/concurrency/call-deferred)**: the mechanics and ordering of `call_deferred`, on and off the main thread.
- **[Data Races](/patterns/synchronisation/data-races)**: what the debug guard does and doesn't detect, and why the bool flag is a race.
- **[Snapshot](/patterns/synchronisation/snapshot)**: the read-side counterpart — publish an immutable copy so workers can read state without touching nodes.
- **[Mutex](/patterns/synchronisation/mutex)**: for the plain-object state both sides genuinely share; never for nodes.
- **[Worker Thread Pool](/patterns/concurrency/worker-thread-pool)** and **[Cancellation](/patterns/concurrency/cancellation)**: where the workers come from, and how they stop when the scene that owns them leaves the tree.
