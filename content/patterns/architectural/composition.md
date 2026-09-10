---
title: "Node Composition"
description: "Assemble an entity's behaviour from reusable child nodes — HealthComponent, HurtboxComponent, HitboxComponent, MovementComponent — wired through @export references and signals, instead of a deep inheritance tree."
---

# Node Composition

**Buys behaviour assembled from reusable child nodes (health, hitbox, movement) instead of a deep inheritance tree; pays in wiring — components must find each other without hard-coded paths.**

Composition in Godot means a scene is *made of* its behaviours rather than *inheriting* them. A player is a `CharacterBody2D` with a `HealthComponent`, a `HurtboxComponent`, and a `MovementComponent` as children. An enemy is a `CharacterBody2D` with the same three plus a `ChaseComponent`. A destructible crate is a `StaticBody2D` with only a `HealthComponent`. None of them share a base class beyond what the engine provides, and each component is a small node with one job, a few `@export`s, and a signal or two.

The engine is built this way — a `CharacterBody2D` does not *inherit* collision, it *has* a `CollisionShape2D` — and the pattern is just extending the same idea to your own behaviours. The guarantee is that a new combination costs a new scene, not a new class, and that a fix to health applies everywhere health exists.

## Scenario

The inheritance tree that every project grows in its first month:

```
Enemy (CharacterBody2D)              health, take_damage(), die(), move toward player
└── FlyingEnemy                      overrides move: ignores gravity, bobs
    └── BossFlyingEnemy              overrides die: phases, overrides take_damage: armour
        └── FinalBossFlyingEnemy     overrides everything, calls super() three levels deep
```

```gdscript:title="res://enemies/boss_flying_enemy.gd"
class_name BossFlyingEnemy extends FlyingEnemy

var phase: int = 1

func take_damage(amount: int) -> void:
	if phase == 2:
		amount = int(amount * 0.5)      # armour
	super(amount)                       # FlyingEnemy has no take_damage; goes to Enemy
	if health < max_health / 2 and phase == 1:
		phase = 2
		_start_phase_two()

func die() -> void:
	if phase < 3:
		phase += 1
		health = max_health             # Enemy.die() would queue_free us; don't call super
		return
	super()
```

Now the designer wants a swimming boss. It cannot extend `FlyingEnemy`. A ground boss with phases cannot either — phases live in `BossFlyingEnemy`. The player needs health and a hurtbox, but the player is not an `Enemy`, so `take_damage` is copied into `player.gd` and the two versions drift. Every method in the chain is a maze of `super()` calls and "don't call super here" comments, and changing `Enemy.die()` changes four classes you have to re-test.

> **Smell:** a class that overrides a method to *not* call `super()`. The parent's behaviour is being fought, not extended. The behaviour wanted a component.

## Solution

Each behaviour becomes a node. The entity is a scene that contains the ones it wants.

```
Enemy (CharacterBody2D)                  Player (CharacterBody2D)        Crate (StaticBody2D)
├── Sprite2D                             ├── AnimatedSprite2D             ├── Sprite2D
├── CollisionShape2D                     ├── CollisionShape2D             ├── CollisionShape2D
├── HealthComponent (Node)               ├── HealthComponent (Node)       └── HealthComponent (Node)
├── HurtboxComponent (Area2D)            ├── HurtboxComponent (Area2D)
│   └── CollisionShape2D                 │   └── CollisionShape2D
├── HitboxComponent (Area2D)             ├── MovementComponent (Node)
│   └── CollisionShape2D                 └── DashComponent (Node)
├── MovementComponent (Node)
├── FlightComponent (Node)       ← flying: add this
└── PhaseComponent (Node)        ← boss: add this
```

### The components

```gdscript:title="res://components/health_component.gd"
class_name HealthComponent extends Node

signal health_changed(current: int, maximum: int)
signal damaged(amount: int, source: Node)
signal died

@export var max_health: int = 10
## Incoming damage is multiplied by this. PhaseComponent lowers it for armour.
@export_range(0.0, 2.0) var damage_multiplier: float = 1.0

var health: int:
	set(value):
		var clamped := clampi(value, 0, max_health)
		if clamped == health:
			return
		health = clamped
		health_changed.emit(health, max_health)
		if health == 0:
			died.emit()

func _ready() -> void:
	health = max_health

func damage(amount: int, source: Node = null) -> void:
	if health == 0:
		return
	var scaled := maxi(int(amount * damage_multiplier), 0)
	health -= scaled
	damaged.emit(scaled, source)

func heal(amount: int) -> void:
	health += amount
```

```gdscript:title="res://components/hitbox_component.gd"
class_name HitboxComponent extends Area2D

@export var damage: int = 1
```

