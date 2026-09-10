---
title: "Abstract Factory"
description: "Bundle a faction's or theme's scenes into one Resource with a create method per product, so units, projectiles, and effects always come from the same family."
---

# Abstract Factory

**Buys a guarantee that a family of scenes (a faction's units, projectiles, and effects) never mixes; pays heavy ceremony — a new product type touches the factory contract and every family.**

Abstract Factory is the answer to "these things must go together". In a game the products are scenes — soldiers, arrows, death effects, UI panels — and "together" means "from the same faction, theme, or biome". A [Factory Method](/patterns/creational/factory-method) stops you spawning the wrong *type*; it can't stop you spawning a Frost archer that fires Ember arrows, because each product has its own registry and nothing ties them.

Godot has no interfaces, so the contract is a Resource class with one `create_*` method per product. Each family is one `.tres` file with that family's scenes in its exported slots. The guarantee comes from reference structure rather than a type checker: a unit that holds a single `FactionFactory` can only ever ask that factory, so everything it creates belongs to its own family. The engine won't verify this; the shape of the code does.

## Scenario

A battle has two factions. Each has a soldier, an archer, and an arrow, and each has its own scenes with its own sprites.

```gdscript:title="res://battle/army_spawner.gd"
extends Node2D

const EMBER_SOLDIER := preload("res://factions/ember/soldier.tscn")
const EMBER_ARCHER := preload("res://factions/ember/archer.tscn")
const FROST_SOLDIER := preload("res://factions/frost/soldier.tscn")
const FROST_ARCHER := preload("res://factions/frost/archer.tscn")

@export_enum("ember", "frost") var faction: String = "ember"

func spawn_soldier() -> Unit:
	match faction:
		"ember": return EMBER_SOLDIER.instantiate()
		"frost": return FROST_SOLDIER.instantiate()
	return null

func spawn_archer() -> Unit:
	match faction:
		"ember": return EMBER_ARCHER.instantiate()
		"frost": return FROST_ARCHER.instantiate()
	return null
```

```gdscript:title="res://factions/frost/archer.gd"
extends Unit

const ARROW := preload("res://factions/ember/arrow.tscn")   # copied from ember/archer.gd

func fire(direction: Vector2) -> void:
	var arrow := ARROW.instantiate()
	arrow.direction = direction
	get_parent().add_child(arrow)
```

The Frost archer fires Ember arrows. Nobody notices until QA asks why blue units shoot orange. The bug is structural, not careless: there are two archer scripts because each hard-codes its arrow, and the second was made by copying the first. Meanwhile the spawner has one `match` per product, so a third faction touches every function and a fourth product adds another function with another `match`. Three products times two factions is already six `preload`s in one file.

> **Smell:** The same set of scene paths appears in several scripts with only the folder name changed, and "add a faction" is a search-and-replace job.

## Solution

Make the family the thing you select. One `FactionFactory` Resource holds every scene a faction needs, and everything spawned from it is handed a reference back to it. The archer no longer knows any arrow scene — it knows its faction.

```
Battlefield (Node2D)
├── ArmySpawner (faction = ember.tres)
│   ├── Soldier
│   └── Archer ──fire()──► faction.create_arrow() ──► EmberArrow
└── ArmySpawner (faction = frost.tres)
    ├── Soldier
    └── Archer ──fire()──► faction.create_arrow() ──► FrostArrow
```

```gdscript:title="res://factions/faction_factory.gd"
class_name FactionFactory extends Resource

## One .tres per family: res://factions/ember.tres, res://factions/frost.tres.

@export var faction_name: String = "Ember"
@export var tint: Color = Color.ORANGE_RED

@export_group("Scenes")
@export var soldier_scene: PackedScene
@export var archer_scene: PackedScene
@export var arrow_scene: PackedScene
@export var death_effect_scene: PackedScene

func create_soldier() -> Unit:
	return _create_unit(soldier_scene)

func create_archer() -> Unit:
	return _create_unit(archer_scene)

func create_arrow() -> Projectile:
	var arrow := arrow_scene.instantiate() as Projectile
	arrow.modulate = tint
	return arrow

func create_death_effect() -> Node2D:
	return death_effect_scene.instantiate() as Node2D

func _create_unit(scene: PackedScene) -> Unit:
	assert(scene != null, "%s is missing a unit scene" % faction_name)
	var unit := scene.instantiate() as Unit
	unit.faction = self       # the unit can only ever ask this factory
	return unit
```

The base `Unit` keeps the reference and uses it for the one product every unit needs. `Archer` adds the one it needs. There is now a single `archer.gd`; `ember/archer.tscn` and `frost/archer.tscn` both use it with different sprites.

```gdscript:title="res://battle/unit.gd"
class_name Unit extends CharacterBody2D

signal died

var faction: FactionFactory

func die() -> void:
	var effect := faction.create_death_effect()
	effect.global_position = global_position
	get_parent().add_child(effect)
	died.emit()
	queue_free()
```

```gdscript:title="res://battle/archer.gd"
class_name Archer extends Unit

func fire(direction: Vector2) -> void:
	var arrow := faction.create_arrow()
	arrow.global_position = global_position
	arrow.direction = direction
	get_parent().add_child(arrow)
	print("%s archer fired an arrow tinted %s" % [faction.faction_name, arrow.modulate])
```

The spawner shrinks to an exported Resource and no `match` at all. Both armies on the battlefield are the same scene with a different `.tres` dropped into the slot.

```gdscript:title="res://battle/army_spawner.gd"
class_name ArmySpawner extends Node2D

@export var faction: FactionFactory

func spawn_squad(origin: Vector2) -> void:
	for i in 3:
		var soldier := faction.create_soldier()
		soldier.global_position = origin + Vector2(i * 24, 0)
		add_child(soldier)
	var archer := faction.create_archer() as Archer
	archer.global_position = origin + Vector2(36, -24)
	add_child(archer)
	archer.fire(Vector2.RIGHT)
```

```text
Ember archer fired an arrow tinted (1, 0.2706, 0, 1)
Frost archer fired an arrow tinted (0.5294, 0.8078, 0.9216, 1)
```

The Frost archer cannot fire an Ember arrow now. Not because anything checks, but because it has no path to one: its only creation route is `faction`, and `faction` was set by the Frost factory.

### Subclassing for families that aren't just data

When families differ in *behaviour* rather than in which scene fills a slot — a procedural faction that picks a random soldier variant, a tutorial faction that spawns nothing dangerous — subclass the Resource and override the methods. A `RandomFactionFactory extends FactionFactory` with an `@export var soldier_variants: Array[PackedScene]` overrides `create_soldier` to pick one. The spawner is unchanged, since it only ever typed its slot as `FactionFactory`. With 4.5+ the base can be marked `@abstract` so a half-implemented family fails loudly.

### The ceremony, spelled out

Add a healer. That is: a `healer_scene` export and a `create_healer` method in `faction_factory.gd`, a scene dragged into `ember.tres`, another into `frost.tres`, another into every other family file, and an override in every subclass that customises unit creation. With three families and two subclasses, one new product is six edits, and a family that forgets its slot fails at runtime on the `assert`. That is the pattern's price, and it's the reason to check first whether the products really differ by *scene*. If Ember and Frost soldiers are the same scene with a different `UnitData` — sprite, tint, stats — you don't have families of scenes, you have one scene and a data table, which is [Data-Driven Design](/patterns/architectural/data-driven) with none of this ceremony.

## When to Use

- Several products must always come from the same family: a faction's units and projectiles, a biome's tiles and props and ambient sounds, a UI theme's buttons and panels and fonts.
- The set of families is meant to grow — modders or designers should be able to add one by creating a `.tres`, not by editing code.
- A mixed family is a bug you have already shipped, or would not notice until QA did.

## When Not to Use

- There is one product type. That's a [Factory Method](/patterns/creational/factory-method) with an exported `PackedScene`.
- Families differ only by data. One scene plus a data Resource in the inspector is the whole solution.
- There is one family and a vague plan for a second. A single `FactionFactory` with hard-coded scenes is already this pattern in spirit; add the second slot set when the second faction exists.

## The Decision

Abstract Factory gives the strongest "never mixes" guarantee available without a type checker, and it gives it through structure: everything a unit creates goes through the one factory it was born with. That is worth having when a mixed family is visible to the player. It costs a fixed contract — every product is a method, every family fills every method — and a growth pattern where products are expensive to add and families are cheap. If your game adds products more often than families, that is exactly backwards, and the contract will feel like friction every week.

The Godot-specific edge is that the factory is a Resource, so it's shared. Every unit in the Ember army holds the same `ember.tres`, which is ideal for reading `tint` and `soldier_scene` and a trap the moment someone writes to it: `faction.tint = Color.RED` on one unit recolours every future arrow in the army. Treat the factory as immutable after load, the same discipline as any [Flyweight](/patterns/structural/flyweight).

This is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off) in practice: you are buying an invariant with ceremony, and the ceremony is only worth paying if you can name the bug it prevents.

## Related Patterns

- **[Factory Method](/patterns/creational/factory-method)**: one product, selected by id. Reach for Abstract Factory only when the *combination* of products has to be consistent.
- **[Builder](/patterns/creational/builder)**: configures one complex object with many options; Abstract Factory produces a consistent set of simple ones.
- **[Bridge](/patterns/structural/bridge)**: when families and products both multiply, a Bridge separates the two axes so a new faction and a new unit type are each one file rather than a grid cell.
- **[Data-Driven Design](/patterns/architectural/data-driven)**: the cheaper answer whenever families differ by values rather than by scenes.
- **[Flyweight](/patterns/structural/flyweight)**: the factory Resource is shared by every unit it created; the same never-mutate rule applies.
