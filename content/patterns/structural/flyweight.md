---
title: "Flyweight"
description: "Share one EnemyData Resource across a thousand enemies and one mesh across a MultiMesh, keeping only position and health per instance — and never writing to the shared side."
---

# Flyweight

**Buys large memory savings by sharing immutable data in Resources across thousands of instances; pays in the shared-mutation trap — edit a shared Resource and every user changes with it.**

A Flyweight splits an object into the part every instance has in common — *intrinsic* state — and the part that differs — *extrinsic* state. The common part is stored once and referenced; only the differing part is stored per instance. In Godot the common part is a `Resource`, and the engine does the sharing for you: `load()` and `preload()` return the same object for the same path, every `@export var data: EnemyData` pointing at `goblin.tres` points at one object, and a `MultiMesh` draws thousands of instances from one mesh. You rarely have to build a Flyweight. You have to notice that you already have one, decide where the intrinsic/extrinsic line sits, and then not break it.

The guarantee is memory that scales with the number of *types*, not the number of *instances*. The condition that comes with it, unstated in the engine, is that the shared side is read-only.

## Scenario

An enemy scene carries every stat as an export:

```gdscript:title="res://enemies/goblin.gd"
extends CharacterBody2D

@export var display_name: String = "Goblin"
@export var max_health: float = 30.0
@export var speed: float = 90.0
@export var damage: float = 6.0
@export var sprite_frames: SpriteFrames
@export var hit_sound: AudioStream
@export var loot_table: Array[ItemData] = []

var health: float
```

A horde level spawns a thousand of them. Each instance owns its own copies of seven properties, and `loot_table` is an Array, so each instance gets its own Array. Memory is the visible cost, but the quieter one is balance: a designer who tunes goblin speed edits `goblin.tscn`, and every placed goblin that had its speed overridden in a level keeps the old value. There are twelve `goblin_*.tscn` variants that differ only in numbers, and nobody is sure any more which one is the canonical goblin.

## Solution

Move the intrinsic state into a `Resource`. One `.tres` per enemy type, edited in the inspector, shared by every instance of that type.

```
goblin.tres (EnemyData)  ◄──┬── Enemy #1   position, health
  max_health 30             ├── Enemy #2   position, health
  speed 90                  ├── Enemy #3   position, health
  sprite_frames             │   ...
  loot_table                └── Enemy #1000

archer.tres (EnemyData)  ◄──┬── Enemy #1001
  ...                       └── ...
```

```gdscript:title="res://enemies/enemy_data.gd"
class_name EnemyData extends Resource
## Intrinsic state. One .tres per enemy type, shared by every instance of that type.
## Treat as read-only at runtime.

@export var display_name: String = "Goblin"
@export var max_health: float = 30.0
@export var speed: float = 90.0
@export var damage: float = 6.0
@export var sprite_frames: SpriteFrames
@export var hit_sound: AudioStream
@export var loot_table: Array[ItemData] = []
```

The node keeps only what differs per goblin:

```gdscript:title="res://enemies/enemy.gd"
class_name Enemy extends CharacterBody2D
## Extrinsic state only: this goblin's position, health, and current target.

@export var data: EnemyData

var health: float
var _target: Node2D

@onready var _sprite: AnimatedSprite2D = $AnimatedSprite2D

func _ready() -> void:
	assert(data != null, "%s has no EnemyData" % name)
	health = data.max_health
	_sprite.sprite_frames = data.sprite_frames

func _physics_process(_delta: float) -> void:
	if _target:
		velocity = global_position.direction_to(_target.global_position) * data.speed
		move_and_slide()

func take_damage(amount: float) -> void:
	health -= amount
	if health <= 0.0:
		queue_free()
```

The spawner hands each instance a reference to the shared data. No copy is made:

```gdscript:title="res://enemies/horde_spawner.gd"
extends Node2D

const ENEMY_SCENE := preload("res://enemies/enemy.tscn")
const GOBLIN := preload("res://enemies/data/goblin.tres")
const ARCHER := preload("res://enemies/data/goblin_archer.tres")

func spawn_horde(count: int) -> void:
	for i in count:
		var enemy: Enemy = ENEMY_SCENE.instantiate()
		enemy.data = ARCHER if i % 4 == 0 else GOBLIN
		enemy.position = _spawn_point(i)
		add_child(enemy)

	var first: Enemy = get_child(0)
	var second: Enemy = get_child(1)
	print("same data object: ", first.data == second.data)
	print("EnemyData objects alive: ", 2, " for ", count, " enemies")
```

```text
same data object: true
EnemyData objects alive: 2 for 1000 enemies
```

One goblin scene, twelve `.tres` files for twelve enemy types, and a designer who edits `goblin.tres` changes every goblin in the game at once. That last sentence is the feature, and it is also the trap.

## The shared-mutation trap

A status effect that slows its target reaches for the obvious field:

```gdscript:title="res://effects/slow.gd"
func apply(enemy: Enemy) -> void:
	enemy.data.speed *= 0.5   # every goblin in the level just slowed. Permanently.
```

`enemy.data` is the one `goblin.tres` object. Halving its speed halves the speed of every enemy referencing it, including ones spawned later, until the game restarts — the resource cache keeps the mutated object alive for the whole session. Nothing warns you. The inspector will not show it. And if a `@tool` script does the same thing in the editor, `ResourceSaver` may write the change back to disk. Arrays are worse: `enemy.data.loot_table.append(bonus_drop)` grows the shared Array and every goblin now drops the bonus.

Three defences, in order of preference.

