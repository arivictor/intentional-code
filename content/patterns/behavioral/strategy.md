---
title: "Strategy"
description: "Swap an enemy's movement, targeting, or AI by assigning a Resource or Callable, without editing the node that runs it."
---

# Strategy

**Buys swappable behaviour (movement, targeting, AI) via Resources or Callables without touching the node that uses them; pays because the selection logic moves to whoever assigns the strategy rather than vanishing.**

Strategy defines a family of interchangeable behaviours and lets the thing that runs them stay ignorant of which one is plugged in. In Godot the natural container for a strategy is a `Resource` subclass: it can carry tuning data, it can be saved as a `.tres` and picked in the inspector, and one instance can be shared by every node that uses it. When the strategy is pure logic with no data, a `Callable` does the same job with less ceremony.

The guarantee is that the node running the strategy never changes when a new one is added. An `Enemy` with `@export var movement: MovementStrategy` doesn't know whether it's chasing, patrolling, or fleeing; a designer decides that per instance, or code decides it at runtime. That is the [Open/Closed Principle](/philosophy/keep-changes-local#solid) applied to behaviour, and it is the pattern that falls out most naturally from [data-driven design](/patterns/architectural/data-driven).

## Scenario

An enemy chooses how to move with a `match` on an enum inside `_physics_process`.

```gdscript:title="res://enemies/enemy.gd"
class_name Enemy extends CharacterBody2D

enum Movement { CHASE, PATROL, FLEE }

@export var movement: Movement = Movement.PATROL
@export var speed: float = 90.0
@export var panic_multiplier: float = 1.5  # only FLEE reads this

var target: Node2D
var facing: int = 1

func _physics_process(_delta: float) -> void:
	match movement:
		Movement.CHASE:
			if target:
				velocity = global_position.direction_to(target.global_position) * speed
		Movement.PATROL:
			if is_on_wall():
				facing = -facing
			velocity.x = facing * speed
		Movement.FLEE:
			if target:
				var away := target.global_position.direction_to(global_position)
				velocity = away * speed * panic_multiplier
	move_and_slide()
```

For three variants in one file this is fine, and I'd leave it alone. It stops being fine when each variant wants its own tuning (a chase acceleration curve, a patrol distance, the flee multiplier), when a designer wants to pick a variant per instance without a code change, or when the fourth and fifth variants arrive and `enemy.gd` becomes a catalogue of unrelated movement code. Every variant's data is a field on `Enemy` whether or not the current variant reads it, and there is no way to test the patrol logic without running the whole enemy script.

> **Smell:** an `@export` enum whose only job is to feed a `match`, sitting next to a growing pile of `@export` floats that only one branch reads.

## Solution

Pull each branch into its own Resource. The base class declares the contract; subclasses implement it and carry their own data.

```
Enemy (CharacterBody2D)
├── Sprite2D
├── CollisionShape2D
└── movement: MovementStrategy   ← @export, a .tres picked in the inspector
        │
        ├── ChaseMovement   (speed)
        ├── PatrolMovement  (speed)
        └── FleeMovement    (speed, panic_multiplier)
```

```gdscript:title="res://enemies/movement/movement_strategy.gd"
class_name MovementStrategy extends Resource

## Contract for every movement behaviour. Kept stateless so one .tres can be
## shared by every enemy that uses it; per-instance state lives on the Enemy.
func move(enemy: Enemy, _delta: float) -> void:
	enemy.velocity = Vector2.ZERO
```

```gdscript:title="res://enemies/movement/chase_movement.gd"
class_name ChaseMovement extends MovementStrategy

@export var speed: float = 120.0

func move(enemy: Enemy, _delta: float) -> void:
	if enemy.target == null:
		enemy.velocity = Vector2.ZERO
		return
	enemy.velocity = enemy.global_position.direction_to(enemy.target.global_position) * speed
```

```gdscript:title="res://enemies/movement/patrol_movement.gd"
class_name PatrolMovement extends MovementStrategy

@export var speed: float = 60.0

func move(enemy: Enemy, _delta: float) -> void:
	if enemy.is_on_wall():
		enemy.facing = -enemy.facing
	enemy.velocity.x = enemy.facing * speed
```

```gdscript:title="res://enemies/movement/flee_movement.gd"
class_name FleeMovement extends MovementStrategy

@export var speed: float = 90.0
@export_range(1.0, 3.0) var panic_multiplier: float = 1.5

func move(enemy: Enemy, _delta: float) -> void:
	if enemy.target == null:
		enemy.velocity = Vector2.ZERO
		return
	var away := enemy.target.global_position.direction_to(enemy.global_position)
	enemy.velocity = away * speed * panic_multiplier
```

The enemy shrinks to the parts every variant shares: the physics step, and the per-instance state the strategies read and write.

```gdscript:title="res://enemies/enemy.gd"
class_name Enemy extends CharacterBody2D

const FLEE_STRATEGY := preload("res://enemies/movement/flee.tres")

@export var movement: MovementStrategy

var target: Node2D
var facing: int = 1

func _physics_process(delta: float) -> void:
	if movement:
		movement.move(self, delta)
	move_and_slide()

func _on_health_changed(current: int, maximum: int) -> void:
	if current < maximum / 4 and not movement is FleeMovement:
		movement = FLEE_STRATEGY
```

Notice the split. Tuning that belongs to the *kind* of movement (`speed`, `panic_multiplier`) lives in the Resource; state that belongs to *this* enemy (`facing`, `target`) lives on the node. That split is what lets one `patrol.tres` be shared by forty enemies. Put `facing` on the Resource and all forty turn around together.

Swapping at runtime is a single assignment, as `_on_health_changed` shows. Whoever makes that assignment — the enemy's own health handler, a spawner, a [Factory Method](/patterns/creational/factory-method) reading a wave definition — now owns the selection logic the `match` used to hold.

### The Callable variant

For targeting, the strategy is a pure function: given a position and some candidates, return one. That needs no data and no inspector, so a `Callable` is enough.

```gdscript:title="res://enemies/target_pickers.gd"
class_name TargetPickers

static func nearest(from: Vector2, candidates: Array[Node]) -> Node2D:
	var best: Node2D = null
	var best_distance := INF
	for node in candidates:
		var candidate := node as Node2D
		if candidate == null:
			continue
		var distance := from.distance_squared_to(candidate.global_position)
		if distance < best_distance:
			best_distance = distance
			best = candidate
	return best

static func weakest(_from: Vector2, candidates: Array[Node]) -> Node2D:
	var best: Node2D = null
	var lowest := INF
	for node in candidates:
		var health := node.get_node_or_null("HealthComponent") as HealthComponent
		if health and health.health < lowest:
			lowest = health.health
			best = node as Node2D
	return best
```

```gdscript:title="res://enemies/turret.gd"
class_name Turret extends Node2D

var pick_target: Callable = TargetPickers.nearest

func _physics_process(_delta: float) -> void:
	var candidates := get_tree().get_nodes_in_group(&"player_units")
	var target: Node2D = pick_target.call(global_position, candidates)
	if target:
		look_at(target.global_position)
```

Assigning `turret.pick_target = TargetPickers.weakest` changes the turret's behaviour with no new class. A lambda works as well for one-off rules. What a Callable can't do is appear in the inspector or be saved in a `.tres`, so the choice is simple: Resource when designers assign it or it carries data, Callable when code assigns it and it's stateless.

## When to Use

- A `match` on an enum selects between behaviours, and the branches are growing or want their own tuning data.
- Designers should choose the behaviour per instance in the inspector, or per wave in a data file, without a code change.
- You want to test a behaviour in GUT or gdUnit4 by calling `PatrolMovement.new().move(enemy, 0.016)` against a bare `Enemy.new()` — no scene tree, no physics server.
- The behaviour must change at runtime: an enemy that flees when hurt, a turret that switches targeting when upgraded.

## When Not to Use

- There are two or three variants with no per-variant data and no runtime swap. The `match` is [the simplest thing](/philosophy/no-pattern#kiss); a Resource per branch is ceremony.
- The variants are trivially different (one number). A single `@export var speed` beats three classes that each hold a speed.
- The behaviour needs to reach deep into the node's internals. If the strategy touches twelve fields on `Enemy`, it's not a plug-in behaviour, it's half the enemy in a separate file.

## The Decision

The Resource form costs one script per variant and buys inspector editing, `.tres` reuse, and isolated tests. Its Godot-specific trap is sharing: a Resource loaded from disk is one object, and every enemy with the same `.tres` holds the same instance. That's a feature for tuning data and a bug the moment a strategy stores per-instance state like a cooldown or a patrol origin. Either keep the strategy stateless and store that state on the node (as above), or set `resource_local_to_scene` on the Resource, or `duplicate()` it in `_ready`. The engine won't warn you; forty enemies sharing a cooldown will.

The cost that never goes away is that the selection logic doesn't disappear, it relocates. If every spawner does `if wave > 5: enemy.movement = CHASE_STRATEGY`, you've moved the `match` into six places instead of one. Centralise it: a spawn table Resource that pairs enemy scenes with strategies, or a factory that assigns them. This is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off) in practice: Strategy trades one `match` you can read for an assignment you have to find.

## Related Patterns

- **[State](/patterns/behavioral/state)**: Both swap behaviour at runtime. Strategy is chosen from outside (a designer, a spawner, a health handler); State transitions itself in response to events. If the behaviours know when to hand over to each other, it's State.
- **[Template Method](/patterns/behavioral/template-method)**: Template Method fixes the skeleton in a base `Enemy` and lets subclasses override one step; Strategy replaces the whole step with an object. Prefer Strategy when the same behaviour should be shared across unrelated node types.
- **[Command](/patterns/behavioral/command)**: Both wrap behaviour in an object; Command adds undo, queuing, and replay. If you only need interchangeability, Strategy is lighter.
- **[Bridge](/patterns/structural/bridge)**: Strategy varies one axis; Bridge varies two independently (every weapon × every wielder). Reach for Bridge when you find yourself with strategies of strategies.
- **[Data-Driven Design](/patterns/architectural/data-driven)**: Strategy Resources are the behavioural half of data-driven content: the same inspector-editable `.tres` files, carrying logic as well as numbers.
