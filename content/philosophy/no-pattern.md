---
title: The best pattern is often no pattern
nav_title: Often no pattern
description: The most over-engineered code is usually solving a problem it doesn't have yet. Reach for structure when the problem asks for it.
order: 3
---

# The best pattern is often no pattern

The most dangerous code is the code that solves problems you don't have yet. It reads as diligence, but it's debt dressed as foresight. Every abstraction layer is a concept the next reader must hold in their head. Every `@export` knob is a state your tests must cover and a value a designer can set wrong. Every speculative base class is a constraint your design must honour even as the real game turns out to be different.

So the strong default is *less*. Reach for a pattern when the problem is actively asking for one, not because the pattern is the "professional" choice. A direct function that's wrong is easy to fix. A clever, flexible component system that's wrong is hard even to diagnose, because the bug is in the wiring rather than in any one script.

## Essential vs accidental complexity

Some complexity belongs to the game itself. Physics that must feel right, a save format that has to load every version you ever shipped, netcode ordering, an inventory rule the designers keep changing — these stay hard even in spotless code. That's *essential* complexity, and your job is to keep it visible; no pattern can dissolve it.

The rest is *accidental*: scenes that can't run alone, an Autoload nobody remembers adding, a node path with `../../` in it, a name that means one thing in the player script and something else in the HUD. We add it ourselves, usually while trying to be clever. The work is to trim the accidental until the code says what it does without a guided tour — and never to mistake the essential kind for something structure can delete.

## YAGNI

The temporal version of this tenet has a name from Extreme Programming: *You Aren't Gonna Need It*. It's the discipline of not building a thing until it's actually required — and it's harder than it sounds, because speculative design *feels* like good engineering. The claim is narrow: not "keep it in mind," not "leave a hook for it." Don't build it. The code you didn't write has no bugs, no tests to carry, and constrains no future design.

```gdscript:title="res://enemies/spawn_options.gd"
# BAD — an options object added "for flexibility", used by exactly one
# caller, which always passes the same values.

class_name SpawnOptions extends RefCounted

var radius: float = 0.0
var face_player: bool = true
var group: StringName = &"enemies"
var use_pool: bool = false
var parent: Node = null
var max_alive: int = -1
```

```gdscript
# Every caller does this:
var options := SpawnOptions.new()
options.radius = 0.0
options.face_player = true
options.group = &"enemies"
options.use_pool = false
options.parent = self
options.max_alive = -1
spawner.spawn(GRUNT, point.position, options)
```

```gdscript:title="res://enemies/spawner.gd"
# GOOD — implement what callers actually use.
# Add options when a second caller needs different values.

class_name Spawner extends Node2D

func spawn(scene: PackedScene, at: Vector2) -> Node2D:
	var enemy := scene.instantiate() as Node2D
	enemy.position = at
	enemy.add_to_group(&"enemies")
	add_child(enemy)
	return enemy
```

YAGNI has a boundary, and naming it is the judgment. The decisions that are genuinely hard to reverse earn forethought even before you "need" them: the save file format (think versioning — you will load old saves forever), the shape of the data your custom Resources carry once designers have made a hundred `.tres` files from them, the multiplayer question (a single-player game does not become authoritative-server multiplayer by adding a node later), and performance you have *profiled* will hit a wall. Everything else: don't.

> **Smell:** You search for usages of a function and find exactly one caller: the test. A `Resource` with eight exports where every `.tres` in the project sets the same six. A base class with one subclass. An Autoload that exists so that a future system will have somewhere to live.

See also: [KISS](/philosophy/no-pattern#kiss), [DRY](/philosophy/wrong-abstraction#dry).

## KISS

Where YAGNI is about *when* you build, KISS is about *how much* you build once you've decided to. Keep it simple: the simplest solution that correctly solves the real problem is almost always the right one. The bias it fights is the pull toward clever, flexible, extensible designs when a direct one would do.

```gdscript:title="res://ui/text_processor.gd"
# BAD — a "flexible" solution to a problem that only has one case.

class_name TextProcessor extends RefCounted

func process(text: String) -> String:
	return text
```

```gdscript:title="res://ui/processor_chain.gd"
class_name ProcessorChain extends RefCounted

var _processors: Array[TextProcessor] = []

func add(processor: TextProcessor) -> ProcessorChain:
	_processors.append(processor)
	return self

func process(text: String) -> String:
	for processor: TextProcessor in _processors:
		text = processor.process(text)
	return text
```

```gdscript:title="res://ui/trim_processor.gd"
# To trim whitespace from the name the player typed.
class_name TrimProcessor extends TextProcessor

func process(text: String) -> String:
	return text.strip_edges()
```

```gdscript:title="res://ui/name_entry.gd"
# GOOD — the actual requirement is to trim whitespace from the name the player typed.

func sanitise_player_name(raw: String) -> String:
	return raw.strip_edges()
```

The chain exists in case there are ever more steps — a profanity filter, a length cap, a unicode normaliser. There aren't; when there are, add them, and a second line in `sanitise_player_name` will still be simpler than a chain. Simple is not the same as naive, though: the simplest version still has to handle the real edge cases — an empty name after trimming is a validation error, not an oversight. The only thing you're cutting is the machinery aimed at problems you don't have yet.

> **Smell:** You spend more time explaining *why* the code is shaped the way it is than what it does. A newcomer opens three scripts to understand a function that takes a `String`. The scene tree has more layers of `Node` than the game has moving parts.

See also: [YAGNI](/philosophy/no-pattern#yagni), [Separation of Concerns](/philosophy/keep-changes-local#separation-of-concerns).