**Never write to the shared side.** Extrinsic state that starts from intrinsic state gets copied into the node, the way `health` copies `max_health`. A slow effect belongs on the node:

```gdscript:title="res://enemies/enemy.gd"
var speed_multiplier := 1.0  # extrinsic; modifiers live here, not on data

func _physics_process(_delta: float) -> void:
	if _target:
		velocity = global_position.direction_to(_target.global_position) * data.speed * speed_multiplier
		move_and_slide()
```

**`duplicate()` when one instance genuinely needs its own copy.** A boss variant of the goblin with doubled health can start from the shared data and diverge:

```gdscript
var boss_data: EnemyData = GOBLIN.duplicate()
boss_data.max_health *= 2.0
boss_data.loot_table = boss_data.loot_table.duplicate()  # duplicate() is shallow; Arrays are still shared
enemy.data = boss_data
```

`Resource.duplicate()` copies exported properties but not the objects they point to unless you pass `true`, and even then a `SpriteFrames` sub-resource is copied along with the Array — usually far more than you wanted. Copy the fields you intend to change and leave the rest shared.

**`resource_local_to_scene`** on the Resource, ticked in the inspector, tells the engine to duplicate it automatically for each scene instance. That is the right setting for a `ShaderMaterial` whose `flash` parameter each enemy animates independently. It is the wrong setting for `EnemyData`, because it turns off the sharing entirely: a thousand goblins, a thousand copies, and you are back where the scenario started with the Flyweight quietly gone.

## MultiMesh: the rendering Flyweight

A thousand `AnimatedSprite2D` nodes is a thousand canvas items. When the enemies are visually identical, `MultiMeshInstance2D` draws all of them from one mesh and one texture, and each instance owns nothing but a `Transform2D`:

```gdscript:title="res://enemies/horde_renderer.gd"
extends MultiMeshInstance2D
## Draws every goblin from one mesh in one draw call. Instances own only a transform.

var _enemies: Array[Enemy] = []

func setup(enemies: Array[Enemy]) -> void:
	_enemies = enemies
	multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_2D
	multimesh.mesh = QuadMesh.new()
	multimesh.instance_count = enemies.size()

func _process(_delta: float) -> void:
	for i in _enemies.size():
		if is_instance_valid(_enemies[i]):
			multimesh.set_instance_transform_2d(i, _enemies[i].transform)
```

The same intrinsic/extrinsic split, applied to drawing: the mesh and texture are shared, the transform is per instance. Past a few thousand it becomes worth dropping the `Enemy` nodes too and keeping positions in a `PackedVector2Array`, at which point the "instance" has no object at all and the data Resource is the only thing left that looks like an enemy.

## When to Use

- Many instances of few types: enemies, tiles, projectiles, items, particles.
- Designers need to tune a type in one place and see every instance follow.
- The shared state is genuinely immutable at runtime, or you can make it so by copying the mutable parts to the node.
- Profiling — the Monitors tab under Object > Resources, or a memory snapshot — says instances are the pressure, not textures.

## When Not to Use

- Few instances. Ten bosses with ten stat blocks gain nothing from sharing and lose the convenience of per-scene overrides.
- The "shared" data varies per instance more often than not. That is extrinsic state wearing the wrong label.
- Instances must mutate their data. Either move the mutable part out, or accept `duplicate()` per instance and stop calling it a Flyweight.

## The Decision

You buy memory that grows with the type count and a single edit point per type. You pay with a rule the engine will not enforce: the shared object is read-only. GDScript has no `const` for Resource fields and no way to freeze one at runtime; the closest thing to a guard is a naming convention (`data`, never `stats`), a comment on the class, and reviewers who know the trap. Teams that get bitten once usually add a debug-build check — a `@tool`-free assertion in the effect system that refuses to touch anything that `is Resource` — and that is a reasonable price.

The line between intrinsic and extrinsic has to be drawn on purpose. `max_health` is intrinsic and `health` is extrinsic, which is obvious. `speed` is intrinsic until the first slow effect, at which point the honest split is `data.speed` plus a per-node multiplier, and the Resource stays untouched. When you cannot say which side a field belongs to, it has not been designed yet.

Sharing is also the reason to keep `EnemyData` a `Resource` and not a `Node`. A `Resource` is reference-counted, lives outside the tree, loads from a `.tres`, and can be handed to a `RefCounted` combat calculator in a gdUnit4 test with no scene. A node cannot be shared by two parents at all. Reach for the [simplest thing that works](/philosophy/build-the-simplest-thing) here: the pattern is one `class_name ... extends Resource` and one `@export`, and everything beyond that is discipline.

## Related Patterns

- **[Prototype](/patterns/creational/prototype)**: `duplicate()` is the Prototype pattern, and it is the escape hatch when an instance needs to diverge from its Flyweight. The shallow-versus-deep rules on that page are the ones that bite here.
- **[Data-Driven Design](/patterns/architectural/data-driven)**: The `EnemyData` Resource is the unit of data-driven content. Flyweight is why that design stays cheap at scale, and the mutation trap is the same trap on both pages.
- **[Object Pool](/patterns/creational/object-pool)**: A pool reuses the extrinsic half (the node); a Flyweight shares the intrinsic half (the data). A horde usually wants both.
- **[Composite](/patterns/structural/composite)**: Leaves in a Composite tree often reference a Flyweight for their shared data while the tree holds their position and parent.
- **[Singleton (Autoload)](/patterns/creational/singleton)**: One instance of one thing versus one instance per type. `goblin.tres` is not a global; it is one shared value among many, reached by reference rather than by name.
