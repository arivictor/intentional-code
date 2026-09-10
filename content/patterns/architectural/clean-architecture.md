---
title: "Clean Architecture"
description: "Keep the game's rules in plain RefCounted classes that never touch a Node, and treat scenes, input, and files as an outer ring that maps to and from them."
---

# Clean Architecture

**Buys a simulation independent of nodes and the engine loop, testable without a scene tree; pays in mapping boilerplate between plain classes and nodes and a rule the engine won't enforce.**

Clean Architecture, as Robert C. Martin described it, arranges code in concentric rings and allows dependencies to point only inward. The innermost ring holds the entities — the things the game is *about*: a combatant, an inventory, a turn order. The next ring holds use cases — what the game *does*: resolve an attack, pick up an item, end the turn. Outside those sit adapters that translate between the rules and the engine, and outermost sits the engine itself: nodes, `Input`, `FileAccess`, the scene tree.

In Godot the rule has a blunt practical reading: **the inner rings never reference a `Node`.** They are `RefCounted` classes (and `Resource` classes for data) that know nothing about `_process`, `get_tree()`, `$Sprite2D`, or which frame it is. A node script can `preload` a use case; a use case never `preload`s a scene. That one constraint is what makes the guarantee real: a combat rule that never touches a node can be constructed and exercised in a GUT or gdUnit4 test with no scene tree at all, and the same rule can drive a 2D scene today, a 3D scene next year, and a headless server in between.

```
┌───────────────────────────────────────────────┐
│           Frameworks & Drivers                │  Node2D, Control, Input,
│    scenes, the main loop, FileAccess, RPC     │  AnimationPlayer, FileAccess
│  ┌─────────────────────────────────────────┐  │
│  │          Interface Adapters             │  │  BattleScene maps sim ↔ nodes,
│  │   scripts that map sim ↔ nodes/files    │  │  FileBattleRepository
│  │  ┌───────────────────────────────────┐  │  │
│  │  │           Use Cases               │  │  │  ResolveAttack, EndTurn
│  │  │    RefCounted; define ports       │  │  │  (RefCounted)
│  │  │  ┌─────────────────────────────┐  │  │  │
│  │  │  │         Entities            │  │  │  Combatant, Battle
│  │  │  │  RefCounted / Resource data │  │  │  (no Node anywhere)
│  │  │  └─────────────────────────────┘  │  │  │
│  │  └───────────────────────────────────┘  │  │
│  └─────────────────────────────────────────┘  │
└───────────────────────────────────────────────┘
              ← dependencies point inward
```

## Scenario

A turn-based tactics game. The combat rules grew up inside the enemy scene, because that is where the collision signal arrives:

```gdscript:title="res://enemies/enemy.gd"
extends CharacterBody2D

@export var max_hp: int = 10
@export var attack: int = 3
@export var defence: int = 1
var hp: int

func _ready() -> void:
	hp = max_hp
	$Hurtbox.area_entered.connect(_on_hurtbox_area_entered)

func _on_hurtbox_area_entered(area: Area2D) -> void:
	var attacker := area.owner as Node2D
	var raw: int = attacker.get("attack")
	# Critical hit rule, defence rule and death rule all live here.
	if randf() < 0.1:
		raw *= 2
		$AnimationPlayer.play("crit_flash")
	var dealt := maxi(raw - defence, 1)
	hp -= dealt
	$HealthBar.value = hp
	if hp <= 0:
		$AnimationPlayer.play("die")
		await $AnimationPlayer.animation_finished
		queue_free()
```

The rule "damage is attack minus defence, minimum one, doubled on a crit" is the single most important thing in the game, and there is no way to check it without instantiating a `CharacterBody2D`, adding it to a running tree, spawning something with a hitbox, and waiting for physics to notice. When the player character needs the same rule it gets copy-pasted into `player.gd`, and the two copies drift. The server build, when it comes, cannot run the rule at all without a display.

> **Smell:** a game rule whose only entry point is a signal handler on a node. If you cannot call it from a plain function, you cannot test it from one either.

## Solution

Move the rule inward until it depends on nothing the scene tree provides, then let the scene be the thing that calls it.

**Entities** are plain `RefCounted` classes holding state and the invariants that must always hold. A `Combatant` is not a node; it is the *idea* of a combatant.

```gdscript:title="res://sim/combatant.gd"
class_name Combatant extends RefCounted

var id: StringName
var max_hp: int
var hp: int
var attack: int
var defence: int

func _init(p_id: StringName, p_max_hp: int, p_attack: int, p_defence: int) -> void:
	id = p_id
	max_hp = p_max_hp
	hp = p_max_hp
	attack = p_attack
	defence = p_defence

func is_alive() -> bool:
	return hp > 0

## Applies raw damage through defence. Returns the amount actually dealt.
func take_damage(raw: int) -> int:
	var dealt := maxi(raw - defence, 1)
	hp = maxi(hp - dealt, 0)
	return dealt
```

