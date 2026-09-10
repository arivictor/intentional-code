---
title: Structural Patterns
description: Composing nodes, scenes, and Resources by wrapping, combining, and sharing them without editing the originals.
---

## What Are Structural Patterns?

Structural patterns are about composition. You wrap, combine, or share existing pieces and leave them alone. Godot pushes you towards this constantly: a scene is a tree of nodes, a node's behaviour is assembled from child components, and a Resource can be referenced from a thousand places at once. You will have built most of these shapes before you learn their names.

The scene tree is the tell. Every pattern in this family maps onto something the engine already does: the tree is a Composite, a Resource shared across instances is a Flyweight, an Autoload that orchestrates subsystems is a Facade. The names matter because they carry the trade-offs — knowing that a `.tres` shared by every goblin is a Flyweight tells you, before the bug report arrives, that mutating it will change every goblin.

Most of these patterns are the [Open/Closed and Dependency Inversion principles](/philosophy/keep-changes-local#solid) in node form: add behaviour by adding a wrapper or a child, and make game code depend on a class you own rather than on a vendor's addon or a concrete scene.

## The Building Blocks

**Start with [Adapter](/patterns/structural/adapter)** when a platform SDK or a third-party addon almost fits what your game needs. Wrap it once in a class you own, hand game code that class, and ship a `NullAchievements` version so the editor and the test runner never need Steam running.

**[Decorator](/patterns/structural/decorator)** stacks modifiers around a calculation without touching it: buffs, status effects, and damage multipliers each wrap the one beneath. The order you stack them in changes the answer and nothing checks it, which is why a flat list of `Resource` modifiers applied in a loop is often the better tool.

**[Proxy](/patterns/structural/proxy)** looks like a Decorator from the outside but has a different job: it controls access. A lazily loaded level behind `ResourceLoader.load_threaded_request`, a shop that refuses you until your reputation is high enough, and a pathfinding cache all present the same interface as the real thing and decide when to hand over.

**[Facade](/patterns/structural/facade)** gives many callers one entry point to a sequence that touches several subsystems. `GameFlow.start_level()` over audio, save, scene loading, and the HUD is the classic case. Keep each facade to one workflow, or it grows into the god-autoload everyone warns you about.

**[Composite](/patterns/structural/composite)** is the scene tree. A `Squad` node and a `Unit` node that both answer `take_damage` and `get_total_health` let an explosion hit an army without knowing what it hit. `propagate_call` is the engine's own version, with a double-dispatch trap.

**[Bridge](/patterns/structural/bridge)** splits two axes of variation that would otherwise multiply: every weapon × every wielder becomes N weapon scenes plus M controller scripts. It does not pay for itself until each axis has three or more options.

**[Flyweight](/patterns/structural/flyweight)** is what a Resource already is. One `EnemyData` shared by a thousand enemies, and one mesh shared by a `MultiMesh`, keep memory flat. The pattern's real content is knowing where the intrinsic/extrinsic line sits and never writing to the shared side.
