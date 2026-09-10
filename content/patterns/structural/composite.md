---
title: "Composite"
description: "Let a squad, an army, and a single unit answer the same take_damage and get_total_health calls by making the scene tree itself the structure."
---

# Composite

**Buys uniform recursion over the scene tree so a squad and a single unit answer the same call; pays when the shared contract grows too coarse and leaves must stub methods that don't apply.**

A Composite is a tree where branches and leaves share one interface, so a caller can hand a message to any node without asking whether it is one thing or many. A branch answers by asking its children and combining what they say. In Godot you do not build the tree — you already have one. Every scene is a Composite of nodes, `get_children()` is the traversal, and the engine's own `propagate_call` is the pattern with the engine doing the recursion. What the pattern adds is a contract of your own on top of that tree: a `Combatant` base class that a `Unit` and a `Squad` both extend, so `take_damage()` on an army spreads down to soldiers and `get_total_health()` on a soldier bubbles up to the army.

The guarantee is that callers never branch on type. An explosion damages "whatever it hit"; a HUD sums "whatever is selected". Neither has to know how deep the selection goes.

## Scenario

An area-of-effect explosion decides how to hurt what it touched:

```gdscript:title="res://combat/aoe_explosion.gd"
func _on_body_entered(body: Node2D) -> void:
	if body is Unit:
		body.take_damage(damage)
	elif body is Squad:
		for unit: Unit in body.units:
			unit.take_damage(damage / body.units.size())
	elif body is Fortress:
		for squad: Squad in body.garrison:
			for unit: Unit in squad.units:
				unit.take_damage(damage / body.garrison.size() / squad.units.size())
```

The objective tracker repeats the same nesting to add up remaining health. The selection HUD repeats it to draw a health bar. Then design adds a `Hero` that fights alone, outside any squad, and a `Squad` that can contain smaller squads, and every one of those `if` ladders grows another rung. The structure of the army is spelled out in three different scripts, and they disagree about it.

> **Smell:** `if x is A ... elif x is B ...` with a nested `for` under each branch.

## Solution

Put the army in the scene tree and give every rank the same script contract.

```
Army (Combatant)
├── Vanguard (Squad → Combatant)
│   ├── Knight (Unit → Combatant)
│   ├── Knight (Unit → Combatant)
│   └── Archer (Unit → Combatant)
├── Reserve (Squad → Combatant)
│   └── Healer (Unit → Combatant)
└── Hero (Unit → Combatant)          ← a leaf directly under the root
```

The base class is the contract. Both calls have a default so a subclass can pick what to override; the default for `take_damage` shouts because a combatant that ignores damage is almost certainly a bug.

```gdscript:title="res://combat/combatant.gd"
class_name Combatant extends Node2D
## The shared contract. A single unit and a whole army answer the same calls.

signal died(combatant: Combatant)

func _enter_tree() -> void:
	add_to_group("combatants")

func take_damage(_amount: float) -> void:
	push_error("%s does not implement take_damage" % name)

func get_total_health() -> float:
	return 0.0

func is_alive() -> bool:
	return get_total_health() > 0.0
```

The leaf owns actual hit points:

```gdscript:title="res://combat/unit.gd"
class_name Unit extends Combatant
## Leaf. Has its own health and nothing beneath it.

@export var max_health: float = 30.0

var health: float

func _ready() -> void:
	health = max_health

func take_damage(amount: float) -> void:
	if health <= 0.0:
		return
	health = maxf(health - amount, 0.0)
	if health == 0.0:
		died.emit(self)
		queue_free()

func get_total_health() -> float:
	return health
```

The composite has no health of its own. Its members are whichever children are `Combatant` — units, squads, a hero — and it neither knows nor cares which:

```gdscript:title="res://combat/squad.gd"
class_name Squad extends Combatant
## Composite. Splits damage across members, sums their health.

func take_damage(amount: float) -> void:
	var members := _members()
	if members.is_empty():
		return
	var share := amount / members.size()
	for member in members:
		member.take_damage(share)
	if get_total_health() <= 0.0:
		died.emit(self)
		queue_free()

func get_total_health() -> float:
	var total := 0.0
	for member in _members():
		total += member.get_total_health()
	return total

func _members() -> Array[Combatant]:
	var out: Array[Combatant] = []
	for child in get_children():
		if child is Combatant:
			out.append(child)
	return out
```

Because `_members()` filters `get_children()`, a squad can carry a `Sprite2D` banner, a `Label`, or an `AudioStreamPlayer2D` alongside its units and the recursion steps over them. `Army` is simply a `Squad` at the root — no third class needed.

The explosion collapses to a type check on the contract, not on the hierarchy:

```gdscript:title="res://combat/aoe_explosion.gd"
func _on_body_entered(body: Node2D) -> void:
	if body is Combatant:
		body.take_damage(damage)
```

