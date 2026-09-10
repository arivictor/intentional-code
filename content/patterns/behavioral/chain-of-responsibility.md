---
title: "Chain of Responsibility"
description: "Pass a hit, an input event, or a dialogue choice down a list of handlers until one claims it, the way Godot's own input propagation works."
---

# Chain of Responsibility

**Buys composable, independently testable handlers that can short-circuit, the way Godot's own input propagation works; pays in debuggability — you add logging to see where an event stopped.**

Chain of Responsibility passes a request along a sequence of handlers. Each one decides whether to consume it, modify it and pass it on, or ignore it. The sender never learns which handler acted; it just knows the chain finished. Godot runs one of these every frame: an `InputEvent` visits `_input` on every node, then `_gui_input` on the Control under the cursor, then `_shortcut_input`, `_unhandled_key_input` and `_unhandled_input`, and any handler can stop the walk with `get_viewport().set_input_as_handled()`.

The guarantee is that each link is a separate, ordered, replaceable unit. In game code the same shape turns up wherever a request has to survive a gauntlet of independent rules: damage through invulnerability frames, shields and resistances; a dialogue line choosing its successor from a list of conditions; a build placement checked against terrain, overlap, and cost.

## Scenario

An enemy's `take_damage` has grown a rule at a time.

```gdscript:title="res://enemies/enemy.gd"
func take_damage(amount: float, kind: Hit.Kind) -> void:
	if _invulnerable_frames > 0:
		return
	if shield > 0.0:
		var absorbed := minf(shield, amount)
		shield -= absorbed
		amount -= absorbed
		if amount <= 0.0:
			return
	if kind == Hit.Kind.FIRE and has_fire_resistance:
		amount *= 0.5
	if kind == Hit.Kind.POISON and is_undead:
		return
	if _is_stunned:
		amount *= 1.25
	health -= amount
	# Next week: reflect damage, armour that degrades, damage-over-time...
```

Every rule is a conditional in one method, and their order is whatever order they were added in. You can't test the shield rule without the invulnerability rule in front of it. A boss that has shields but no resistances gets the same method with more branches disabled by flags. Designers who want to give one enemy type a reflect ability can't; it's code in a method shared by everything.

> **Smell:** a method that is one long ladder of `if … return` where each rung was added by a different feature ticket.

## Solution

Make each rule a handler with one method, hand the chain a mutable `Hit`, and stop when a handler says the hit is resolved.

```
Hit(fire, 40) ──► Invulnerability ──► Shield ──► Resistance ──► ApplyDamage
                       │                 │            │              │
                    stop?             stop?        modify          stop
```

```gdscript:title="res://combat/hit.gd"
class_name Hit extends RefCounted

enum Kind { PHYSICAL, FIRE, POISON }

var amount: float
var kind: Kind
var trace: PackedStringArray = []

func _init(p_amount: float, p_kind: Kind) -> void:
	amount = p_amount
	kind = p_kind
```

```gdscript:title="res://combat/combat_stats.gd"
class_name CombatStats extends Resource

@export var max_health: float = 100.0
@export var shield: float = 0.0
@export var resistances: Dictionary[Hit.Kind, float] = {}

var health: float = 100.0
var invulnerable: bool = false
```

The handlers are Resources, so a chain is an exported Array a designer can reorder in the inspector, and each handler is testable on its own with a `Hit` and a `CombatStats` and no scene tree.

```gdscript:title="res://combat/handlers/damage_handler.gd"
class_name DamageHandler extends Resource

## Return true when the hit is fully resolved and the chain should stop.
func handle(_hit: Hit, _stats: CombatStats) -> bool:
	return false
```

```gdscript:title="res://combat/handlers/invulnerability_handler.gd"
class_name InvulnerabilityHandler extends DamageHandler

func handle(hit: Hit, stats: CombatStats) -> bool:
	if not stats.invulnerable:
		return false
	hit.trace.append("invulnerable: ignored")
	return true
```

```gdscript:title="res://combat/handlers/shield_handler.gd"
class_name ShieldHandler extends DamageHandler

func handle(hit: Hit, stats: CombatStats) -> bool:
	if stats.shield <= 0.0:
		return false
	var absorbed := minf(stats.shield, hit.amount)
	stats.shield -= absorbed
	hit.amount -= absorbed
	hit.trace.append("shield: absorbed %.0f" % absorbed)
	return hit.amount <= 0.0
```

```gdscript:title="res://combat/handlers/resistance_handler.gd"
class_name ResistanceHandler extends DamageHandler

func handle(hit: Hit, stats: CombatStats) -> bool:
	var multiplier: float = stats.resistances.get(hit.kind, 1.0)
	if multiplier != 1.0:
		hit.amount *= multiplier
		hit.trace.append("resistance: x%.2f -> %.1f" % [multiplier, hit.amount])
	return false
```

```gdscript:title="res://combat/handlers/apply_damage_handler.gd"
class_name ApplyDamageHandler extends DamageHandler

func handle(hit: Hit, stats: CombatStats) -> bool:
	var before := stats.health
	stats.health = maxf(0.0, stats.health - hit.amount)
	hit.trace.append("applied: %.1f -> %.1f" % [before, stats.health])
	return true
```

A child node runs the chain on behalf of whatever it's attached to. The `trace` is the debugging tax paid up front: without it, "why did that hit do nothing?" means stepping through four Resources.

