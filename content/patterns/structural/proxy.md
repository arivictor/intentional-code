---
title: "Proxy"
description: "Stand in for a heavy scene, a locked shop, or an expensive query behind the same interface as the real thing, deciding when and whether the call gets through."
---

# Proxy

**Buys transparent lazy loading, access control, and caching behind the same interface as the real object; pays in keeping the proxy in sync and first-use latency.**

A Proxy presents the same interface as the object it stands in for, and decides what happens to each call: forward it, delay it, refuse it, or answer from memory. The caller cannot tell the difference, and that is the point. Three kinds turn up in Godot projects often enough to deserve their own names. A *lazy-loading* proxy holds the path to a heavy scene and only loads it — off the main thread, via `ResourceLoader.load_threaded_request` — when something asks. An *access-control* proxy sits in front of a door, a shop, or a save slot and checks a condition before delegating. A *caching* proxy remembers the answer to an expensive query and returns it until told the world has changed.

Structurally a Proxy is indistinguishable from a [Decorator](/patterns/structural/decorator): one class wrapping another with the same methods. The difference is intent. A Decorator always calls inward and changes the result; a Proxy controls *whether* and *when* the inward call happens.

## Scenario

A level select screen preloads every level so that pressing Play is instant:

```gdscript:title="res://ui/level_select.gd"
extends Control

const LEVELS: Dictionary[StringName, PackedScene] = {
	&"tutorial": preload("res://levels/tutorial.tscn"),
	&"forest": preload("res://levels/forest.tscn"),
	&"caves": preload("res://levels/caves.tscn"),
	&"citadel": preload("res://levels/citadel.tscn"),
}

func _on_level_chosen(id: StringName) -> void:
	get_tree().change_scene_to_packed(LEVELS[id])
```

`preload` resolves when the script loads, so every level's scene, tileset, and audio sits in memory from the moment the menu appears. Startup takes six seconds on a mid-range phone and most of it is levels the player will not visit this session. The obvious fix, `load()` at the moment of the click, trades that for a two-second freeze on the main thread with the button still visually pressed. Neither the menu nor the level should have to know which trade you made.

## Solution

Give the menu one small interface for "a level I can get a scene from", and put the loading policy behind it.

```
             ┌──────────────────────────────┐
LevelSelect ►│ LevelSource (RefCounted)     │
             │ request()                    │
             │ is_ready() -> bool           │
             │ get_scene() -> PackedScene   │
             └───────────────┬──────────────┘
          ┌──────────────────┴──────────────────┐
          │                                     │
┌─────────▼──────────┐             ┌────────────▼───────────┐
│ PreloadedLevel     │             │ LazyLevel (proxy)      │
│ holds a PackedScene│             │ holds a path           │
│ always ready       │             │ threaded load on demand│
└────────────────────┘             └────────────────────────┘
```

```gdscript:title="res://levels/level_source.gd"
class_name LevelSource extends RefCounted
## What the level select talks to. It never learns how the scene arrived.

func request() -> void:
	pass

func is_ready() -> bool:
	return true

func get_scene() -> PackedScene:
	return null
```

```gdscript:title="res://levels/preloaded_level.gd"
class_name PreloadedLevel extends LevelSource
## The real thing: a scene that is already in memory.

var _scene: PackedScene

func _init(scene: PackedScene) -> void:
	_scene = scene

func get_scene() -> PackedScene:
	return _scene
```

The proxy owns a path and a background request. Its `is_ready()` polls the loader; the first successful poll pulls the finished scene across and the proxy becomes, in effect, a `PreloadedLevel`.

```gdscript:title="res://levels/lazy_level.gd"
class_name LazyLevel extends LevelSource
## Proxy: starts a threaded load on request(), hands over the real scene once it lands.

var _path: String
var _scene: PackedScene
var _requested := false

func _init(path: String) -> void:
	_path = path

func request() -> void:
	if _requested or _scene != null:
		return
	_requested = true
	ResourceLoader.load_threaded_request(_path)

func is_ready() -> bool:
	if _scene != null:
		return true
	if not _requested:
		return false
	var progress: Array = []
	match ResourceLoader.load_threaded_get_status(_path, progress):
		ResourceLoader.THREAD_LOAD_LOADED:
			_scene = ResourceLoader.load_threaded_get(_path)
			return true
		ResourceLoader.THREAD_LOAD_FAILED:
			push_error("Failed to load %s" % _path)
			_requested = false
	return false

func get_scene() -> PackedScene:
	if _scene == null:
		# The caller skipped is_ready(). Block rather than return null.
		request()
		_scene = ResourceLoader.load_threaded_get(_path)
	return _scene
```

