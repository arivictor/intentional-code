---
title: "Factory Method"
description: "Spawn scenes by string id or by a data Resource through one registry, so spawners never preload the concrete scene they create."
---

# Factory Method

**Buys spawning by name or data so callers never `preload` a concrete scene; pays in indirection and runtime-only failure on an unknown id.**

Factory Method separates *deciding which scene to make* from *making it*. The raw material in Godot is `PackedScene.instantiate()`, and every spawner already has something factory-shaped: a function that returns a node. The pattern earns its name when the choice is made from data rather than code — a string id from a wave file, a Resource a designer authored, a tile id from a map. The caller says "give me an archer here" and never learns which `.tscn` an archer is.

The guarantee is that one place maps ids to scenes. Adding an enemy type touches that registry — a `.tres` in the inspector, ideally — and nothing else. The cost is that the mapping is now data, and data can be wrong in ways the parser will never see: a misspelt id fails when the wave spawns, not when the script loads.

## Scenario

A wave spawner picks enemies by name. Every enemy type is a `preload` and a branch of a `match`.

```gdscript:title="res://levels/wave_spawner.gd"
extends Node2D

const GRUNT := preload("res://enemies/grunt.tscn")
const ARCHER := preload("res://enemies/archer.tscn")
const BRUTE := preload("res://enemies/brute.tscn")

func spawn(kind: String, at: Vector2) -> void:
	var enemy: Enemy
	match kind:
		"grunt":
			enemy = GRUNT.instantiate()
		"archer":
			enemy = ARCHER.instantiate()
		"brute":
			enemy = BRUTE.instantiate()
	enemy.global_position = at
	add_child(enemy)
```

Every new enemy means editing this file, and the boss arena has its own copy of the same `match` because it spawns differently. Each spawner preloads every enemy at scene load, including the brute that only appears on level nine. The wave data lives in a JSON file that names enemies by string, so a designer adding `"shaman"` to a wave gets nothing until a programmer adds a branch. And an unknown id doesn't fail as "unknown enemy" — `enemy` stays null and the crash is `Invalid assignment of property 'global_position' on a null instance`, three lines away from the cause.

> **Smell:** Two or more scripts contain the same `match kind:` over the same set of scenes, and adding a scene means finding all of them.

## Solution

Put the mapping in one Resource. `Dictionary[String, PackedScene]` is editable in the inspector, so the registry is a `.tres` file a designer can extend by dragging scenes into it. The factory owns the only `instantiate()` call and the only place an unknown id is reported.

```
WaveSpawner ──"archer"──► EnemyFactory ──► scenes["archer"].instantiate()
                              │
                              └── unknown id → push_error, return null
```

```gdscript:title="res://enemies/enemy_factory.gd"
class_name EnemyFactory extends Resource

## Spawn id → scene. Saved as res://enemies/enemy_factory.tres and
## edited in the inspector; no code changes to add an enemy.
@export var scenes: Dictionary[String, PackedScene] = {}

func has(id: String) -> bool:
	return scenes.has(id)

func create(id: String) -> Enemy:
	var scene: PackedScene = scenes.get(id)
	if scene == null:
		push_error("EnemyFactory: unknown enemy id '%s'" % id)
		return null
	var enemy := scene.instantiate() as Enemy
	assert(enemy != null, "Scene for '%s' does not have an Enemy root" % id)
	return enemy
```

The spawner takes the factory as an exported Resource. It no longer preloads anything and has no opinion about what an archer is.

```gdscript:title="res://levels/wave_spawner.gd"
class_name WaveSpawner extends Node2D

@export var factory: EnemyFactory
@export var wave: Array[String] = ["grunt", "grunt", "archer", "brute"]

func _ready() -> void:
	for i in wave.size():
		spawn(wave[i], Vector2(120 + 180 * i, 40))

func spawn(id: String, at: Vector2) -> Enemy:
	var enemy := factory.create(id)
	if enemy == null:
		return null
	enemy.global_position = at
	add_child(enemy)
	print("Spawned %s at %s" % [enemy.name, at])
	return enemy
```

With `brute` missing from the `.tres`:

```text
Spawned Grunt at (120, 40)
Spawned Grunt at (300, 40)
Spawned Archer at (480, 40)
EnemyFactory: unknown enemy id 'brute'
```

The failure is now named and local. It is still a runtime failure, which is the price of the pattern, so the next step is to move it as early as possible.

### Fail at load, not at wave seven

A wave that references an unknown id shouldn't wait until that wave to complain. Validate the whole level's spawn list in `_ready`, where a designer sees it the moment they press play.

