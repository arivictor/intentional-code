---
title: "Prototype"
description: "Create new nodes and Resources by copying a configured one with duplicate(), and know exactly which parts of the copy are still shared with the original."
---

# Prototype

**Buys cheap, independent copies of configured nodes and Resources via `duplicate()`; pays in shallow-versus-deep copy rules the engine won't check for you.**

Prototype makes a new object by copying a configured one instead of building it from scratch. Godot ships the pattern twice: `Node.duplicate()` copies a node and its subtree, `Resource.duplicate()` copies a data object. `PackedScene.instantiate()` is a prototype too — a scene file is a serialised template, and every instance is a copy of it. Most of the time you don't think about that, which is exactly the problem: copying is so easy in Godot that the interesting question is never *how* to copy but *what got shared*.

The guarantee the pattern offers is a new object that starts where a tuned original left off. The guarantee it does not offer is that the copy is independent. A node's `@export var stats: EnemyStats` is a reference, and `duplicate()` copies the reference, not the Resource. Whether that's what you want depends on the field, and only you know.

## Scenario

A designer builds an `EliteGrunt` directly in the arena scene: a grunt with a red `modulate`, a heavier weapon child, and an `EnemyStats` Resource edited inline with `max_health = 300`. The arena should spawn four more, each a little tougher.

```gdscript:title="res://levels/arena.gd"
extends Node2D

@onready var _elite: Enemy = %EliteGrunt

func _ready() -> void:
	for i in 4:
		var clone := _elite.duplicate() as Enemy
		clone.position = _elite.position + Vector2(64 * (i + 1), 0)
		clone.stats.max_health += 50 * i      # "scale the later ones up"
		add_child(clone)
	print("template: %d" % _elite.stats.max_health)
```

```text
template: 600
```

Every clone shares one `EnemyStats`. The loop adds 0, then 50, then 100, then 150 to the *same* object, so all five enemies — including the designer's template — read 600. Nothing crashed, nothing warned, and the arena is twice as hard as it was tuned to be. The tell is that the change appeared somewhere it wasn't made.

> **Smell:** You change a value on one instance and a different instance changes too. That's a shared Resource, and `duplicate()` didn't make it yours.

## Solution

Copy the node, then explicitly copy the Resources you intend to mutate. Keep the template out of play so it can't be hit, and let the clone's own `_ready` initialise runtime state from its own copy.

```
_elite ─── stats ──► EnemyStats#1 (max_health 300)
clone_a ── stats ──► EnemyStats#1        ← Node.duplicate() copied the reference
clone_b ── stats ──► EnemyStats#1

after clone.stats = template.stats.duplicate(true):

clone_a ── stats ──► EnemyStats#2 (300)   ← its own; mutate freely
clone_b ── stats ──► EnemyStats#3 (300)
```

```gdscript:title="res://enemies/enemy_stats.gd"
class_name EnemyStats extends Resource

@export var max_health: int = 30
@export var speed: float = 80.0
@export var loot: Array[ItemData] = []
```

```gdscript:title="res://enemies/enemy.gd"
class_name Enemy extends CharacterBody2D

@export var stats: EnemyStats

var health: int      # runtime state: NOT copied by duplicate(), set in _ready

func _ready() -> void:
	health = stats.max_health
```

```gdscript:title="res://levels/arena.gd"
extends Node2D

@onready var _elite: Enemy = %EliteGrunt

func _ready() -> void:
	remove_child(_elite)      # an off-tree template can't be seen or hit

	for i in 4:
		var clone := clone_template(_elite, i + 1)
		clone.stats.max_health += 50 * i
		clone.position = _elite.position + Vector2(64 * (i + 1), 0)
		add_child(clone)      # _ready runs here: health = its own max_health
		print("%s: max %d, health %d" % [clone.name, clone.stats.max_health, clone.health])
	print("template: %d" % _elite.stats.max_health)

func _exit_tree() -> void:
	_elite.queue_free()       # nodes outside the tree aren't freed with the scene

func clone_template(template: Enemy, index: int) -> Enemy:
	var clone := template.duplicate() as Enemy
	clone.stats = template.stats.duplicate(true)    # own Resource, own loot Array
	clone.name = "Elite%d" % index
	return clone
```

```text
Elite1: max 300, health 300
Elite2: max 350, health 350
Elite3: max 400, health 400
Elite4: max 450, health 450
template: 300
```