The menu decides per level which source to use, and gets a prefetch for free: hovering a level tile starts its load while the player reads the description.

```gdscript:title="res://ui/level_select.gd"
extends Control

var _sources: Dictionary[StringName, LevelSource] = {
	&"tutorial": PreloadedLevel.new(preload("res://levels/tutorial.tscn")),
	&"forest": LazyLevel.new("res://levels/forest.tscn"),
	&"caves": LazyLevel.new("res://levels/caves.tscn"),
	&"citadel": LazyLevel.new("res://levels/citadel.tscn"),
}

func _on_level_hovered(id: StringName) -> void:
	_sources[id].request()

func _on_level_chosen(id: StringName) -> void:
	var source := _sources[id]
	%PlayButton.disabled = true
	source.request()
	while not source.is_ready():
		await get_tree().process_frame
	get_tree().change_scene_to_packed(source.get_scene())
```

The tutorial stays preloaded because it is small and every new player goes there first. Nothing in `_on_level_chosen` changes if that decision flips.

## Access control: a gated shop

The second kind of proxy checks a condition before delegating. The interface it protects can be anything — an `interact()` on a door, a `save()` on a slot — and the check lives in one place instead of at every call site.

```gdscript:title="res://shops/shop.gd"
class_name Shop extends RefCounted
## The real shop. Knows nothing about reputation.

signal purchased(item: ItemData)

var _stock: Array[ItemData] = []

func _init(stock: Array[ItemData]) -> void:
	_stock = stock

func get_stock() -> Array[ItemData]:
	return _stock

func buy(item: ItemData, wallet: Wallet) -> bool:
	if not _stock.has(item) or not wallet.spend(item.price):
		return false
	_stock.erase(item)
	purchased.emit(item)
	return true
```

```gdscript:title="res://shops/gated_shop.gd"
class_name GatedShop extends Shop
## Proxy: same interface, refuses until the faction likes you enough.

signal refused(reason: String)

var _real: Shop
var _faction: StringName
var _required: int

func _init(real: Shop, faction: StringName, required_reputation: int) -> void:
	super([])
	_real = real
	_faction = faction
	_required = required_reputation
	_real.purchased.connect(purchased.emit)

func get_stock() -> Array[ItemData]:
	return _real.get_stock() if _is_open() else []

func buy(item: ItemData, wallet: Wallet) -> bool:
	if not _is_open():
		refused.emit("The %s guild does not trade with you." % _faction)
		return false
	return _real.buy(item, wallet)

func _is_open() -> bool:
	return Reputation.get_standing(_faction) >= _required
```

The shop UI binds to a `Shop` and never asks about reputation. Note the plumbing: the proxy re-emits `purchased` and forwards `get_stock()`, because a caller that holds the proxy must see everything it would see through the real thing. Every method and signal added to `Shop` is one more to forward. That is the "keeping the proxy in sync" cost, and GDScript will not remind you — a missing override silently calls the base class's empty body.

A locked door is the same shape with `interact(player)` instead of `buy()` and `player.inventory.has(&"iron_key")` instead of a reputation check.

## Caching: remembered paths

The third kind fronts something expensive and answers repeat questions from memory. Pathfinding over a large `AStarGrid2D` is the usual candidate: fifty enemies asking for a route to the same player position each frame will compute nearly identical paths.