```gdscript:title="res://components/hurtbox_component.gd"
class_name HurtboxComponent extends Area2D

## Wired in the inspector. The hurtbox does not care where health lives.
@export var health: HealthComponent

func _ready() -> void:
	assert(health != null, "%s: HurtboxComponent needs a HealthComponent" % owner.name)
	area_entered.connect(_on_area_entered)

func _on_area_entered(area: Area2D) -> void:
	var hitbox := area as HitboxComponent
	if hitbox == null or hitbox.owner == owner:
		return                           # not a hitbox, or our own
	health.damage(hitbox.damage, hitbox.owner)
```

```gdscript:title="res://components/movement_component.gd"
class_name MovementComponent extends Node

@export var body: CharacterBody2D
@export var speed: float = 120.0
@export var uses_gravity: bool = true

var direction: Vector2 = Vector2.ZERO

func _ready() -> void:
	if body == null:
		body = get_parent() as CharacterBody2D   # sensible default: I sit under the body
	assert(body != null, "MovementComponent must be under, or pointed at, a CharacterBody2D")

func _physics_process(delta: float) -> void:
	var gravity := body.get_gravity() if uses_gravity else Vector2.ZERO
	body.velocity.x = direction.x * speed
	body.velocity += gravity * delta
	body.move_and_slide()
```

Notice `HealthComponent` never touches a sprite, never plays an animation, never calls `queue_free`. It emits. Whoever assembled the scene decides what death looks like.

### How components find each other

This is the whole cost of the pattern, so it deserves a clear answer. There are three acceptable ways and one that is not.

**1. `@export` references, set in the inspector.** The best default. `@export var health: HealthComponent` is typed (it requires `class_name`), shows as a node picker, survives the component being moved or renamed, and fails loudly in `_ready` if unset. The hurtbox above does this.

**2. `owner`.** Every node in an instanced scene has `owner` set to the scene root. A component that needs its entity — to read a faction, to know who to credit for a kill — uses `owner`, never `get_parent().get_parent()`. It is stable no matter how deep the component sits.

```gdscript
var entity := owner as CharacterBody2D
```

**3. Groups, for one-to-many.** A `DamageNumberSpawner` that wants every `HealthComponent` in the level does not need references at all: `add_to_group("health")` in the component's `_ready`, and `get_tree().get_nodes_in_group("health")` at the consumer. Broadcast, not wiring.

**Not acceptable:** `get_node("../HealthComponent")`. It works until a designer renames the node or nests it under a `Node` for tidiness, and then it fails at runtime in a scene nobody was looking at. Sibling paths are the inheritance chain's `super()` problem in a different coat — hidden coupling that the editor will not show you.

### Assembling an entity

The root script is the only place that knows which components this entity has. It wires signals to presentation and to each other. It is short.

```gdscript:title="res://enemies/enemy.gd"
extends CharacterBody2D

@onready var _health: HealthComponent = %HealthComponent
@onready var _movement: MovementComponent = %MovementComponent
@onready var _sprite: Sprite2D = %Sprite2D

func _ready() -> void:
	_health.damaged.connect(_on_damaged)
	_health.died.connect(_on_died)

func _physics_process(_delta: float) -> void:
	var player := get_tree().get_first_node_in_group("player") as Node2D
	if player != null:
		_movement.direction = global_position.direction_to(player.global_position)

func _on_damaged(_amount: int, _source: Node) -> void:
	var tw := create_tween()
	tw.tween_property(_sprite, "modulate", Color.RED, 0.05)
	tw.tween_property(_sprite, "modulate", Color.WHITE, 0.1)

func _on_died() -> void:
	_movement.set_physics_process(false)
	%HurtboxComponent.set_deferred("monitoring", false)
	%AnimationPlayer.play("die")
	await %AnimationPlayer.animation_finished
	queue_free()
```

`%UniqueName` is the right accessor here, because the root script is *inside* its own scene; the coupling is local and visible in the editor. The flying variant is the same scene with a `FlightComponent` added and `uses_gravity` unticked. The boss is that plus a `PhaseComponent`:

```gdscript:title="res://components/phase_component.gd"
class_name PhaseComponent extends Node

signal phase_changed(phase: int)

@export var health: HealthComponent
@export var phases: int = 3
@export_range(0.0, 1.0) var armour_in_later_phases: float = 0.5

var phase: int = 1

func _ready() -> void:
	health.died.connect(_on_died)

func _on_died() -> void:
	if phase >= phases:
		return                           # the entity's root handles the real death
	phase += 1
	health.damage_multiplier = armour_in_later_phases
	health.health = health.max_health    # revive; the root's _on_died must check phase
	phase_changed.emit(phase)
```

Two listeners on `died`: the phase component revives, the root script animates. Signal order between them is connection order, which is `_ready` order, which is tree order — the phase component must sit above the root's connect, or the root must check `PhaseComponent.phase` before dying. That kind of ordering is the "wiring" tax, and it is worth stating in a comment where it bites.