Running it against the tree above (knights 30 each, archer 30, healer 20, hero 40) and hitting the army for 60:

```gdscript:title="res://combat/army_demo.gd"
func _ready() -> void:
	var army: Squad = $Army
	for combatant: Combatant in get_tree().get_nodes_in_group("combatants"):
		combatant.died.connect(func(c: Combatant) -> void: print("died: ", c.name))
	print("Army health: ", army.get_total_health())
	army.take_damage(60.0)
	print("Army health: ", army.get_total_health())
```

```text
Army health: 150.0
died: Healer
died: Reserve
Army health: 90.0
```

Sixty damage split three ways at the root: twenty to Vanguard (spread across three units), twenty to Reserve (all of it on the lone healer, who dies, which empties the squad, which dies), twenty to the hero. Two `died` signals from two different depths, handled by one connection, because both come from the same contract.

### `propagate_call` and the double-hit trap

The engine already knows how to walk a subtree. `army.propagate_call("apply_status", [&"poisoned", 5.0])` calls `apply_status` on the army node and every descendant that has the method, top-down, with no base class required. For broadcasts — apply a status, set a team colour, freeze everyone — it is the right tool and it needs no Composite of your own.

It is the wrong tool for `take_damage`, and the reason is instructive. `propagate_call` reaches every node itself; if `Squad.take_damage` also forwards to its members, every unit is hit twice — once by the engine's walk and once by its parent. Use `propagate_call` when each node handles only its own part. Use the Composite contract when the parent must *combine* (sum health) or *divide* (share damage), because those are operations on the group, and only a group node can do them. The flat alternative for broadcast, `get_tree().call_group("combatants", "apply_status", ...)`, ignores the tree entirely and is right when structure does not matter at all.

## When to Use

- Groups of groups: squads in armies, folders in an inventory, sub-menus in menus, nested selections.
- Callers should not care whether they hold one thing or many, and the branch operation is an aggregate (sum, split, any, all) rather than a per-node effect.
- The structure changes at runtime — units reparented between squads with `remove_child`/`add_child` — and every traversal should see the new shape without being told.

## When Not to Use

- The collection is flat. A `Party` with an `Array[Unit]` and a `for` loop is a list; making it a tree adds a class and a recursion for nothing.
- Leaf and branch operations diverge. `Unit.equip(weapon)` makes no sense on a `Squad`; if the contract acquires it, every squad stubs it.
- A one-off broadcast with no aggregation. `propagate_call` or a group call already does that.
- The parent needs to treat children differently by type. That is not a Composite, it is a manager, and the `if` ladder is honest about it.

## The Decision

You buy code that never asks "how deep does this go", and you pay with a contract that must fit every rank. The base class is the pressure point. `take_damage` and `get_total_health` fit a unit and a squad equally well; `get_weapon()` does not, and the day it lands on `Combatant` is the day every squad returns `null` from a method it should not have. Keep the shared contract to the operations that genuinely aggregate, and put leaf-only behaviour on the leaf, reached through `is Unit` at the one call site that needs it.

Godot adds two gotchas that the textbook version does not have. `queue_free()` is deferred, so a squad's `get_total_health()` called in the same frame as a member's death still sees the dead member (at zero health, so the sum is right, but a `_members().size()` count is not). Anything that stores a `Combatant` reference across frames must check `is_instance_valid` before using it. And a branch that iterates `get_children()` while a child `queue_free`s itself is fine, but one that `remove_child`s during iteration is not; copy the members first, as `_members()` does.

Recursion cost is usually a non-issue at squad scale and a real one at "every tile in a chunked world" scale, where `get_children()` allocates an Array per call. At that point store the leaves in a flat Array and keep the tree for structure only.

This is [naming the trade-off](/philosophy/name-the-trade-off): uniform recursion is worth a coarse contract exactly as long as the contract stays small.

## Related Patterns

- **[Decorator](/patterns/structural/decorator)**: Decorator wraps one object; Composite holds many. A `Squad` with one member is still a Composite, because the caller does not know it has one.
- **[Iterator](/patterns/behavioral/iterator)**: Composite makes the shape; a custom `_iter_*` over it lets callers walk the leaves in order without recursing themselves.
- **[Visitor](/patterns/behavioral/visitor)**: When new operations over the tree arrive faster than new node types, Visitor keeps them out of the contract. A `match` on type is usually enough before that.
- **[Node Composition](/patterns/architectural/composition)**: Node Composition assembles one entity's behaviour from child components; Composite treats a subtree as one entity. A `Unit` is built by the first and grouped by the second.
- **[Mediator](/patterns/behavioral/mediator)**: When members need to talk to each other rather than only answer their parent, a squad node that routes those messages has become a Mediator as well.
