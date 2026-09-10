---
title: "Bridge"
description: "Split what a weapon does from who is wielding it into two independent hierarchies, so N weapon scenes and M controller scripts replace N×M copies."
---

# Bridge

**Buys turning an N×M scene explosion (every weapon × every wielder) into N+M along two independent axes; pays in extra classes until each axis has three-plus options.**

A Bridge separates two things that vary independently into two hierarchies and connects them with a reference. One side is the *abstraction* — what the thing is and does. The other is the *implementation* — how one particular aspect of it is carried out. In a game the two axes are usually obvious once named: a weapon and whoever is aiming it, an ability and how it picks targets, a vehicle and what steers it. Each combination used to be a scene; now each side is a scene or script and the combination is assembled in the inspector.

The question to ask before reaching for it is whether the axes are genuinely independent. If a new weapon never needs a change to any controller, and a new controller never needs a change to any weapon, Bridge is the right shape. If they move together, it is two class trees where one would do.

## Scenario

The weapons folder has grown one scene per combination of weapon and wielder:

```
res://weapons/
├── player_sword.tscn    player_sword.gd
├── player_bow.tscn      player_bow.gd
├── player_staff.tscn    player_staff.gd
├── enemy_sword.tscn     enemy_sword.gd
├── enemy_bow.tscn       enemy_bow.gd
├── enemy_staff.tscn     enemy_staff.gd
├── turret_bow.tscn      turret_bow.gd
└── turret_staff.tscn    turret_staff.gd
```

```gdscript:title="res://weapons/enemy_bow.gd"
extends Node2D
## Copy of player_bow.gd with the input lines swapped for target-finding.

const ARROW_SCENE := preload("res://projectiles/arrow.tscn")

@export var arrow_speed: float = 600.0
@export var cooldown: float = 0.6

var _cooldown_left := 0.0

func _physics_process(delta: float) -> void:
	_cooldown_left = maxf(_cooldown_left - delta, 0.0)
	var target := _nearest_player()
	if target == null:
		return
	rotation = (target.global_position - global_position).angle()
	if _cooldown_left == 0.0 and global_position.distance_to(target.global_position) < 500.0:
		_fire()
		_cooldown_left = cooldown
```

The arrow-spawning code is copied into three bows. A bug in where arrows appear is fixed in `player_bow.gd` and not in the other two. Adding a spear means three new scenes; adding an allied companion who can wield anything means four. Eight scenes today, fifteen after two features, and every one of them is mostly the same script.

> **Smell:** Scene names that are two nouns joined together, and a diff between any pair that is under twenty lines.

## Solution

Name the two axes. A `Weapon` decides what happens when it fires (a swing, a projectile, a beam). A `WeaponController` decides where the weapon points and whether it wants to fire this tick (mouse and input, nearest target, a fixed sweep). The weapon holds a controller and asks it two questions.

```
       Weapon (abstraction)                 WeaponController (implementation)
       ────────────────────                 ─────────────────────────────────
       Sword    Bow    Staff        ×       Player    AI    Turret
         │       │       │                     │       │       │
         └───────┴───────┴── weapon.controller ┴───────┴───────┘
                             get_aim_direction()
                             wants_to_fire()

       3 scenes            +            3 scripts        =  9 combinations
```

The implementation side first. It is a `Node` so it can sit in the scene and use `_process` if it needs to, but it owns no visuals and no firing logic:

```gdscript:title="res://weapons/weapon_controller.gd"
class_name WeaponController extends Node
## Implementation axis: where the weapon points and whether it fires this tick.

var weapon: Weapon  # set by the weapon in _ready

func get_aim_direction() -> Vector2:
	return Vector2.RIGHT

func wants_to_fire() -> bool:
	return false
```

```gdscript:title="res://weapons/controllers/player_weapon_controller.gd"
class_name PlayerWeaponController extends WeaponController

func get_aim_direction() -> Vector2:
	return (weapon.get_global_mouse_position() - weapon.global_position).normalized()

func wants_to_fire() -> bool:
	return Input.is_action_pressed("attack")
```

```gdscript:title="res://weapons/controllers/ai_weapon_controller.gd"
class_name AIWeaponController extends WeaponController

@export var engage_range: float = 500.0

var _target: Node2D

func get_aim_direction() -> Vector2:
	_target = _nearest_in_group("player")
	if _target == null:
		return Vector2.ZERO
	return (_target.global_position - weapon.global_position).normalized()

func wants_to_fire() -> bool:
	return is_instance_valid(_target) \
		and weapon.global_position.distance_to(_target.global_position) < engage_range

func _nearest_in_group(group: String) -> Node2D:
	var best: Node2D = null
	var best_distance := INF
	for node: Node2D in get_tree().get_nodes_in_group(group):
		var d := weapon.global_position.distance_squared_to(node.global_position)
		if d < best_distance:
			best_distance = d
			best = node
	return best
```

```gdscript:title="res://weapons/controllers/turret_weapon_controller.gd"
class_name TurretWeaponController extends WeaponController
## Sweeps back and forth and fires whenever the weapon is off cooldown.

@export var sweep_speed: float = 1.5
@export var sweep_arc: float = PI / 4.0

var _time := 0.0

func _process(delta: float) -> void:
	_time += delta

func get_aim_direction() -> Vector2:
	return Vector2.from_angle(sin(_time * sweep_speed) * sweep_arc)

func wants_to_fire() -> bool:
	return true
```

The abstraction side owns cooldown, rotation, and the firing hook. It never reads input and never looks for targets:

```gdscript:title="res://weapons/weapon.gd"
class_name Weapon extends Node2D
## Abstraction axis: what happens when the weapon fires. Subclasses override _fire.

@export var controller: WeaponController
@export var cooldown: float = 0.5

var _cooldown_left := 0.0

func _ready() -> void:
	assert(controller != null, "%s needs a WeaponController" % name)
	controller.weapon = self

func _physics_process(delta: float) -> void:
	_cooldown_left = maxf(_cooldown_left - delta, 0.0)
	var aim := controller.get_aim_direction()
	if aim != Vector2.ZERO:
		rotation = aim.angle()
	if _cooldown_left == 0.0 and controller.wants_to_fire():
		_fire(aim)
		_cooldown_left = cooldown

func _fire(_direction: Vector2) -> void:
	pass
```

```gdscript:title="res://weapons/bow.gd"
class_name Bow extends Weapon

const ARROW_SCENE := preload("res://projectiles/arrow.tscn")

@export var arrow_speed: float = 600.0

func _fire(direction: Vector2) -> void:
	var arrow: Arrow = ARROW_SCENE.instantiate()
	arrow.global_position = %Muzzle.global_position
	arrow.velocity = direction * arrow_speed
	get_tree().current_scene.add_child(arrow)
```

```gdscript:title="res://weapons/sword.gd"
class_name Sword extends Weapon

func _fire(_direction: Vector2) -> void:
	%SwingArea.monitoring = true
	$AnimationPlayer.play("swing")
	await $AnimationPlayer.animation_finished
	%SwingArea.monitoring = false
```

One `bow.tscn`, one `sword.tscn`, one `staff.tscn`. The wielder's scene instances the weapon it wants, adds the controller it wants as a child, and points the export at it:

```
Player (CharacterBody2D)              Archer (CharacterBody2D)
└── Bow  (bow.tscn)                   └── Bow  (bow.tscn)          ← same scene
    └── PlayerWeaponController            └── AIWeaponController   ← different child
        ▲ controller export                   ▲ controller export
```

The arrow-spawn bug now has one home. A spear is one scene. A companion is one controller script that works with every weapon on day one.

### Swapping the implementation at runtime

Because the join is a reference, it can change while the game runs. A mind-control spell does not need a "charmed archer" scene; it replaces the controller:

```gdscript:title="res://spells/charm.gd"
func apply(target: Node2D) -> void:
	var weapon: Weapon = target.get_node("Bow")
	var old := weapon.controller
	var charmed := AIWeaponController.new()
	charmed.add_to_group("charmed")
	weapon.add_child(charmed)
	weapon.controller = charmed
	charmed.weapon = weapon
	old.queue_free()
```

The same structure fits an `Ability` × `TargetingMode` split — fireball, heal, and taunt on one side; self, single target, cone, and ground point on the other — where the implementation answers `get_targets() -> Array[Node2D]` instead of an aim direction.

## When to Use

- Two axes that vary independently, each with three or more options, or clearly heading there.
- Scene names that are compound nouns (`enemy_bow`, `player_staff`) and scripts that differ from each other by a handful of lines.
- You need to swap one axis at runtime: possession, vehicle entry, a weapon picked up by a different kind of wielder.

## When Not to Use

- One axis. If every weapon is aimed the same way, `controller` is a Strategy on one class, not a Bridge across two.
- Two options per axis. Four scenes with some duplication is cheaper than two base classes and a wiring rule that new contributors must learn.
- The axes turn out to be coupled: the player's sword needs input buffering, the enemy's sword needs a telegraph. Each new pairing then edits both sides, and the Bridge has become the place the coupling hides.

## The Decision

You buy N+M in place of N×M, and the point at which that is a win is arithmetic: three by three saves three files; two by two saves none and costs two base classes. Until each axis has three real options, the Bridge is speculative structure, and speculative structure in a game project is where the [wrong abstraction](/philosophy/wrong-abstraction) takes root — the duplicated scenes were at least honest about being duplicates.

The second decision is which axis is which, and it matters more than it looks. The abstraction owns the shared loop (`_physics_process`, cooldown, rotation) and calls into the implementation; the implementation must therefore be the side that is *asked* rather than the side that *drives*. Put the controller in charge — `controller.fire(weapon)` — and every controller starts knowing about muzzles and swing areas, and you have the explosion back in a different folder. Two questions with narrow answers, `get_aim_direction()` and `wants_to_fire()`, are the width of the bridge; every method added to `WeaponController` is a chance for the axes to leak into each other.

The Godot-specific gotcha is ownership. The controller is a child of the weapon so it lives and dies with it and can use `_process`; but `@export var controller: WeaponController` only resolves when the node is in the scene, so a weapon instantiated from code must have its controller assigned before `_ready` or the `assert` fires. The `charm.gd` example shows the order: add the child, assign the reference, set the back-pointer, then free the old one.

## Related Patterns

- **[Strategy](/patterns/behavioral/strategy)**: Strategy swaps one algorithm inside one class. Bridge is two class hierarchies joined by a Strategy-shaped reference. If `Weapon` had no subclasses, this page would be that one.
- **[Adapter](/patterns/structural/adapter)**: Adapter reconciles two existing interfaces after the fact; Bridge separates two axes on purpose so they never need reconciling.
- **[Abstract Factory](/patterns/creational/abstract-factory)**: When a faction must always pair its own weapons with its own controllers, a factory per faction builds the combinations and keeps them from mixing.
- **[Node Composition](/patterns/architectural/composition)**: The controller-as-child-node is Node Composition. Bridge is the specific case where the component is the whole of one axis of variation.
- **[State](/patterns/behavioral/state)**: A controller that behaves differently while reloading, fleeing, or stunned wants a state machine inside the implementation side, not more controller classes.
