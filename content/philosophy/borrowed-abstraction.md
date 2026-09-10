---
title: Every abstraction is borrowed against the future
nav_title: Borrowed abstraction
description: An abstraction is a loan for flexibility now in exchange for indirection forever. Only borrow what you'll actually spend.
order: 5
---

# Every abstraction is borrowed against the future

An abstraction is a loan. You borrow flexibility, the ability to swap an implementation, add an enemy type, vary a behaviour, and the interest is indirection: every reader from now on has to step through the abstraction to find out what actually happens. Sometimes that's a bargain. Often it's a loan taken out against a future that never arrives, and you service the debt forever in exchange for flexibility you never spend.

So the question to ask before you abstract is "will I spend this flexibility, and soon enough so that paying interest in the meantime is worth it?" If the answer is a confident yes, borrow. If it's a hopeful maybe, you're speculating, and the [wrong abstraction costs more than the duplication it replaces](/philosophy/wrong-abstraction).

The corollary is that abstractions should be *cheap to take on and cheap to unwind*. A small base class defined at the point you actually need it — a `PickupEffect` Resource with one method — is a short-term loan. A five-deep `extends` chain is a thirty-year mortgage on coupling, and GDScript, with its single inheritance, will happily sell you one.

## Composition over Inheritance

GDScript gives you exactly one parent per script, and the temptation is to use it for everything. `Entity` grows a `Character`, which grows an `Enemy`, which grows a `FlyingEnemy`, which grows a `FlyingRangedEnemy`. It reads as organised. Then the designer asks for a ground turret that shoots but doesn't move, and the shooting logic lives three levels down a branch the turret can't inherit from. The only route is to push shooting *up* the chain, so every `Enemy` carries a `_shoot` it may never call.

```
BAD — behaviour welded on through ancestry. One parent each, so the
turret can't reach the shooting it needs without dragging it up the tree.

Entity (CharacterBody2D)
└── Character              — health, take_damage
    └── Enemy              — aggro, chase
        └── FlyingEnemy    — hover, ignore gravity
            └── FlyingRangedEnemy — shoot
Turret (StaticBody2D) ← needs health + shoot, not chase or hover. No parent fits.
```

Godot's own answer is composition through the scene tree. Behaviour lives in small child nodes; a scene is assembled from the ones it needs; and you can pull a piece out again by deleting a node instead of unwinding an ancestry. Scenes are grouped by what they *contain*, not what they *are*:

```
GOOD — compose behaviour from child nodes.

Wasp (CharacterBody2D)
├── Sprite2D
├── HealthComponent (Node)
├── HoverMovement (Node)
└── ShooterComponent (Node2D)

Turret (StaticBody2D)
├── Sprite2D
├── HealthComponent (Node)      ← the same scene
└── ShooterComponent (Node2D)   ← the same scene
```

```gdscript:title="res://components/health_component.gd"
class_name HealthComponent extends Node

signal health_changed(current: int, maximum: int)
signal died

@export var max_health: int = 10
var health: int

func _ready() -> void:
	health = max_health

func take_damage(amount: int) -> void:
	health = maxi(health - amount, 0)
	health_changed.emit(health, max_health)
	if health == 0:
		died.emit()
```

```gdscript:title="res://components/shooter_component.gd"
class_name ShooterComponent extends Node2D

@export var projectile: PackedScene
@export var cooldown: float = 0.8
var _time_left: float = 0.0

func _process(delta: float) -> void:
	_time_left = maxf(_time_left - delta, 0.0)

func try_shoot(direction: Vector2) -> void:
	if _time_left > 0.0:
		return
	var shot := projectile.instantiate() as Node2D
	shot.global_position = global_position
	shot.rotation = direction.angle()
	get_tree().current_scene.add_child(shot)
	_time_left = cooldown
```

A `HealthComponent` works on a wasp, a turret, a breakable crate, or the player, with no shared base class, and a `HurtboxComponent` that calls `take_damage` on whichever `HealthComponent` it finds needs no change when a new enemy appears. Each component asks for exactly the collaborator it needs. That is the borrowed abstraction repaying itself: each component is a small loan, taken exactly where it's spent. The wasp's own script just wires its children together (`$ShooterComponent.try_shoot(direction_to_player)`), which is *has-a*, not *is-a*, without the mortgage of a hierarchy.

Inheritance still has a place. One level — `class_name Enemy extends CharacterBody2D`, or `class_name EnemyData extends Resource` — is how you get typed exports and a shared contract. It's the depth that costs, and every level past the first should have to justify itself.

> **Smell:** A script overrides most of its parent's methods and never calls `super()`, replacing rather than extending it. An `extends` chain more than two levels deep. You inherit from a large base class to reach one method. A base class with a method that half its subclasses stub out.

See also: [Node Composition](/patterns/architectural/composition), [Strategy](/patterns/behavioral/strategy), [Decorator](/patterns/structural/decorator), [SOLID](/philosophy/keep-changes-local#solid).