```gdscript:title="res://levels/wave_spawner.gd"
func _ready() -> void:
	for id in wave:
		assert(factory.has(id), "Wave references unknown enemy id '%s'" % id)
	# ... spawn as before
```

`assert` is stripped from release builds, so pair it with a `push_error` if the wave data can arrive from a mod or a downloaded pack.

### Spawning by Resource

Strings are the weakest kind of id. If enemies already have a data Resource — and once you're using [Data-Driven Design](/patterns/architectural/data-driven) they will — the Resource can carry its own scene, and the factory's job becomes wiring the two together.

```gdscript:title="res://enemies/enemy_data.gd"
class_name EnemyData extends Resource

@export var display_name: String = "Grunt"
@export var scene: PackedScene
@export var max_health: int = 30
@export var speed: float = 80.0
@export var points: int = 10
```

```gdscript:title="res://enemies/enemy_factory.gd"
func create_from(data: EnemyData) -> Enemy:
	if data == null or data.scene == null:
		push_error("EnemyFactory: EnemyData has no scene (%s)" % (data.resource_path if data else "null"))
		return null
	var enemy := data.scene.instantiate() as Enemy
	enemy.setup(data)
	return enemy
```

The wave becomes `@export var wave: Array[EnemyData]`, populated by dragging `.tres` files in. The id is now a file path, a misspelling is impossible, and a wave that references a deleted enemy shows a broken-dependency warning in the editor rather than an error at runtime. Several enemies sharing one `EnemyData` is also [Flyweight](/patterns/structural/flyweight): they read the same stats and never write to them.

### Callables for things that aren't scenes

Not every product is a `PackedScene`. Status effects, AI behaviours, and dialogue actions are often plain `RefCounted` classes. The same registry shape works with `Dictionary[String, Callable]`, where each value is a constructor: `"burn": func() -> Effect: return BurnEffect.new()`. The factory calls the Callable instead of `instantiate()`; the rest is identical.

## When to Use

- Two or more scripts select from the same set of scenes, and adding a scene means editing all of them.
- The choice of scene comes from data: a wave file, a tilemap, a save game, a network message.
- You want designers to add types by editing a `.tres` in the inspector rather than a `match` in code.
- A spawner shouldn't pay to `preload` every scene it might theoretically create.

## When Not to Use

- There are two enemy types and no plan for more. `const GRUNT := preload(...)` and a direct `instantiate()` are simpler and fail at parse time.
- The caller needs the concrete type anyway — it configures archer-specific properties after spawning. Then the indirection hides nothing and a direct instantiate is clearer.
- You haven't felt the `match` pain yet. This is [YAGNI](/philosophy/no-pattern#yagni): the registry is worth its file when the third spawner appears, not before.

## The Decision

The registry buys open-ended extension — a new enemy is a new entry, not a new branch — and it buys a single place to report unknown ids. What it costs is that reading the code no longer tells you what gets spawned. To learn what `"brute"` is you open the `.tres`, and to learn whether a wave is valid you run it. A `match` over `preload`s is a closed set the script parser checks for you; a `Dictionary` is an open set nobody checks until it's used. Validation in `_ready` narrows that gap but doesn't close it, because the data can still change after the scene loaded.

The Godot-specific consideration is load time. A `preload` in a `const` is resolved when the script is parsed, so a spawner that preloads twelve enemy scenes pays for all twelve when the level loads. An `EnemyFactory.tres` holding twelve `PackedScene`s pays the same cost when the Resource loads. Neither is lazy. If the boss scene is heavy, keep it out of the registry and use `ResourceLoader.load_threaded_request` behind a [Proxy](/patterns/structural/proxy) instead.

This is the [Open/Closed Principle](/philosophy/keep-changes-local#solid) in practice: the spawner is closed to modification and the registry is open to extension — as long as you accept that the extension point is data, with data's failure mode.

## Related Patterns

- **[Abstract Factory](/patterns/creational/abstract-factory)**: when products come in families that must not mix — a faction's units *and* its projectiles — one registry per product type isn't enough; the family needs to be the unit of selection.
- **[Builder](/patterns/creational/builder)**: Factory Method chooses *which* scene; Builder configures *one* complex thing with many options. A factory often returns a builder for the caller to finish.
- **[Prototype](/patterns/creational/prototype)**: when the best template is an already-configured node in the scene, `duplicate()` beats a registry of `PackedScene`s.
- **[Object Pool](/patterns/creational/object-pool)**: a factory that hands back recycled instances instead of new ones. Same call site, different lifetime.
- **[Data-Driven Design](/patterns/architectural/data-driven)**: the `EnemyData` variant is the entry point; the factory is what turns a data Resource into a live node.
