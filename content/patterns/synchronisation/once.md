---
title: "Once"
description: "Build expensive shared state lazily and exactly once with a static var and a static accessor, guarded by a Mutex only when worker threads may race to trigger it."
---

# Once

**Buys correct-by-construction lazy setup for expensive shared state; pays by being permanent — no retry on failure and no re-run.**

Once is the pattern for "build this the first time anyone asks, then hand out the same one forever." A lookup table that takes a second to compute, a Dictionary indexing every item Resource under `res://items/`, a noise permutation table, a compiled `Expression` list for dialogue conditions. None of it should be built at startup if the player may never reach the screen that needs it, and none of it should be built twice.

In GDScript the mechanism is a `static var` holding the instance and a `static func` that builds it on the first call. That is enough on the main thread, where calls can't interleave. When worker threads may also ask, a `Mutex` around the check-and-build turns "probably once" into "exactly once". The permanence is the cost either way: a failed build is cached as failed, and there is no re-running it without adding a reset you then have to make thread-safe too.

## Scenario

A crafting screen needs a recipe index: every `RecipeData` resource under `res://recipes/`, keyed by output item, with a reverse index from ingredient to recipes. Scanning a few hundred `.tres` files with `DirAccess` and `ResourceLoader` takes long enough to notice. The first version builds it in an Autoload's `_ready()`:

```gdscript:title="res://autoload/recipe_index.gd"
extends Node

var by_output: Dictionary[StringName, RecipeData] = {}
var by_ingredient: Dictionary[StringName, Array] = {}

func _ready() -> void:
	_scan("res://recipes/")   # BAD: 400 ms on every launch, main menu included
```

Every launch pays, including the one where the player quits at the title screen. So someone makes it lazy with a `null` check:

```gdscript
static var _instance: RecipeIndex = null

static func get_instance() -> RecipeIndex:
	if _instance == null:      # a worker task and the main thread can both see null here
		_instance = RecipeIndex.new()   # ...and both build it
	return _instance
```

Fine, until the loot generator on the [Worker Thread Pool](/patterns/concurrency/worker-thread-pool) asks for the index at the same moment the crafting screen does. Both see `null`, both scan, one build wins and the other's 400 ms was wasted — or worse, a caller gets the reference mid-construction and reads a half-filled Dictionary.

> **Smell:** A `null` check guards an expensive one-time build, and you're reasoning carefully about who gets there first. That reasoning is the pattern; write it once and stop repeating it.

## Solution

Move the index off the tree into a `RefCounted` class with a static accessor. On the main thread alone this is complete. Add the mutex when any worker may call it.

```
RecipeIndex (RefCounted, static _instance)
  get_instance() ── lock ── null? build ── unlock ── return
       ▲                                       ▲
  crafting screen (main)             loot task (worker)
  both get the same object; the build ran once
```

```gdscript:title="res://systems/recipe_index.gd"
class_name RecipeIndex extends RefCounted
## Lazy, shared, built once. Immutable after construction, so any thread
## can read it without a lock once it has the reference.

static var _instance: RecipeIndex = null
static var _build_mutex := Mutex.new()
static var _build_count: int = 0   # only to demonstrate; remove in a real project

var by_output: Dictionary[StringName, RecipeData] = {}
var by_ingredient: Dictionary[StringName, Array[RecipeData]] = {}

static func get_instance() -> RecipeIndex:
	_build_mutex.lock()
	if _instance == null:
		_instance = RecipeIndex._build("res://recipes/")
	var instance := _instance
	_build_mutex.unlock()
	return instance

static func _build(root: String) -> RecipeIndex:
	_build_count += 1
	var index := RecipeIndex.new()
	var dir := DirAccess.open(root)
	if dir == null:
		push_error("RecipeIndex: cannot open %s" % root)
		return index   # empty but valid; see "no retry" below
	for file_name: String in dir.get_files():
		if not file_name.ends_with(".tres"):
			continue
		var recipe := ResourceLoader.load(root.path_join(file_name)) as RecipeData
		if recipe == null:
			continue
		index.by_output[recipe.output_id] = recipe
		for ingredient: StringName in recipe.ingredient_ids:
			if not index.by_ingredient.has(ingredient):
				index.by_ingredient[ingredient] = [] as Array[RecipeData]
			index.by_ingredient[ingredient].append(recipe)
	return index

func recipes_using(ingredient: StringName) -> Array[RecipeData]:
	return by_ingredient.get(ingredient, [] as Array[RecipeData])
```

Callers on either side write the same line:

```gdscript:title="res://ui/crafting_screen.gd"
func _on_ingredient_selected(id: StringName) -> void:
	for recipe: RecipeData in RecipeIndex.get_instance().recipes_using(id):
		_add_row(recipe)
```

```gdscript:title="res://loot/loot_generator.gd"
func _generate_task(index: int) -> void:   # WorkerThreadPool group task
	var recipes := RecipeIndex.get_instance()   # same object; build ran at most once
	_results[index] = _pick_craftable(recipes, _seeds[index])
```

A stress test with fifty simultaneous callers proves the guarantee. Fifty tasks each call `get_instance()`; the count is one:

```gdscript:title="res://tests/test_recipe_index.gd"
func test_builds_exactly_once() -> void:
	var seen: Array[RecipeIndex] = []
	seen.resize(50)
	var gid := WorkerThreadPool.add_group_task(
		func(i: int) -> void: seen[i] = RecipeIndex.get_instance(), 50)
	WorkerThreadPool.wait_for_group_task_completion(gid)
	assert_eq(RecipeIndex._build_count, 1)
	assert_true(seen.all(func(idx: RecipeIndex) -> bool: return idx == seen[0]))
```

What makes it correct:

- **The check and the build are under the same lock.** A caller that arrives while the first build is running blocks on `lock()`, then sees the finished instance. It never sees `null` after someone else started, and never sees a half-built index — the assignment to `_instance` happens after `_build` returns.
- **The lock is taken on every call, including the fast path.** An uncontended lock costs well under a microsecond. Skipping it with a lock-free `null` check first is the "double-checked locking" trick, and in a language with no memory-ordering guarantees it is exactly the bug it looks like it avoids. Pay the microsecond.
- **The instance is immutable after construction.** That is why callers can read it from any thread without holding the lock. If the index needed to change after build, this would be a [Mutex](/patterns/synchronisation/mutex) or [Snapshot](/patterns/synchronisation/snapshot) problem, not a Once problem.

### No retry on failure

If `_build` fails — the directory is missing, a resource is corrupt — the code above still caches whatever it returned. That's deliberate: a Once that retries is a different, harder pattern (which caller retries, how often, what do the others get meanwhile?). The honest options are:

1. **Cache the failure loudly.** `push_error` and return an empty-but-valid index, as above. The game runs with no recipes and the log says why. Right for content that ships with the game and can't be missing in a working build.
2. **Don't cache on failure.** Leave `_instance` null and return the temporary; the next call tries again. Only sensible when the failure is transient (a network-backed table, a file another system writes late), and you must accept that every failed call pays the full cost.

Pick one and write it down in the accessor. What you must not do is cache silently: a `null` returned forever with no log is a bug that surfaces as "crafting is empty on some machines" three weeks later.

### `preload` and Autoloads are the eager versions

`const RECIPES := preload("res://recipes/index.tres")` builds at script load. An Autoload builds at startup. Both are the right choice when the state is cheap or always needed, and there is nothing lazy to gain. Once earns its place when construction is expensive *and* optional — the crafting index in a game where half the players never craft. Don't make initialisation lazy by reflex.

## When to Use

- Expensive shared state that not every session needs: an index over resources, a precomputed table, a parsed rules file, a compiled list of `Expression`s.
- The state is immutable once built, so readers need no further synchronisation.
- Worker threads may be the first to ask, so "the main thread builds it in `_ready`" isn't guaranteed to happen first.

## When Not to Use

- The value is cheap or always needed — `preload` it, `@export` it, or build it in an Autoload's `_ready()`. Lazy setup adds a first-use hitch for nothing.
- The state must change after build — a cache that fills over time is a [Mutex](/patterns/synchronisation/mutex)-guarded class; a rarely-rebuilt table is a [Snapshot](/patterns/synchronisation/snapshot).
- You need to rebuild on demand — after a mod loads, after a language change. Add an explicit `reset()` under the same mutex and accept that callers holding the old instance keep it. At that point you are writing a small cache, and the name should say so.
- Only the main thread will ever call it. Keep the `static var` and the accessor, drop the mutex. The lock is for threads, not for style.

## The Decision

**Lazy vs. eager.** The first-call cost doesn't vanish; it moves to whichever frame first needs the state — which is often mid-gameplay, the worst possible frame. If the index takes 400 ms, a lazy Once turns a startup delay into a hitch when the player opens crafting. The fix is to *trigger* the Once from a loading screen (`RecipeIndex.get_instance()` in a `WorkerThreadPool` task while the progress bar spins), keeping the laziness for sessions that never craft and hiding the cost for sessions that do.

**Static state and tests.** A `static var` is process-global: it survives scene changes and persists between test cases in GUT or gdUnit4. Give the class a `static func reset_for_tests()` that nulls the instance under the mutex, and call it in `before_each`. Without it the second test inherits the first test's index and passes for the wrong reason — the same hidden-state tax an [Autoload Singleton](/patterns/creational/singleton) pays, just smaller.

**Permanence is the deal.** Once is easy precisely because it refuses to do anything twice. The moment you want retry, refresh, or invalidation, you are asking for a cache, and a cache is a [Mutex](/patterns/synchronisation/mutex) around state that changes. Name it that and design it that; a Once with a `_retries` counter is [the wrong abstraction](/philosophy/wrong-abstraction) wearing the right name.

## Related Patterns

- **[Singleton (Autoload)](/patterns/creational/singleton)**: the eager, node-based version of one shared instance; Once is the lazy, tree-free version.
- **[Mutex](/patterns/synchronisation/mutex)**: what guards the build here, and what you graduate to when the state must change after construction.
- **[Snapshot](/patterns/synchronisation/snapshot)**: for a shared table that's rebuilt occasionally rather than never.
- **[Proxy](/patterns/structural/proxy)**: lazy loading behind the same interface as the real object — Once is the thread-safe core of a lazy-loading proxy.
- **[Data Races](/patterns/synchronisation/data-races)**: why the bare `null` check is a race when workers are involved.
