---
title: "Data-Driven Design"
description: "Move enemy stats, item definitions, and ability numbers out of scripts and into custom Resources that designers edit in the inspector as .tres files, so tuning a game never means editing code."
---

# Data-Driven Design

**Buys content designers tune in the inspector without code changes, via custom Resources; pays in a schema you must migrate and shared-Resource mutation traps.**

Data-driven design separates *what the game does* from *what the game contains*. The code knows how an enemy moves, takes damage, and drops loot; the data says this enemy has 30 health, moves at 120 pixels per second, and drops a health potion one time in five. In Godot the natural home for that data is a custom `Resource` subclass: a script with `@export` properties that the editor can save as a `.tres` file, show in the inspector, and reference from any scene.

The guarantee is that adding or tuning content touches no script. A designer duplicates `grunt.tres`, renames it `elite_grunt.tres`, doubles the health, swaps the sprite, and the game has a new enemy. The programmer's job shrinks to defining the schema — the set of exported fields — and writing code that reads it. Compared with hard-coded stats or a subclass per enemy, that is a different division of labour, and it is the one most teams want once content outnumbers systems.

## Scenario

An action game grows enemies the obvious way: one script per enemy type, each a subclass that overrides stats in `_ready`.

```gdscript:title="res://enemies/grunt.gd"
class_name Grunt extends Enemy

func _ready() -> void:
	max_health = 30
	speed = 120.0
	damage = 5
	drop_chance = 0.2
	super()
```

```gdscript:title="res://enemies/elite_grunt.gd"
class_name EliteGrunt extends Grunt

func _ready() -> void:
	super()
	max_health = 60  # runs after Grunt's _ready — is that the order we want?
	speed = 100.0
```

Three enemies in, this is fine. Thirty enemies in, it is a tuning nightmare. Every balance change is a code change, which means a programmer, a code review, and a rebuild. Designers cannot compare stats side by side; they read them out of `_ready` functions scattered across thirty files. Inheritance chains like `EliteGrunt extends Grunt` make it unclear which value wins. And the numbers are invisible to the editor: nothing in the inspector tells you this scene has 60 health.

> **Smell:** A `_ready` function that does nothing but assign constants, or a script whose only difference from its parent is a handful of numbers.

## Solution

Put the numbers in a Resource. The enemy scene stays generic and reads whatever data it is given.

```
res://data/enemies/
├── grunt.tres          (EnemyData: health 30, speed 120, sprite grunt.png)
├── elite_grunt.tres    (EnemyData: health 60, speed 100, sprite elite.png)
└── boss_ogre.tres      (EnemyData: health 900, speed 60, sprite ogre.png)

Enemy (CharacterBody2D)             ← one scene for every enemy
├── Sprite2D                          data.sprite goes here
├── CollisionShape2D
├── HealthComponent (Node)            data.max_health goes here
└── LootDropper (Node)                data.drop_table goes here
```

The schema is a script extending `Resource`. Because it is a Resource, the editor can create it via *Create New Resource*, save it as `.tres`, and edit every `@export` in the inspector:

```gdscript:title="res://data/enemy_data.gd"
class_name EnemyData extends Resource

@export var display_name: String = "Enemy"
@export_range(1, 10000) var max_health: int = 30
@export_range(0.0, 1000.0) var speed: float = 120.0
@export_range(0, 500) var damage: int = 5

@export_group("Presentation")
@export var sprite: Texture2D
@export var death_sound: AudioStream

@export_group("Loot")
@export_range(0.0, 1.0) var drop_chance: float = 0.2
@export var drop_table: Array[ItemData] = []
```

Item and ability definitions follow the same shape. Resources can reference other Resources and scenes, so an ability can carry the projectile it fires:

```gdscript:title="res://data/item_data.gd"
class_name ItemData extends Resource

@export var id: StringName
@export var display_name: String
@export var icon: Texture2D
@export_range(1, 99) var max_stack: int = 1
@export var value: int = 0
```

```gdscript:title="res://data/ability_data.gd"
class_name AbilityData extends Resource

@export var id: StringName
@export var cooldown: float = 1.0
@export var mana_cost: int = 10
@export var projectile_scene: PackedScene
@export var cast_animation: StringName = &"cast"
```