```gdscript:title="res://ai/path_cache.gd"
class_name PathCache extends RefCounted
## Caching proxy over AStarGrid2D. Same question, remembered answer, until the grid changes.

var hits := 0
var misses := 0

var _grid: AStarGrid2D
var _cache: Dictionary[Vector4i, PackedVector2Array] = {}

func _init(grid: AStarGrid2D) -> void:
	_grid = grid

func get_point_path(from: Vector2i, to: Vector2i) -> PackedVector2Array:
	var key := Vector4i(from.x, from.y, to.x, to.y)
	if _cache.has(key):
		hits += 1
		return _cache[key]
	misses += 1
	var path := _grid.get_point_path(from, to)
	_cache[key] = path
	return path

func invalidate() -> void:
	_cache.clear()
```

The level calls `invalidate()` whenever a wall is destroyed or a door opens; anything less precise and enemies walk through walls that appeared after their path was cached. After a minute of a swarm chasing a player who stands still:

```text
path cache: 37 misses, 2911 hits
```

`PathCache` does not extend `AStarGrid2D`; it exposes the one method the AI uses. That is a smaller promise than the full interface and a deliberate one — the proxy would otherwise have to forward forty methods, most of which would bypass the cache anyway.

## When to Use

- A scene or resource is heavy and may never be needed this session; load it on first use, off the main thread, without the caller knowing.
- A condition guards an action (key, reputation, quest state, unlocked slot) and you want that check in one place rather than at every call site.
- An expensive query is asked repeatedly with the same arguments and you can name the event that makes the answer stale.
- You want to swap the real object for the proxy in some builds only: a `LazyLevel` on mobile, a `PreloadedLevel` on desktop.

## When Not to Use

- The real object is cheap to create or already resident. A proxy over a `preload` is indirection with nothing behind it.
- The guard belongs at a higher level — a UI that never shows the button is simpler than a shop that refuses the click.
- You cannot name the invalidation event. A cache with no `invalidate()` call is a bug you have scheduled for later.
- The wrapper adds behaviour without ever refusing or deferring the call. That is a [Decorator](/patterns/structural/decorator); call it one.

## The Decision

You buy a caller that does not care about loading policy, permission, or cost, and you pay for that in two currencies. The first is synchronisation: a proxy must mirror every method and signal of the thing it fronts, and GDScript's base-class-with-defaults approach means a forgotten override fails quietly rather than loudly. Keep the shared interface as small as the callers allow; `LevelSource` has three methods because the menu needs three. The second is latency that moves. `LazyLevel` did not remove the two-second load, it moved it to the first `get_scene()`, and a caller that skips `is_ready()` gets the freeze back. The hover prefetch is the honest mitigation — start the work before it is needed — and it only works because the proxy owns the request.

The lazy variant has a Godot-specific rule: `load_threaded_get` and the status poll happen on the main thread, and the scene enters the tree on the main thread. The proxy never touches a node from a worker; the engine does the threading inside `ResourceLoader`, which is exactly why it is the right tool here and a hand-rolled `Thread` is not.

The caching variant's trade is staleness against work saved, and the `invalidate()` call is the part people forget to wire. If the world changes often, the cache is cleared often, and you have written a Dictionary that mostly misses. Measure the hit rate before keeping it. That is [the simplest thing that works](/philosophy/build-the-simplest-thing): add the proxy when the profiler or the loading screen says so, and remove it if the numbers do not.

## Related Patterns

- **[Decorator](/patterns/structural/decorator)**: Same shape, different purpose. A Decorator always calls the wrapped object and enriches the result; a Proxy decides whether the call reaches it at all.
- **[Adapter](/patterns/structural/adapter)**: Adapter changes the interface to fix a mismatch; Proxy preserves it and intercepts.
- **[Facade](/patterns/structural/facade)**: A Facade fronts several subsystems with a new, simpler interface; a Proxy fronts one object with the same interface.
- **[Object Pool](/patterns/creational/object-pool)**: A pool hides instantiation cost by reuse; a lazy proxy hides it by deferral. Pools suit many short-lived instances, proxies suit one heavy one.
- **[Once](/patterns/synchronisation/once)**: The "load exactly once on first use" guarantee inside `LazyLevel` is the Once pattern; the proxy is what puts it behind an interface.
- **[Scene Flow](/patterns/architectural/scene-flow)**: A scene flow manager typically holds a `LevelSource` per level and drives the loading screen off `is_ready()`.