**Use cases** orchestrate entities to do one thing the game does. They define **ports** — the things they need from the outside world — as small base classes, and depend only on those. Here the use case needs randomness, and it must not call `randf()` directly, because a test needs to force a crit.

```gdscript:title="res://sim/ports/random_source.gd"
class_name RandomSource extends RefCounted

## Port. The outer ring supplies a real generator; tests supply a fixed one.
func next_float() -> float:
	push_error("RandomSource.next_float() not implemented")
	return 0.0
```

```gdscript:title="res://sim/resolve_attack.gd"
class_name ResolveAttack extends RefCounted

const CRIT_CHANCE := 0.1

class Result extends RefCounted:
	var damage: int = 0
	var critical: bool = false
	var target_died: bool = false

var _rng: RandomSource

func _init(rng: RandomSource) -> void:
	_rng = rng

func execute(attacker: Combatant, target: Combatant) -> Result:
	assert(attacker.is_alive(), "a dead combatant cannot attack")
	var result := Result.new()
	result.critical = _rng.next_float() < CRIT_CHANCE
	var raw := attacker.attack * (2 if result.critical else 1)
	result.damage = target.take_damage(raw)
	result.target_died = not target.is_alive()
	return result
```

Nothing in `res://sim/` references `Node`, `Input`, `get_tree()`, or a frame. It can run anywhere GDScript runs — including `godot --headless`.

**Adapters** are where the engine meets the rules. The battle scene owns the mapping between `Combatant` objects and the nodes that draw them, supplies the real port implementations, and turns a `Result` into animation.

```gdscript:title="res://adapters/godot_random.gd"
class_name GodotRandom extends RandomSource

var _rng := RandomNumberGenerator.new()

func _init(seed_value: int = 0) -> void:
	if seed_value != 0:
		_rng.seed = seed_value

func next_float() -> float:
	return _rng.randf()
```

```gdscript:title="res://battle/battle_scene.gd"
extends Node2D

const COMBATANT_VIEW := preload("res://battle/combatant_view.tscn")

var _resolve_attack := ResolveAttack.new(GodotRandom.new())
var _combatants: Dictionary[StringName, Combatant] = {}
var _views: Dictionary[StringName, CombatantView] = {}

func _ready() -> void:
	_spawn(Combatant.new(&"hero", 20, 6, 1), Vector2(100, 200))
	_spawn(Combatant.new(&"slime", 10, 2, 2), Vector2(400, 200))

func _spawn(combatant: Combatant, at: Vector2) -> void:
	_combatants[combatant.id] = combatant
	var view: CombatantView = COMBATANT_VIEW.instantiate()
	view.position = at
	%Units.add_child(view)
	view.show_combatant(combatant)   # view reads hp/max_hp for its bar
	_views[combatant.id] = view

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("attack"):
		_attack(&"hero", &"slime")
		get_viewport().set_input_as_handled()

func _attack(attacker_id: StringName, target_id: StringName) -> void:
	var result := _resolve_attack.execute(_combatants[attacker_id], _combatants[target_id])
	# The rule has already run. Everything below is presentation.
	var target_view := _views[target_id]
	target_view.show_combatant(_combatants[target_id])
	target_view.play_hit(result.critical)
	if result.target_died:
		await target_view.play_death()
		_views.erase(target_id)
		_combatants.erase(target_id)
		target_view.queue_free()
```

The scene is deliberately dull. It reads input, calls a use case, and maps the outcome onto nodes. It makes no decision about damage. If a designer asks "what happens when defence exceeds attack?", the answer is in `combatant.gd` and nowhere else.

### Testing without a scene tree

Because the inner rings are `RefCounted`, a test constructs them directly. No `add_child`, no `await get_tree().process_frame`, no scene to instantiate.

```gdscript:title="res://test/unit/test_resolve_attack.gd"
extends GutTest

class FixedRandom extends RandomSource:
	var value: float
	func _init(p_value: float) -> void:
		value = p_value
	func next_float() -> float:
		return value

func test_defence_never_reduces_damage_below_one() -> void:
	var hero := Combatant.new(&"hero", 20, 1, 0)
	var wall := Combatant.new(&"wall", 50, 0, 99)
	var result := ResolveAttack.new(FixedRandom.new(0.9)).execute(hero, wall)
	assert_eq(result.damage, 1)
	assert_false(result.critical)

func test_critical_doubles_attack_before_defence() -> void:
	var hero := Combatant.new(&"hero", 20, 6, 0)
	var slime := Combatant.new(&"slime", 10, 2, 2)
	var result := ResolveAttack.new(FixedRandom.new(0.05)).execute(hero, slime)
	assert_true(result.critical)
	assert_eq(result.damage, 10)
	assert_true(result.target_died)
```

These run in milliseconds, run under `--headless` in CI, and fail with a line number instead of a screenshot.

### Folder structure