The enemy scene exposes one `@export` for its data and configures its children from it. This is "call down": the enemy tells its components what to be, rather than each component reaching for a global table:

```gdscript:title="res://enemies/enemy.gd"
class_name Enemy extends CharacterBody2D

@export var data: EnemyData

@onready var _sprite: Sprite2D = $Sprite2D
@onready var _health: HealthComponent = $HealthComponent
@onready var _loot: LootDropper = $LootDropper

func _ready() -> void:
	assert(data != null, "Enemy needs an EnemyData resource")
	_sprite.texture = data.sprite
	_health.setup(data.max_health)
	_loot.setup(data.drop_chance, data.drop_table)

func _physics_process(_delta: float) -> void:
	velocity = _direction_to_target() * data.speed
	move_and_slide()
```

Spawning an enemy is now "instantiate the generic scene, hand it a Resource". That pairs with a [Factory Method](/patterns/creational/factory-method) that maps ids to `.tres` files, and it means a level designer can place `enemy.tscn` in a level and pick `boss_ogre.tres` in the inspector without a programmer in the loop.

### Validating data with `@tool`

Data that designers edit will be wrong sometimes: an enemy with no sprite, a drop table with a null entry, a cooldown of zero. Catch that in the editor rather than at runtime. A `@tool` script on the node can report configuration warnings, which show as a yellow triangle in the scene tree:

```gdscript:title="res://enemies/enemy.gd"
@tool
class_name Enemy extends CharacterBody2D

@export var data: EnemyData:
	set(value):
		data = value
		update_configuration_warnings()

func _get_configuration_warnings() -> PackedStringArray:
	var warnings := PackedStringArray()
	if data == null:
		warnings.append("Assign an EnemyData resource.")
	elif data.sprite == null:
		warnings.append("EnemyData '%s' has no sprite." % data.display_name)
	return warnings
```

With `@tool`, `_ready` and `_process` also run in the editor, so guard anything that should not: `if Engine.is_editor_hint(): return`. For validation across a whole folder — every `.tres` under `res://data/enemies/` — an `EditorScript` run from the script editor does the job and prints a report.

### Schema migration

The schema will change. You rename `damage` to `melee_damage`, split `speed` into walk and run speeds, add a `faction`. Godot handles additions gracefully: a `.tres` missing a new field gets the script's default. Removals are silently dropped on the next save. Renames are the trap — the old value is dropped and the new field gets the default, and nothing warns you.

Version the schema and migrate explicitly:

```gdscript:title="res://data/enemy_data.gd"
class_name EnemyData extends Resource

const CURRENT_VERSION := 2

@export var schema_version: int = CURRENT_VERSION
@export var melee_damage: int = 5
# Kept only so old files still load; removed after migration has run everywhere.
@export var damage: int = -1
```

```gdscript:title="res://tools/migrate_enemy_data.gd"
@tool
extends EditorScript

func _run() -> void:
	for file_name in DirAccess.get_files_at("res://data/enemies/"):
		if not file_name.ends_with(".tres"):
			continue
		var path := "res://data/enemies/" + file_name
		var data := ResourceLoader.load(path) as EnemyData
		if data == null or data.schema_version >= EnemyData.CURRENT_VERSION:
			continue
		if data.schema_version < 2:
			data.melee_damage = data.damage
			data.damage = -1
		data.schema_version = EnemyData.CURRENT_VERSION
		ResourceSaver.save(data, path)
		print("migrated ", path)
```

Run it once, commit the rewritten `.tres` files, delete the deprecated field. Because `.tres` is a text format, the diff shows exactly what changed. Migration is boring work; the alternative — a silent default of 5 damage on a boss — is a bug report from a player.

## The shared-Resource mutation trap

A Resource loaded from a path is shared. Every `Enemy` whose `data` points at `grunt.tres` holds the *same* object. This is a feature — it is why [Flyweight](/patterns/structural/flyweight) works in Godot for free — right up to the moment someone mutates it:

```gdscript
# In a "weakened" status effect. Looks harmless.
func apply(enemy: Enemy) -> void:
	enemy.data.max_health -= 10   # every grunt in the game just lost 10 max health
```