The template stays at 300 and each clone owns its numbers. Two details carry the correctness. `template.stats.duplicate(true)` gives the clone its own `EnemyStats` *and* its own `loot` Array, so a clone that drops an item doesn't shorten the template's loot. And `health` is assigned in `_ready`, after the stats were replaced and after `add_child`, so it reads the clone's value rather than whatever the template had.

### What `duplicate()` copies, and what it doesn't

`Node.duplicate()` copies the node, its children, its built-in properties, and the script properties that have storage — which in practice means `@export` variables. A plain `var health` is not storage, so the clone gets the script's initialiser, not the template's current value. Groups are copied. Signal connections made in the editor are copied; connections made in code are not, so a template whose `died` was wired by a spawner produces clones nobody is listening to. `_ready` runs on the clone when it enters the tree, and `@onready` variables resolve against the clone's own children, which is what you want.

`Resource.duplicate()` with no argument is shallow: exported values are copied, sub-Resources are shared. `duplicate(true)` copies the sub-Resources held directly in properties. Resources nested inside Arrays and Dictionaries have behaved differently across 4.x minor versions; if a clone's independence depends on one, write a gdUnit4 test that mutates the copy and asserts the original is untouched, and let it tell you.

### `resource_local_to_scene`

For scenes rather than in-tree templates, the inspector offers a shortcut. Tick **Local to Scene** on the `EnemyStats` sub-resource in `grunt.tscn` and every `instantiate()` of that scene gets its own copy of the Resource automatically. This is how materials and shaders are usually handled, and it's the right default for any Resource a node writes to during play. It applies to instantiation, not to `duplicate()` — for a `duplicate()`d node, copy the Resource yourself as above and don't rely on the flag.

The flag has a cost worth naming: a Resource that is local to scene can no longer be shared, so a thousand grunts hold a thousand `EnemyStats`. If the data is read-only, leave the flag off and let them share it — that's [Flyweight](/patterns/structural/flyweight), and it's the cheaper design.

## When to Use

- A designer has tuned an instance in a scene and you want more of it — the configured node is a better template than the scene file plus code that re-applies the tweaks.
- Construction from scratch is expensive or fiddly and a copy of an existing instance is most of the way there.
- You need independent copies of a Resource to mutate per instance: per-enemy stats, per-player inventories, a save-game snapshot.
- Variants differ from a base by a few fields, and copy-then-tweak is clearer than a constructor with a dozen parameters.

## When Not to Use

- The copies don't mutate their shared data. Then sharing is the feature, and `duplicate(true)` just costs memory.
- The template is a scene file, not an in-tree node. `instantiate()` is the same pattern with better tooling.
- You're copying to save state for undo. That's [Memento](/patterns/behavioral/memento), which wants an opaque snapshot rather than a live peer.
- The object graph is large and deeply nested. `duplicate(true)` walks all of it, on the main thread, in the frame you call it.

## The Decision

`duplicate()` is cheap to call and expensive to trust. It copies exactly what the engine considers a property and shares exactly what the engine considers a reference, and neither rule is visible at the call site. A node that works perfectly as a single instance can be duplicated into four that silently share a stats block, a `Tween` that isn't there, or a signal connection that only the original had. The fix is never clever: decide, field by field, what a copy should own, and write the `duplicate(true)` or the re-connect for each one.

The Godot-specific version of that discipline is to make Resources either shared-and-immutable or local-and-owned, and to know which each one is. `resource_local_to_scene` handles the second case for instanced scenes; explicit copying handles it for everything else. Mixing the two — a mutable Resource that some instances share and others don't — is how the arena ended up at 600.

This is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off) in practice: a copy is cheap because it shares, and every field you decide to un-share is a cost you chose to pay for independence.

## Related Patterns

- **[Factory Method](/patterns/creational/factory-method)**: creates from a scene or data by id. Prototype creates from a live instance; reach for it when the configured node is the truth.
- **[Object Pool](/patterns/creational/object-pool)**: a pool often fills itself by duplicating one configured template, then relies on a `reset()` contract instead of fresh copies.
- **[Builder](/patterns/creational/builder)**: a builder's `build()` that returns `duplicate(true)` of its draft is Prototype used to make the builder a reusable preset.
- **[Flyweight](/patterns/structural/flyweight)**: the case where you deliberately *don't* copy — share the immutable Resource across every instance.
- **[Memento](/patterns/behavioral/memento)**: copying for undo and checkpoints, where the copy is a snapshot to restore rather than a new peer to play with.