```gdscript:title="res://combat/damage_receiver.gd"
class_name DamageReceiver extends Node

signal hit_resolved(hit: Hit)

@export var stats: CombatStats
@export var handlers: Array[DamageHandler] = []

func _ready() -> void:
	# A .tres is shared by every instance that references it. Health is
	# per-instance, so give this node its own copy.
	stats = stats.duplicate()
	stats.health = stats.max_health

func receive(hit: Hit) -> void:
	for handler in handlers:
		if handler.handle(hit, stats):
			hit_resolved.emit(hit)
			return
	push_warning("Hit fell off the end of the chain: %s" % ", ".join(hit.trace))
```

A fire hit of 40 against a shielded enemy with 50% fire resistance:

```text
shield: absorbed 25, resistance: x0.50 -> 7.5, applied: 100.0 -> 92.5
```

Swapping the order of `Shield` and `Resistance` in the inspector changes the outcome (7.5 absorbed by the shield, then 12.5 applied), and that is the design decision the pattern makes visible instead of burying in an `if` ladder.

### Godot's input chain

The engine's own chain decides who gets an `InputEvent`. The order is fixed; what you control is which stage each node listens at and whether it stops the walk.

```gdscript:title="res://ui/pause_menu.gd"
extends Control

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		accept_event()  # a click on the menu never reaches the level beneath
```

```gdscript:title="res://systems/screenshot.gd"
extends Node

func _input(event: InputEvent) -> void:
	if event.is_action_pressed(&"screenshot"):
		_capture()
		get_viewport().set_input_as_handled()  # nobody else sees this key
```

```gdscript:title="res://player/player.gd"
func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"jump"):
		_jump()  # only reached if no Control and no _input handler claimed it
```

Gameplay belongs in `_unhandled_input` precisely because it comes last: typing in a chat box or clicking a menu should never also make the player jump. Put gameplay in `_input` and you have opted out of the chain.

### A dialogue-condition chain

The same shape picks the next line in a conversation. Each branch rule is a handler that either matches the game state or passes; the first match wins and the last rule is the unconditional default.

```gdscript:title="res://dialogue/branch_rule.gd"
class_name BranchRule extends Resource

@export var next_line: StringName

func matches(_state: GameState) -> bool:
	return true  # the default rule; subclasses override
```

```gdscript:title="res://dialogue/dialogue_line.gd"
func next_line_for(state: GameState) -> StringName:
	for rule in branch_rules:
		if rule.matches(state):
			return rule.next_line
	return &""
```

`QuestActiveRule`, `ReputationRule` and the default sit in an exported `Array[BranchRule]` on the line. When conditions get more expressive than one rule per class can carry, they become a tiny language, and that is [Interpreter](/patterns/behavioral/interpreter).

## When to Use

- A request passes through several independent rules, and the rules' order is a design decision you want visible and editable.
- Different entities need different subsets of the rules: a boss with shields but no resistances is just a shorter Array.
- Handlers should be testable one at a time with GUT or gdUnit4: `ShieldHandler.new().handle(hit, stats)` is a complete test.
- You need "first match wins" over a list of conditions, and the list changes per NPC, per level, or per build.

## When Not to Use

- There are two rules and they won't change. Two `if` statements are [the simplest thing](/philosophy/build-the-simplest-thing); a Resource per rule is not.
- Every handler always runs and none can stop the walk. That is a [Pipe and Filter](/patterns/architectural/pipe-and-filter) chain, not a responsibility chain, and modelling it as one hides that nothing short-circuits.
- The rules need to talk to each other. A handler that reads what another handler decided wants a shared context object; if that context grows into a second `Hit`, the rules weren't independent.

## The Decision

Each handler is small, tested on its own, and reorderable in the inspector. The cost is exactly the one-liner: when a hit produces no damage, you know the chain stopped somewhere and nothing else. The `trace` field above is not optional decoration; it's the price of the pattern paid in advance. Without it you are stepping through four files with a debugger to answer a question the old `if` ladder answered by reading.

The Godot-specific trap is the Resource sharing rule. Handlers as `.tres` files are shared across every enemy that references them, which is fine as long as they're stateless. The moment a handler stores "damage absorbed this frame" on itself, every enemy shares it. Keep state on `Hit` (per request) or `CombatStats` (per instance, duplicated in `_ready`), never on the handler. The same applies to the engine's input chain: `set_input_as_handled()` is global for that event, so a node in `_input` that handles too eagerly starves every Control in the scene.

This is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off) in practice: you trade a method you can read top to bottom for a list you can rearrange, and you should write the log line before you need it.

## Related Patterns

- **[Decorator](/patterns/structural/decorator)**: Both stack behaviours; a Decorator always calls the thing it wraps, a chain handler may not. If nothing ever short-circuits, it's Decorator (or Pipe and Filter), not this.
- **[Pipe and Filter](/patterns/architectural/pipe-and-filter)**: Every stage runs, output feeds input. Use it for damage *calculation*; use a chain when a rule can end the calculation early.
- **[Command](/patterns/behavioral/command)**: The input chain decides which node gets an event; Command decides what to do with it once claimed.
- **[Interpreter](/patterns/behavioral/interpreter)**: When dialogue rules stop being one-class-per-condition and want `and`/`or`/`not`, give them a grammar.
- **[Strategy](/patterns/behavioral/strategy)**: One Strategy replaces a whole behaviour; a chain composes several small ones. A chain of one handler is a Strategy with extra steps.
