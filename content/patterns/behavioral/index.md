---
title: Behavioural Patterns
description: Patterns for how nodes communicate, hand off responsibility, and select behaviour at runtime in a Godot project.
---

## What Are Behavioural Patterns?

Behavioural patterns are about communication. They answer the question: **how should these nodes talk to each other, and who decides what happens next?** Where structural patterns are about how scenes and Resources fit together, behavioural patterns are about runtime flow: who calls whom, how an algorithm is chosen, how a change in one node reaches the others, how history is tracked.

Godot ships with several of these built in. Signals are Observer. `_ready` and `_process` are Template Method hooks. Input propagation from `_input` through `_gui_input` to `_unhandled_input` is a Chain of Responsibility. `UndoRedo` is Command. `AnimationTree` carries a State machine. Knowing the pattern behind the feature tells you what it guarantees and where it will bite. The rule that runs through the whole family is "call down, signal up": a parent calls methods on its children, a child emits signals its parent may connect to, and nothing reaches sideways with `get_node("../")`.

Behavioural patterns lean on the [SOLID principles](/philosophy/keep-changes-local#solid): Open/Closed drives Strategy and Observer; Single Responsibility drives Command and Mediator.

## The Building Blocks

**Start with [Strategy](/patterns/behavioral/strategy)** if you have a `match` on an enum choosing between movement or targeting behaviours. In Godot a strategy is a Resource subclass assigned via `@export`, so designers pick a `.tres` in the inspector, or a Callable when it carries no data. The `match` doesn't vanish; it moves to whoever assigns the strategy.

**[Observer (Signals)](/patterns/behavioral/observer)** is the pattern you already use every day: a signal is a subject, a connection is an observer. The page covers what the engine does and doesn't guarantee — `CONNECT_ONE_SHOT`, `CONNECT_DEFERRED`, connections that outlive their nodes, and firing order — and when a direct signal beats an autoload signal bus.

**[Command](/patterns/behavioral/command)** turns an action (jump, attack, move a unit) into an object. That's the price of admission for undo via `UndoRedo`, input buffering, replays, and remapping which behaviour an action triggers. Until you need one of those, a method call is the command.

**[Chain of Responsibility](/patterns/behavioral/chain-of-responsibility)** passes a request down a list of handlers until one claims it. Godot's input system works exactly this way, ending with `set_input_as_handled()`. The same shape resolves damage through invulnerability, shields and resistances, or picks the next dialogue line from a list of conditions.

**[State](/patterns/behavioral/state)** replaces booleans that combine illegally (`is_jumping and is_dashing`) with one script per state under a `StateMachine` node. Each state gets `enter`, `exit`, `update` and `physics_update`; adding a state is one new child node.

**[Template Method](/patterns/behavioral/template-method)** is how `Node` itself works: the engine owns the loop and calls your `_ready`, `_process` and `_physics_process`. Apply it to a base `Enemy` whose `_physics_process` is fixed and whose `_choose_target()` and `_attack()` are hooks. When the hooks multiply, switch to composition.

**[Iterator](/patterns/behavioral/iterator)** puts a traversal (a spiral search outward from a cell, a lazy walk of the scene tree) behind `_iter_init`, `_iter_next` and `_iter_get`, so every consumer is a plain `for` loop with `break`. For a handful of children, `get_children()` and an Array are fine.

**[Mediator](/patterns/behavioral/mediator)** is the parent scene (`Arena`, `Level`) wiring its children together so siblings never reach for each other. Its cost is a hub that absorbs all the routing; keep it to routing and it stays readable.

**[Memento](/patterns/behavioral/memento)** snapshots state for checkpoints, undo, and saves. The Godot-specific discipline is deep copying: Arrays and Dictionaries need `duplicate(true)`, and Resources inside them need a `duplicate()` of their own.

**[Visitor](/patterns/behavioral/visitor)** adds operations (a stats summary, a validator, an exporter) across heterogeneous node types without editing them. GDScript has no method overloading, so double dispatch is spelled out by hand; a chain of `is` checks usually wins.

**[Interpreter](/patterns/behavioral/interpreter)** evaluates a tiny language — `has_item(key) and flag(met_king)` — through a tokenizer, a parser, and an AST of `RefCounted` nodes. Godot's built-in `Expression` class covers most of the same ground with no parser to maintain; the page compares them.