```
res://
├── sim/                      # Entities + Use Cases: RefCounted/Resource only
│   ├── combatant.gd
│   ├── battle.gd
│   ├── resolve_attack.gd
│   └── ports/
│       ├── random_source.gd
│       └── battle_repository.gd
├── adapters/                 # Implement the ports with engine APIs
│   ├── godot_random.gd
│   └── file_battle_repository.gd   # FileAccess + JSON
├── battle/                   # Frameworks & Drivers: scenes and node scripts
│   ├── battle_scene.tscn
│   ├── battle_scene.gd
│   └── combatant_view.tscn
├── data/                     # Resources: .tres files designers edit
│   └── units/
└── test/
    └── unit/                 # no scene tree needed
```

The dependency rule in file terms: nothing under `res://sim/` may `preload`, `load`, or type-hint anything under `res://adapters/`, `res://battle/`, or any `Node` subclass. `res://adapters/` may reference `res://sim/`. `res://battle/` may reference both. Godot will not stop you breaking this — `get_tree()` is reachable from any script through `Engine.get_main_loop()` — so a grep in CI for `Node`, `get_tree`, `Input.` and `preload("res://battle` inside `res://sim/` is the closest thing you have to a compiler check.

### Data in the inner ring

Designers still need the inspector. A `Resource` subclass with `@export`s is allowed in the entities ring — it is data, not a node — so unit definitions can be `.tres` files while the rules stay pure:

```gdscript:title="res://sim/unit_data.gd"
class_name UnitData extends Resource

@export var id: StringName
@export_range(1, 999) var max_hp: int = 10
@export_range(0, 99) var attack: int = 3
@export_range(0, 99) var defence: int = 1

func make_combatant() -> Combatant:
	return Combatant.new(id, max_hp, attack, defence)
```

Keep the `Resource` as a template and the `RefCounted` as the live state. Mutating a shared `.tres` at runtime is the [Flyweight](/patterns/structural/flyweight) trap: every enemy using that file changes with it.

## When to Use

- The game has rules that matter more than the scenes that display them: combat maths, economy, turn order, procedural generation, puzzle validity. The rules are the asset; the presentation is replaceable.
- You want the same simulation to run under a 2D scene, a 3D scene, a replay viewer, and a dedicated server. Only an inner ring that never touches a node can do all four.
- Testing a rule currently requires a running scene, and the test suite is slow, flaky, or non-existent because of it.
- Designers ask "what exactly happens when…" and the honest answer is "let me trace six signal handlers."

## When Not to Use

- A jam game or a prototype where the whole "simulation" is `velocity = direction * speed` and a health integer. The rings add three files where one script would do.
- Physics-driven games where the rules *are* the physics. If `move_and_slide()` and collision layers are the simulation, pulling them out of nodes means re-implementing the physics engine.
- The presentation and the simulation change together, always, and you have no second delivery mechanism in sight. Then the mapping layer costs and never pays.

## The Decision

The whole pattern is one rule, and the engine will not enforce it for you. Godot makes putting state on nodes *pleasant* — `@export` gives you an inspector, `%Unique` gives you a reference, signals give you reactions — and every one of those conveniences pulls logic outward. The moment a use case calls `get_tree().get_nodes_in_group("enemies")` the inner ring has a scene-tree dependency and the guarantee is gone, silently. Holding the line takes a folder convention, a grep, and the willingness to say "no" in review.

The other cost is mapping. Every stat now exists as a field on a `RefCounted`, a property on a view node, and a line in the adapter that copies one to the other. For a combatant with four stats that is trivial. For a city-builder with two hundred, the mapping layer is a real subsystem with its own bugs, and you will want [Simulation / Presentation Split](/patterns/architectural/simulation-presentation) to make the sync step explicit rather than ad hoc. The payoff is a simulation you can run ten thousand times in a test, or on a server with no GPU, or against a recorded input log to reproduce a bug report exactly. If none of those is a change you can see coming, the rings are overhead. This is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off) in practice: the mapping boilerplate is the price, and it is only worth paying for a rule that must outlive its scene.

## Related Patterns

- **[Hexagonal](/patterns/architectural/hexagonal)**: the same dependency rule described as ports and adapters instead of rings. Prefer its vocabulary when the interesting edges are input, storage, and platform services rather than the ring structure itself.
- **[Layered](/patterns/architectural/layered)**: a looser cousin — Presentation → Game logic → Data with downward dependencies but no hard ban on the logic layer knowing about nodes. Start there if full ring discipline feels like too much.
- **[Simulation / Presentation Split](/patterns/architectural/simulation-presentation)**: the game-specific shape of the inner ring: a fixed-tick `RefCounted` world and node views that interpolate it. Clean Architecture says *where* the boundary goes; that pattern says how to keep the two sides in step every frame.
- **[Repository](/patterns/architectural/repository)**: the canonical port. `BattleRepository` is declared in `res://sim/ports/` and implemented with `FileAccess` in `res://adapters/`.
- **[Domain-Driven Design](/patterns/architectural/domain-driven-design)**: tells you what belongs in the entities ring — aggregates, value objects, invariants — where Clean Architecture only tells you that ring must not import a `Node`.
