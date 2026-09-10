---
title: "Decorator"
description: "Stack buffs, status effects, and damage multipliers around a base calculation by wrapping it, so the weapon never learns what modified it."
---

# Decorator

**Buys stackable modifiers (buffs, status effects, damage multipliers) with no edits to the thing they wrap; pays in order-sensitivity nothing checks and effects that are hard to trace.**

A Decorator wraps an object and answers the same calls, doing something extra before or after it hands the call inward. Stack several and you get a chain: each layer sees only the layer beneath it, and the outermost one is what the caller holds. In a game the calls being wrapped are usually calculations — damage, movement speed, cooldown, gold earned — and the layers are whatever the designers call them that week: enchantments, buffs, curses, difficulty modifiers.

The guarantee is that the base calculation and every modifier are separate scripts that never mention each other. Adding a "frostbite" effect is one new class; the weapon script does not change. That is the [Open/Closed Principle](/philosophy/keep-changes-local#solid) in the most literal form it takes in gameplay code. The part the guarantee does not cover is the order you stack them in, which is where most of the bugs live.

## Scenario

A weapon works out how much damage it does. It started as one line and has been growing for a year:

```gdscript:title="res://combat/weapon.gd"
func calculate_damage(target: Node) -> float:
	var damage := base_damage
	if wielder.has_buff(&"strength"):
		damage += 5.0
	if wielder.has_buff(&"berserk"):
		damage *= 1.5
	if randf() < crit_chance:
		damage *= 2.0
	if enchantment == &"fire" and target.is_in_group("frozen"):
		damage *= 3.0
	if wielder.has_buff(&"weakened"):
		damage *= 0.7
	if target.has_method("get_armour"):
		damage = maxf(damage - target.get_armour(), 1.0)
	return damage
```

Every new status effect is an edit to this function, and to the copy of it in `enemy_weapon.gd`, and to the third copy in `trap.gd`. Whether `berserk` multiplies before or after `strength` adds is decided by the line order and documented nowhere. You cannot test the crit rule without a wielder, a target, and every other branch quiet. When a player reports that "weakened plus berserk does more damage than berserk alone", nobody can say from the code whether that is a bug.

> **Smell:** A calculation function whose `if` count grows with the content list.

## Solution

Turn each modifier into a small class that wraps the one beneath it. The weapon builds a chain and calls `calculate()` on the outermost link. The chain records what each link did, so the trace that was impossible above is one `print` away.

```
Weapon.attack(target)
   │
   ▼  calculate(hit)
┌──────────┐   ┌──────────┐   ┌────────────┐   ┌─────────────┐   ┌──────────┐
│ Armour   │──►│ Crit     │──►│ Multiplier │──►│ FlatBonus   │──►│ Base     │
│ (outer)  │   │ x2 @25%  │   │ x1.5       │   │ +5          │   │ 12       │
└──────────┘   └──────────┘   └────────────┘   └─────────────┘   └──────────┘
   ◄── result flows back out, each link adjusting it ──
```

The context object carries whatever a modifier might need and a trace:

```gdscript:title="res://combat/hit.gd"
class_name Hit extends RefCounted
## Everything a modifier may need to know about one attack.

var attacker: Node
var target: Node
var trace: Array[String] = []

func _init(p_attacker: Node, p_target: Node) -> void:
	attacker = p_attacker
	target = p_target
```

The base of the chain. Every modifier extends it, holds an inner link, and overrides `calculate`:

```gdscript:title="res://combat/damage_modifier.gd"
class_name DamageModifier extends RefCounted
## One link in a damage chain. Wraps another link and answers the same call.

var _inner: DamageModifier

func _init(inner: DamageModifier = null) -> void:
	_inner = inner

func calculate(hit: Hit) -> float:
	return _inner.calculate(hit) if _inner else 0.0
```

GDScript allows one `class_name` per file, so the concrete modifiers live as inner classes under a namespace script. Each is a handful of lines.

```gdscript:title="res://combat/damage_modifiers.gd"
class_name DamageModifiers
## Namespace for concrete modifiers: DamageModifiers.FlatBonus.new(...)

class Base extends DamageModifier:
	var amount: float

	func _init(p_amount: float) -> void:
		amount = p_amount

	func calculate(hit: Hit) -> float:
		hit.trace.append("base %.1f" % amount)
		return amount


class FlatBonus extends DamageModifier:
	var bonus: float

	func _init(inner: DamageModifier, p_bonus: float) -> void:
		super(inner)
		bonus = p_bonus

	func calculate(hit: Hit) -> float:
		var result := _inner.calculate(hit) + bonus
		hit.trace.append("+%.1f -> %.1f" % [bonus, result])
		return result


class Multiplier extends DamageModifier:
	var factor: float

	func _init(inner: DamageModifier, p_factor: float) -> void:
		super(inner)
		factor = p_factor

	func calculate(hit: Hit) -> float:
		var result := _inner.calculate(hit) * factor
		hit.trace.append("x%.2f -> %.1f" % [factor, result])
		return result


class Crit extends DamageModifier:
	var chance: float
	var rng: RandomNumberGenerator

	func _init(inner: DamageModifier, p_chance: float, p_rng: RandomNumberGenerator) -> void:
		super(inner)
		chance = p_chance
		rng = p_rng

	func calculate(hit: Hit) -> float:
		var result := _inner.calculate(hit)
		if rng.randf() < chance:
			result *= 2.0
			hit.trace.append("crit -> %.1f" % result)
		return result


class Armour extends DamageModifier:
	func calculate(hit: Hit) -> float:
		var result := _inner.calculate(hit)
		if hit.target.has_method("get_armour"):
			var armour: float = hit.target.get_armour()
			result = maxf(result - armour, 1.0)
			hit.trace.append("armour %.0f -> %.1f" % [armour, result])
		return result
```

The `rng` is injected rather than calling the global `randf()`, so a test can seed it and assert on a crit deterministically. The weapon builds the chain from what the wielder currently has, innermost first, and reads the answer off the outermost link:

```gdscript:title="res://combat/weapon.gd"
class_name Weapon extends Node2D

@export var base_damage: float = 12.0
@export var crit_chance: float = 0.25

var _rng := RandomNumberGenerator.new()

func build_chain(wielder: Node) -> DamageModifier:
	var chain: DamageModifier = DamageModifiers.Base.new(base_damage)
	for buff: Buff in wielder.get_buffs():
		chain = buff.wrap(chain)  # each buff contributes its own modifier
	chain = DamageModifiers.Crit.new(chain, crit_chance, _rng)
	chain = DamageModifiers.Armour.new(chain)
	return chain

func attack(target: Node) -> void:
	var wielder := get_parent()
	var hit := Hit.new(wielder, target)
	var damage := build_chain(wielder).calculate(hit)
	print(" | ".join(hit.trace))
	target.take_damage(damage)
```

With a strength buff (+5), a berserk buff (x1.5), a lucky roll, and a target with 8 armour:

```text
base 12.0 | +5.0 -> 17.0 | x1.50 -> 25.5 | crit -> 51.0 | armour 8 -> 43.0
```

Every modifier is a `RefCounted` with no scene dependency, so `Crit` can be tested with a seeded `RandomNumberGenerator` and a fake `Hit` in gdUnit4 without instantiating a weapon.

### Order is the whole game

Swap the two buffs — berserk applied before strength — and the same inputs give a different number:

```text
base 12.0 | x1.50 -> 18.0 | +5.0 -> 23.0 | crit -> 46.0 | armour 8 -> 38.0
```

Nothing in the language, the engine, or the chain objects to either order. The `for buff in wielder.get_buffs()` loop above stacks modifiers in the order buffs were acquired, which means the same two buffs produce different damage depending on which the player picked up first. That is the exact bug from the scenario, reproduced faithfully by the pattern. The fix is to make the order a rule rather than an accident: give each buff a `priority`, sort before wrapping, and put the fixed links (`Crit`, `Armour`) at fixed positions in `build_chain`. The chain does not enforce that rule. You do.

## The flat list of Resources

Before committing to wrappers, look at what most of the modifiers actually are: a number and an operation. That shape does not need a chain; it needs a list and a loop, and it is much friendlier to designers if the entries are `.tres` files.

```gdscript:title="res://combat/stat_modifier.gd"
class_name StatModifier extends Resource
## A modifier designers edit in the inspector. Sorted by priority, applied in a loop.

enum Kind { FLAT, PERCENT }

@export var kind: Kind = Kind.FLAT
@export var value: float = 0.0
@export var priority: int = 0  # flat bonuses at 0, multipliers at 10, by convention
```

```gdscript:title="res://combat/stat_calculator.gd"
class_name StatCalculator extends RefCounted

static func apply(base: float, modifiers: Array[StatModifier]) -> float:
	var sorted := modifiers.duplicate()
	sorted.sort_custom(func(a: StatModifier, b: StatModifier) -> bool: return a.priority < b.priority)
	var result := base
	for modifier in sorted:
		match modifier.kind:
			StatModifier.Kind.FLAT:
				result += modifier.value
			StatModifier.Kind.PERCENT:
				result *= 1.0 + modifier.value
	return result
```

The order problem is now a visible integer on each Resource, the whole set of active modifiers is an Array you can print or show in a debug panel, and a new buff is a new `.tres` with no code. For arithmetic, this wins.

Decorator earns its place when a modifier has to change *behaviour*, not just a number: a `Dodge` link that returns `0.0` without calling inward, a `Reflect` link that damages the attacker as a side effect, a `Lifesteal` link that reads the final number and heals. Those need to sit around the calculation, see its result, and sometimes refuse to perform it at all. A loop over enum kinds cannot express "skip the rest", and an enum that grows a `DODGE`, `REFLECT`, `LIFESTEAL` entry is the scenario's `if` chain wearing a different hat.

## When to Use

- Modifiers must intercept a calculation — short-circuit it, react to its result, or add a side effect — rather than only adjust a number.
- Modifiers come from code (equipment scripts, boss phases) as often as from data.
- You need a trace of which effect did what, and the engine's debugger cannot give you one.
- Different entities need different stacks of the same modifiers: a weapon, an enemy, a trap each build their own chain from shared parts.

## When Not to Use

- Every modifier is `+n` or `×n`. A sorted `Array[StatModifier]` and a loop is simpler, inspectable, and tuned in the inspector.
- The modifier needs the weapon's private state. A decorator that reaches into what it wraps is a refactor waiting to happen, not a decorator.
- The chain is rebuilt every frame for thousands of entities. Each link is an allocation; build once per buff change and cache it.
- One fixed stack, never varied. Write the calculation inline and move on.

## The Decision

The trade is edits for order. A chain lets you add a modifier without opening the weapon, and takes away the one place where the order of operations used to be visible. The `if` chain in the scenario was wrong in many ways, but it did state the order in plain text; the decorator version states it in whichever sequence `build_chain` happened to wrap things. Treat the wrapping order as a design decision with a name — "flat, then percent, then crit, then armour" — and write it into `build_chain` or a `priority` field, never into acquisition order.

Traceability is the other cost, and the `Hit.trace` array is a deliberate answer to it: a chain five links deep tells you nothing from the outside, and the Godot debugger will show you `calculate` frames of five different inner classes with no hint of which is which. Recording each step costs a string per link per hit, which is fine for a sword and not fine for a bullet-hell spawner; strip the trace under a debug flag when it matters.

The chain being `RefCounted` all the way down is what makes this testable. None of it touches the scene tree, so a gdUnit4 test can build a chain by hand, seed the RNG, and assert on the number without a `Weapon` node ever existing.

## Related Patterns

- **[Adapter](/patterns/structural/adapter)**: Adapter changes the interface; Decorator keeps it and adds behaviour. If the wrapper's method signatures differ from the wrapped object's, it is an Adapter.
- **[Proxy](/patterns/structural/proxy)**: Structurally the same wrapper; the intent differs. A Proxy controls whether the call reaches the real thing (lazy load, access check, cache). A Decorator always lets it through and changes the result.
- **[Composite](/patterns/structural/composite)**: Decorator wraps exactly one thing; Composite holds many of the same type. If a "modifier" turns out to contain a list of modifiers, it has become a Composite.
- **[Chain of Responsibility](/patterns/behavioral/chain-of-responsibility)**: A `Dodge` link that stops the chain is Chain of Responsibility behaviour inside a Decorator shape. When most links can short-circuit, name it that.
- **[Pipe and Filter](/patterns/architectural/pipe-and-filter)**: The flat loop above is a pipeline of stages over a value. Prefer it when stages are pure transforms and never need to skip each other.
- **[Data-Driven Design](/patterns/architectural/data-driven)**: The `StatModifier` Resource is the data-driven alternative. It moves modifier tuning to designers and the inspector, which is usually where it belongs.
