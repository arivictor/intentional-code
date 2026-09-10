---
title: Duplication is cheaper than the wrong abstraction
nav_title: The wrong abstraction
description: Repeated code is a small, visible cost. Two things that change for different reasons are not one rule, however alike they look today.
order: 8
---

# Duplication is cheaper than the wrong abstraction

"Don't repeat yourself" gets taught as a reflex: see two similar scripts, merge them into a base class. But the reflex skips the only question that matters. Do these two things represent the same knowledge, or do they just happen to look alike right now? The moment you extract a shared abstraction from two things that merely resemble each other, you weld their futures together. When one needs to change and the other doesn't, you're stuck adding an `@export` flag, then a branch, then a second flag, slowly turning a clean script into a thicket of special cases.

That thicket is more expensive than the duplication ever was. Repeated code is a small, visible cost: you can see all the copies, and updating them is mechanical. The wrong abstraction is a large, hidden one: it actively resists the change you now need, and un-welding it is far harder than copy-paste would have been. So when you're unsure, prefer the duplication. It keeps your options open; a premature abstraction spends them.

The phrasing is Sandi Metz's, from her 2016 essay [*The Wrong Abstraction*](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction). The idea predates Godot, but it lands hard in GDScript, where `extends` and inherited scenes make an abstraction cheap to reach for and just as quietly expensive to unwind. A base scene with an inherited scene per enemy looks tidy in the FileSystem dock right up until two of them want different collision shapes.

Read correctly, the principle was never about repeated *lines*. It's about repeated *knowledge* — a single game rule, a single source of truth — that genuinely has one home. The practical test is "when this rule changes, how many places must I touch?" One is right. More than one is a liability. But two things that change for different reasons are not one rule, however alike they look today.

## DRY

The principle's real name — *Don't Repeat Yourself* — is fine; it's the misreading that's dangerous. The most expensive mistake is merging two things that only look alike:

```gdscript:title="res://enemies/rat.gd"
# Two enemies whose flee checks look identical but encode independent
# design decisions. Do NOT merge these. They will diverge.

# A rat runs when hurt. Tuned for comedy: rats are cowards.
func should_flee() -> bool:
	return health < max_health * 0.3
```

```gdscript:title="res://enemies/knight.gd"
# A knight falls back when hurt. Tuned for pacing: knights regroup.
func should_flee() -> bool:
	return health < max_health * 0.3
```

These look like duplication; they aren't. The rat's number is about cowardice and will be pushed around for laughs. The knight's is about the rhythm of a boss fight and is about to depend on whether any allies are still standing. A shared `FleeingEnemy` base class with `@export var flee_threshold: float` would weld them together, and the first time the knight needs `flee_requires_allies` the rat inherits a flag it must ignore. The same trap catches two menus: the pause menu and the game-over menu both have a "Settings" button and a "Quit to title" button, and a `GenericMenu` scene with `show_resume` and `retry_reloads_level` toggles will spend the rest of the project accumulating toggles.

The flip side is just as real: when the player, the enemies, and the damage preview in the HUD each compute `attack * (1.0 - armour / 100.0)`, that is one rule with three copies, and it belongs in one place — a static function on a `Combat` class, or a `DamageFormula` Resource — so that the rule changes in one file. The tell is whether they change for the same reason. And when you're unsure, wait: the Rule of Three says the first instance is just code, the second a coincidence, the third a pattern worth naming. Extract before that and you're designing the abstraction before you understand its shape.

> **Smell:** The damage formula changes, you update it in the player, and a bug report two weeks later says enemies still use the old one. Or you grep `0.3` and find it hardcoded in five scripts. Or a base class has an `@export` that half its subclasses set to "off".

See also: [Single Responsibility Principle](/philosophy/keep-changes-local#solid), [Strategy](/patterns/behavioral/strategy), [Data-Driven Design](/patterns/architectural/data-driven).