Worse, in the editor with `@tool` scripts running, a mutation like this can be saved back into the `.tres` file. The rule: **Resources are templates; runtime state lives on the node.** The `HealthComponent` copies `max_health` into its own `current_health` at setup and mutates that. If an instance genuinely needs its own modified copy, take one deliberately — `data = data.duplicate()` in `_ready`, or tick `resource_local_to_scene` on the Resource so each instantiated scene gets a copy. Both cost memory; neither should be the default.

## JSON vs Resource

Godot offers two serious options for game data and the choice is a real one:

| | Custom Resource (`.tres`) | JSON |
|---|---|---|
| Editing | Inspector, typed, with ranges and groups | Any text editor, or an external tool |
| Types | Real: `Texture2D`, `PackedScene`, nested Resources | Strings and numbers; you parse and resolve references |
| Validation | `@export_range`, `@tool` warnings, type errors on load | Whatever you write |
| Modding | Loading `.tres` from `user://` can execute embedded scripts — do not | Safe to load from anywhere |
| Merges | Text, but noisy diffs on reorder | Easy diffs |
| Pipeline | Editor-only | Spreadsheets, generators, live reload |

Prefer Resources when the data references engine assets and the editor is where content is made. Prefer JSON (or `ConfigFile`) when data comes from outside the editor — a balancing spreadsheet, a mod folder, a server — or when players must be able to author it. Many projects do both: JSON as the authoring source, converted to `.tres` by an `EditorScript` at import time so runtime code sees only typed Resources.

## When to Use

- Content outnumbers systems. Ten enemy types sharing one behaviour, fifty items, thirty abilities.
- Designers or writers tune numbers and swap assets without a programmer.
- The same scene should serve many variants: one `enemy.tscn`, many `EnemyData` files.
- You want balance changes reviewable as data diffs, not code diffs.

## When Not to Use

- Each entity has genuinely different behaviour, not different numbers. A boss with unique mechanics wants its own script, perhaps still reading an `EnemyData` for its stats.
- There are two variants and no designer. A pair of `const` values is simpler than a schema.
- The data must be authored outside Godot by people who will never open the editor; JSON serves them better.
- The data is per-instance runtime state (current health, position). That belongs on the node, not in a shared Resource.

## The Decision

The trade is flexibility for a contract. Once stats live in `.tres` files, the fields of `EnemyData` are an interface that every file, every spawner, and every designer depends on. Renaming a field is no longer a refactor the editor can do for you; it is a migration. Teams that treat the schema casually accumulate half-migrated files with default values nobody meant.

The Godot-specific gotcha is sharing. Resources loaded by path are singletons per path, which is efficient and correct for read-only data, and wrong the instant anyone writes to one. Draw a hard line: nodes read from Resources and write to themselves. Code review should flag any assignment to a `data.` property outside an editor tool.

The other gotcha is `@tool`. It makes validation possible and it makes editor-time mutation possible; a `_ready` that modifies its data now does so inside the editor and may save the change. Guard with `Engine.is_editor_hint()` and keep `@tool` scripts small.

This is [tenet #9 — make the next change local](/philosophy/keep-changes-local#separation-of-concerns) applied to content: a balance change should touch one `.tres` file, and nothing else.

## Related Patterns

- **[Flyweight](/patterns/structural/flyweight)**: The reason shared Resources are cheap, and the same page describes the mutation trap from the memory-saving side. Data-driven design is Flyweight with an inspector.
- **[Prototype](/patterns/creational/prototype)**: When an instance needs its own copy of a Resource, `duplicate()` is the mechanism; Prototype explains the shallow-versus-deep rules.
- **[Factory Method](/patterns/creational/factory-method)**: The spawner that maps an id to a `.tres` and a scene. Data-driven design provides the data; the factory decides which data.
- **[Strategy](/patterns/behavioral/strategy)**: When data needs to carry *behaviour* too — a targeting rule, a movement style — a Resource subclass with a method is a Strategy you can pick in the inspector.
- **[Repository](/patterns/architectural/repository)**: Save data is runtime state and belongs behind a Repository. Static content belongs in Resources. Confusing the two puts player progress in shared files.
- **[Microkernel](/patterns/architectural/microkernel)**: Mods that add content are data-driven design with the data loaded from outside `res://` — usually JSON or a resource pack, for the security reason in the table above.
- **[Feature Modules](/patterns/architectural/feature-modules)**: Where the `.tres` files live. Keep an enemy's data next to its scene inside the enemies module rather than in a global `data/` dump.