### A test without a scene

Components extend `Node`, but a `Node` that is never added to a tree is still just an object. Health logic is testable in GUT without instantiating the enemy:

```gdscript:title="res://test/unit/test_health_component.gd"
extends GutTest

func test_armour_halves_damage_rounding_down() -> void:
	var health := HealthComponent.new()
	health.max_health = 10
	health.health = 10
	health.damage_multiplier = 0.5
	health.damage(3)
	assert_eq(health.health, 9)
	health.free()

func test_died_emits_once_at_zero() -> void:
	var health := HealthComponent.new()
	health.max_health = 5
	health.health = 5
	watch_signals(health)
	health.damage(10)
	health.damage(10)
	assert_signal_emit_count(health, "died", 1)
	health.free()
```

(`_ready` never ran, so the test sets `health` itself; `free()` rather than `queue_free()` because there is no tree to defer to.)

## When inheritance is fine

Composition over inheritance is a default, not a law. Inheritance earns its place when the variants differ in *one step of a fixed skeleton*: every projectile does `_ready → fly → on_hit → despawn`, and only `on_hit` differs. A `Projectile` base with a virtual `_on_hit()` is clearer than a `ProjectileImpactComponent` with an `@export` enum — that is [Template Method](/patterns/behavioral/template-method), and it is the engine's own `_process`/`_ready` model.

Scene inheritance (right-click a scene → *New Inherited Scene*) is the editor's version of the same thing and pairs well with components: `base_enemy.tscn` holds the components everyone has; `flying_enemy.tscn` inherits it and adds `FlightComponent`. The tree stays one level deep, which is the depth at which inheritance stops hurting.

The rule of thumb: inherit when the child is a *kind of* the parent and overrides one hook; compose when the child *has* a behaviour the parent might not. `BossFlyingEnemy` failed the first test the moment a swimming boss was requested.

## When to Use

- Two entities of different base types (a `CharacterBody2D` and a `StaticBody2D`) need the same behaviour. Inheritance cannot give it to both; a child node can.
- The inheritance tree is more than two levels deep, or any class overrides a method to suppress `super()`.
- Designers want to build variants in the editor by adding and removing nodes, without a programmer writing a class.
- A behaviour (health, a hurtbox, a status-effect holder) is bugged in three places because it was copied into three classes.

## When Not to Use

- Two or three entity types with one shared method each. A shallow base class is fewer files and easier to read.
- Behaviour that is meaningless outside one entity. A `PlayerDashComponent` that only the player will ever have is a script split in two for no reuse.
- Performance-critical swarms of thousands. Every component is a node with its own `_physics_process` callback; a boid with five components is five callbacks per frame. Flatten into one script (or a [Flyweight](/patterns/structural/flyweight) data table) at that scale.

## The Decision

Composition turns "what is an enemy?" into "what does this scene contain?", which is a question the editor answers by showing you the tree. That is the payoff: variants are scenes, reuse is drag-and-drop, and a fix to `HealthComponent` is a fix everywhere. The pattern fits Godot so well that most of the engine's own examples assume it.

The cost is that nothing is connected until you connect it. Five components on an entity means five `@export` slots to fill or default, a handful of signal connections in the root script, and an emission order that depends on tree order. A missing reference fails at runtime in `_ready` — with the `assert` shown above, loudly; without it, as a `null` two frames later. Wiring is also invisible to a grep: the fact that `HurtboxComponent` points at `HealthComponent` lives in a `.tscn` file, not a script. Design your components to fail fast when unwired and to default sensibly (`body = get_parent()`) when the common case is obvious.

Compose when the second base type or the third override arrives, and inherit when the variants are one hook apart. That is the [composition-over-inheritance](/philosophy/borrowed-abstraction#composition-over-inheritance) tenet, borrowed with its trade-off intact: you are exchanging a class hierarchy the compiler checks for a node tree the editor shows.

## Related Patterns

- **[Strategy](/patterns/behavioral/strategy)**: a component whose behaviour is itself swappable — `MovementComponent` with an `@export var pattern: MovementPattern` `Resource` — is composition at the node level and strategy at the data level.
- **[Template Method](/patterns/behavioral/template-method)**: the inheritance that is fine. Use it for one-hook variants; use components for behaviours that cross the type tree.
- **[Observer (Signals)](/patterns/behavioral/observer)**: how components talk to the root and each other. Components emit; the assembler connects.
- **[Decorator](/patterns/structural/decorator)**: a `PhaseComponent` that alters `damage_multiplier` is a runtime modifier on another component — decorator by signals rather than by wrapping.
- **[Feature Modules](/patterns/architectural/feature-modules)**: components live in `res://components/` (shared) or inside the feature that owns them. Same boundary rule: no `../../` across folders.
