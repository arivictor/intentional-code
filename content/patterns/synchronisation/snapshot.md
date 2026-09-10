---
title: "Snapshot"
description: "Let readers on any thread use read-dominated state without a lock, by having the writer publish an immutable copy and swap it in under a lock that is held for one assignment."
---

# Snapshot

**Buys lock-free reads for read-dominated state by publishing immutable copies; pays a full copy per write — wrong when writes are frequent or the state is large.**

A snapshot is an immutable copy of some state, published as a unit. The writer builds a new copy in private, then swaps it into a shared slot in one step. Readers take whichever copy is current and work on it for as long as they like, with no lock held, because nobody will ever mutate that copy again. When the writer publishes the next one, readers who already hold the old copy keep it until they're done; it's freed when the last reference drops.

This is what other languages do with a read-write lock or an atomic pointer swap. GDScript has neither, but it has reference-counted Dictionaries, Arrays, and Resources, and `duplicate()`. That is enough. The pattern replaces a lock that many readers would contend on with a copy that one writer pays for.

## Scenario

A strategy game has a world map — ownership of every province, supply lines, fog of war — rewritten by a simulation tick on a worker thread every couple of seconds. The map is read constantly: the minimap redraws it every frame, tooltips query it on hover, and four AI tasks on the [Worker Thread Pool](/patterns/concurrency/worker-thread-pool) walk it to plan. The first version puts one [Mutex](/patterns/synchronisation/mutex) around it:

```gdscript:title="res://world/world_map.gd"
class_name WorldMap extends RefCounted

var _mutex := Mutex.new()
var _owner_of: Dictionary[int, int] = {}  # province id → faction id

func owner_of(province: int) -> int:
	_mutex.lock()
	var faction: int = _owner_of.get(province, -1)
	_mutex.unlock()
	return faction

func recompute(tick: SimulationTick) -> void:
	_mutex.lock()
	for province: int in tick.changes:   # held for the whole rewrite
		_owner_of[province] = tick.changes[province]
	_mutex.unlock()
```

Correct, and slow in the wrong place. The minimap calls `owner_of()` a thousand times per frame, so it takes and releases the lock a thousand times per frame, and every one of those calls can stall behind an AI task doing the same. During `recompute()` every reader in the game waits. The lock is doing the job of ordering readers against readers, who never conflict.

> **Smell:** A lock is taken thousands of times a second, almost always to read, and the writes that change the data are rare and bursty. Readers are waiting on other readers for nothing.

## Solution

Make the map data immutable once built. The writer constructs a fresh Dictionary, and publishes it by assignment. Readers take a reference to the current one and read it lock-free.

```
worker thread                       readers (any thread)
─────────────                       ────────────────────
build new_map (private)
lock ── _current = new_map ── unlock
                                    lock ── var map := _current ── unlock
                                    map.owner_of(...) × 1000   ← no lock held
                                    map.owner_of(...)
```

```gdscript:title="res://world/world_map_snapshot.gd"
class_name WorldMapSnapshot extends RefCounted
## An immutable view of the map. Build it, hand it out, never change it.
## No setters on purpose: a reader can hold this for as long as it likes.

var _owner_of: Dictionary[int, int]
var _supply: Dictionary[int, float]
var tick: int

func _init(owner_of: Dictionary[int, int], supply: Dictionary[int, float], at_tick: int) -> void:
	_owner_of = owner_of
	_supply = supply
	tick = at_tick

func owner_of(province: int) -> int:
	return _owner_of.get(province, -1)

func supply_at(province: int) -> float:
	return _supply.get(province, 0.0)

func provinces_of(faction: int) -> Array[int]:
	var result: Array[int] = []
	for province: int in _owner_of:
		if _owner_of[province] == faction:
			result.append(province)
	return result

## For the writer only: fresh copies it may edit without touching this snapshot.
func copy_owner_of() -> Dictionary[int, int]:
	return _owner_of.duplicate()

func copy_supply() -> Dictionary[int, float]:
	return _supply.duplicate()
```

```gdscript:title="res://world/world_map.gd"
class_name WorldMap extends RefCounted
## Holds the current snapshot. The only shared mutable thing is _current,
## and the lock around it is held for one assignment.

var _mutex := Mutex.new()
var _current := WorldMapSnapshot.new({}, {}, 0)

## Any thread. The lock is held for the time it takes to copy a reference.
## Everything the caller does with the snapshot afterwards is lock-free.
func current() -> WorldMapSnapshot:
	_mutex.lock()
	var snapshot := _current
	_mutex.unlock()
	return snapshot

## Simulation thread. Builds the next map in private, publishes it in one step.
func recompute(tick: SimulationTick) -> void:
	var previous := current()
	var owner_of := previous.copy_owner_of()   # the copy is the cost
	var supply := previous.copy_supply()
	for province: int in tick.changes:
		owner_of[province] = tick.changes[province]
	_recompute_supply(owner_of, supply)
	var next := WorldMapSnapshot.new(owner_of, supply, tick.number)
	_mutex.lock()
	_current = next
	_mutex.unlock()
```

A reader now takes the lock once per frame — or once per AI plan — and then runs a thousand lookups against its own reference with nothing held:

```gdscript:title="res://ui/minimap.gd"
extends Control

@onready var _world: WorldMap = %World.map

func _draw() -> void:
	var map := _world.current()   # one short lock
	for province: int in _province_shapes:
		draw_colored_polygon(_province_shapes[province], _faction_colour(map.owner_of(province)))
```

The two rules that make this correct:

- **The snapshot is never mutated after it is published.** `WorldMapSnapshot` has no setters, and `recompute()` duplicates before it edits. If a writer ever changed a published Dictionary in place, every reader holding it would be back in a race. The class shape enforces the promise; a comment would not.
- **The lock covers the reference swap only.** Assigning a Variant that holds an object is not guaranteed indivisible across threads, so the assignment and the read of `_current` go under a mutex — but the lock is held for a single statement, so contention is a few nanoseconds rather than the length of a rewrite.

### When the readers are all on the main thread

If nothing off the main thread ever reads the map — the simulation writes on a worker, the HUD and gameplay read on the main thread — you can drop the lock entirely. The worker builds the snapshot and delivers it with a deferred call; the main thread owns `_current` and nobody else touches it:

```gdscript:title="res://world/world_map.gd"
signal snapshot_changed(snapshot: WorldMapSnapshot)

func recompute(tick: SimulationTick) -> void:   # worker thread
	var next := _build(tick)
	_publish.call_deferred(next)

func _publish(next: WorldMapSnapshot) -> void:   # runs on the main thread, end of frame
	_current = next
	snapshot_changed.emit(next)

func current() -> WorldMapSnapshot:   # main thread only, no lock
	return _current
```

This is [Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership) applied to a plain object instead of a node, and it's the version to reach for first. The mutex variant exists for the case where worker threads read too.

### `duplicate(true)` and what counts as immutable

`Dictionary.duplicate()` copies one level; nested Arrays and Dictionaries inside are shared with the original. If a snapshot holds `Dictionary[int, Array[int]]`, a shallow copy lets the writer's edits to an inner Array leak into the published snapshot. Use `duplicate(true)` for nested containers, or build inner values fresh. A `Resource` used as a snapshot needs `duplicate(true)` for the same reason — `resource_local_to_scene` is irrelevant here; the subresources are what matter.

Values that GDScript passes by value — `int`, `float`, `Vector2`, `Color`, `String` — need no copying. A `PackedByteArray` or `PackedVector2Array` should be `duplicate()`d before the writer edits it unless you are certain nobody else holds it.

## When to Use

- State read far more often than it's written — a world map, a leaderboard, a navigation cost grid, a settings bundle, the current quest state — with readers on more than one thread or on a hot main-thread path.
- Readers need a *consistent* view across many lookups. A snapshot guarantees the minimap draws one tick, not half of one tick and half of the next. A per-lookup mutex does not.
- The writer can afford to rebuild the whole thing. A few thousand entries every few seconds is nothing.

## When Not to Use

- Writes are frequent or the state is large. A copy per write of a 4096×4096 tile grid at sixty updates a second is a bandwidth bill nobody should pay. Use a [Mutex](/patterns/synchronisation/mutex) with a small critical section, or chunk the state so each snapshot is one region.
- Writers need to mutate in place — increment a counter, append to a log — where "build a whole new copy" is absurd for the size of the change.
- There's exactly one reader and one writer and the reader is the main thread. Just hand the value over with `call_deferred()` and skip the abstraction.
- The state is a node or a scene subtree. Nodes cannot be snapshotted; keep tree state on the main thread.

## The Decision

**Snapshot vs. Mutex.** A mutex makes every access pay a little; a snapshot makes every write pay a lot so reads pay nothing. Count the ratio. A thousand reads per write, as with a minimap over a simulation tick, is decisively snapshot territory. Ten reads per write is a mutex. The profiler settles arguments here — look for readers stalled in `lock()`, not for a feeling that reads are hot.

**Copy cost is the honest price.** People forget that the copy in `recompute()` is O(n) every time, and that a deep copy of nested containers allocates every inner container too. If the state grows from hundreds of entries to hundreds of thousands, the pattern that was free becomes the frame spike. Measure the copy, and if it matters, split the state so a write copies one region instead of the world.

**Immutability is a promise the engine won't check.** Nothing stops a reader from calling `map._owner_of[province] = 3`. Private fields, no setters, and a class name that says `Snapshot` are the enforcement you have. This is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off): you are trading lock discipline for immutability discipline, and the second is easier to review because it's visible in the class shape.

## Related Patterns

- **[Mutex](/patterns/synchronisation/mutex)**: the simpler default; switch to a snapshot when readers contend.
- **[Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership)**: the lock-free variant when only the main thread reads.
- **[Memento](/patterns/behavioral/memento)**: the same immutable-copy idea used for undo and checkpoints rather than for threads.
- **[Flyweight](/patterns/structural/flyweight)**: shared immutable data across many instances — the same rule, "never mutate what's shared", applied to memory rather than time.
- **[Data Races](/patterns/synchronisation/data-races)**: why a reader touching a Dictionary the writer is editing is a race even if it "only reads".
