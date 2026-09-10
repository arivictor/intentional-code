---
title: Creational Patterns
description: How nodes, scenes, and Resources come into existence — spawning by id, building families, copying templates, pooling bullets, and the one instance you share.
---

## What Are Creational Patterns?

Creational patterns are about construction. They answer the question: **how should this thing come into existence?** Godot gives that question more answers than most environments do. A node can be built in code with `Enemy.new()`, instantiated from a `PackedScene`, duplicated from a configured sibling, borrowed from a pool, or handed to you by an Autoload that existed before your scene did. Each route has a different cost in load time, frame time, and memory, and each has a different answer to the question behind most spawn-time bugs: does the thing I just made share data with something else?

The [SOLID Principles](/philosophy/keep-changes-local#solid), particularly Dependency Inversion, explain why the choice matters. The goal is always to separate *deciding what to make* from *using it*, so a wave spawner or a level script never has to `preload` every concrete scene it might one day need, and a designer can add an enemy type by editing a Resource rather than a `match` statement.

## The Building Blocks

**Start with [Factory Method](/patterns/creational/factory-method)** when a spawner's `match kind:` grows a new branch every time an enemy is added. A `Dictionary[String, PackedScene]` in a Resource lets callers spawn by id or by data, and the spawner stops needing to know what a "brute" is.

**Reach for [Builder](/patterns/creational/builder)** when an object has more options than a constructor can carry readably — an encounter with waves, rewards, music, and ambush rules. Fluent methods give you defaults plus override-any-subset, and `build()` is the one place validation lives. You already use one every time you chain calls on `create_tween()`.

**Use [Abstract Factory](/patterns/creational/abstract-factory)** when you have *families* of scenes that must never mix: a faction's units, its projectiles, and its death effects. A `FactionFactory` Resource with exported `PackedScene`s makes the family one file, and an archer that only holds one factory can't fire another faction's arrows.

**[Prototype](/patterns/creational/prototype)** is `duplicate()`. It copies a configured node or Resource cheaply, which is exactly what you want for a designer-tuned template enemy — until you discover the copy shares a sub-Resource with the original. The page is mostly about the shallow-versus-deep rules the engine won't check for you.

**[Object Pool](/patterns/creational/object-pool)** trades `instantiate()` and `queue_free()` for reuse, which keeps bullet-hell frames flat. The price is a `reset()` contract every pooled scene must honour, because a bullet that remembers its last life fails during the boss fight.

**[Singleton (Autoload)](/patterns/creational/singleton)** is the one I'd argue with most. Godot makes a global one click away, and that convenience is why so many projects end up with a `GameManager` that every scene silently depends on. Autoloads earn their place for settings, the audio bus, input, and scene flow; for everything else, pass a reference.
