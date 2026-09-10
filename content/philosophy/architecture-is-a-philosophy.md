---
title: Architecture is a philosophy, not a rule
nav_title: A philosophy, not a rule
description: Every codebase has architecture. The only choice is whether you shaped it on purpose. Principles are lenses, not laws.
order: 1
---

# Architecture is a philosophy, not a rule

Every Godot project has architecture, the shape is already there in the scene tree, in which scripts reach for which nodes, in the Autoloads everything quietly depends on, in the signals people connect when they touch a scene they didn't build. The only choice you actually get is whether that shape happened on purpose or by accident.

So the first tenet is a refusal. Architecture is not a checklist you apply or a rulebook you obey. It is a way of thinking about code, a continuous process of listening for pressure and adjusting boundaries. Every principle on this site is a *lens* for seeing that pressure more clearly. None of them is a law, and the moment you treat one as a law is the moment a good idea curdles into cargo cult. "Never use Autoloads" is cargo cult. "An Autoload is a global, and this one is paying for its globality" is a decision.

Tending a game project is closer to gardening than to pouring a foundation. You plant, water, prune, and let things grow. You don't need to know exactly how the game will look in a year; you need to create conditions where it can thrive, and keep tending it. A small decision today — health as an `int` on the player, the HUD reading it by node path — becomes a hard constraint later, so the work is never really "done."

## When architecture helps

Architecture earns its keep when change pressure is already in the room:

- the project has outlived its life as a prototype or jam entry
- several people need a shared structure to work inside, designers included
- the design is still moving — mechanics get cut, enemies get merged, systems get reworked
- the platform or storage details are likely to change (a console port, a new save format)
- correctness and reliability genuinely matter — a corrupted save is a one-star review

At that point boundaries stop being theory. They keep one change from spilling into six scenes, and they let the level designer and the systems programmer work in parallel without colliding all afternoon.

## When architecture hurts

Architecture turns to ceremony when it arrives before the work does:

- game jams, prototypes, and "does this mechanic feel good?" experiments
- one-off tool scripts with a clear expiry date
- a small game with simple, stable requirements
- a team that doesn't understand the game yet — nobody has found the fun

You can read it in the symptoms: component nodes nobody can explain, folders named for a system that never arrived, an event bus with three events, review comments defending structure no one has needed yet. People who do this well recognise the *names* of patterns. People who have done it for years recognise the *pressure* that asks for them.

## Clean Code

The smallest scale at which this tenet shows up is the everyday act of writing a function. "Clean Code" is usually handed down as a set of rules, then argued about as if the rules were the point. They aren't. The audience for clarity is the next person who reads this, and they will spend more time reading it than you spent writing it. No rule can settle for you what *that person* needs to understand. Take the most consequential example, naming:

```gdscript
# BAD — names that say nothing.

func c(a: Node2D, b: Node2D, r: float) -> bool:
	var d := a.global_position.distance_to(b.global_position)
	return d <= r
```

```gdscript
# GOOD — names that explain intent without a comment.

func is_within_reach(player: Node2D, target: Node2D, reach: float) -> bool:
	var distance := player.global_position.distance_to(target.global_position)
	return distance <= reach
```

No rule produced `is_within_reach`. A style guide can hand you `snake_case` and "boolean functions read as questions," but it cannot tell you that this function is best named for the question the interaction system is asking. That last step is judgment, and it is the same judgment, scaled down, that decides where a scene boundary goes or whether a component node should exist. Clarity is decided per reader. (The neighbouring idea that a function should do only one thing belongs to [making the next change local](/philosophy/keep-changes-local#solid); the point here is narrower.)

> **Smell:** You have to read a `_process` three times to know what it does. A variable named `data`, `result`, `temp`, or `x` at script scope. A comment that starts with "this function..." A node named `Node2D3`.
