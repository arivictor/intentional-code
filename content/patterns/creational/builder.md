---
title: "Builder"
description: "Assemble complex objects like encounters and levels through fluent methods with defaults, and validate the whole configuration in one place at build()."
---

# Builder

**Buys defaults plus override-any-subset construction for complex objects like tweens, levels, and encounters; pays one method per option and validation that only fails at runtime.**

Builder separates *what you want* from *assembling it*. The caller names the handful of options that matter, the builder supplies defaults for the rest, and a final `build()` turns the accumulated configuration into the real object. You already use one: `create_tween()` returns a builder, each `tween_property` call adds a step, `set_trans` and `set_ease` refine it, and the finished animation runs at the end of the frame without an explicit build call.

GDScript has default parameter values but no named arguments, which is why the pattern matters here. A function with seven optional parameters forces callers to spell out the first six to change the seventh. A builder makes every option addressable by name, at the cost of one method per option and the knowledge that a bad combination is only caught when `build()` runs.

## Scenario

Encounters are generated at runtime for a roguelike floor. An encounter has enemies, spawn points, a delay between waves, an optional reward, a boss flag, a music track, and an ambush flag. The first version is a static constructor.

```gdscript:title="res://encounters/encounter.gd"
class_name Encounter extends Resource

static func create(
	enemy_ids: Array[String],
	spawn_points: Array[Vector2],
	wave_delay: float = 2.0,
	reward: ItemData = null,
	is_boss: bool = false,
	music: String = "res://audio/music/combat.ogg",
	ambush: bool = false,
) -> Encounter:
	# ...
	return null
```

```gdscript:title="res://levels/floor_generator.gd"
# Which false is which? To set ambush you must also spell out
# wave_delay, reward, is_boss and music.
var e := Encounter.create(["grunt", "grunt"], points, 2.0, null, false, "res://audio/music/combat.ogg", true)
```

Every call site restates defaults it doesn't care about, so changing the default music means editing every call. Adding a parameter shifts every positional argument after it. And the rules — an encounter needs at least one enemy, a boss can't be an ambush, spawn points must cover the enemies — live nowhere, because a constructor with seven parameters is already too long to hold them.

> **Smell:** Calls that pass `null, false, "", false` to reach the argument they actually want to set.

## Solution

`Encounter` stays a Resource, because a designer-authored encounter can then be a `.tres` edited in the inspector — the inspector is itself "defaults plus override any subset". The builder is the code-side equivalent for procedural generation, and it's where the rules live.

```
EncounterBuilder.new()
	.add_enemy("grunt", 3)     ┐
	.spawn_points(points)      │  each call mutates the draft and returns self
	.wave_delay(1.0)           ┘
	.build()  ──► validate() ──► errors?  ──► push_error, return null
                                └── none ──► Encounter (a copy of the draft)
```

```gdscript:title="res://encounters/encounter.gd"
class_name Encounter extends Resource

@export var enemy_ids: Array[String] = []
@export var spawn_points: Array[Vector2] = []
@export var wave_delay: float = 2.0
@export var reward: ItemData
@export var is_boss: bool = false
@export var music: String = "res://audio/music/combat.ogg"
@export var ambush: bool = false

func _to_string() -> String:
	return "Encounter(%d enemies, delay=%.1f, boss=%s, ambush=%s)" % [
		enemy_ids.size(), wave_delay, is_boss, ambush,
	]
```

```gdscript:title="res://encounters/encounter_builder.gd"
class_name EncounterBuilder extends RefCounted

var _draft := Encounter.new()

func add_enemy(id: String, count: int = 1) -> EncounterBuilder:
	for i in count:
		_draft.enemy_ids.append(id)
	return self

func spawn_points(points: Array[Vector2]) -> EncounterBuilder:
	_draft.spawn_points = points.duplicate()
	return self

func wave_delay(seconds: float) -> EncounterBuilder:
	_draft.wave_delay = seconds
	return self

func reward(item: ItemData) -> EncounterBuilder:
	_draft.reward = item
	return self

func boss(music_path: String) -> EncounterBuilder:
	_draft.is_boss = true
	_draft.music = music_path
	return self

func ambush() -> EncounterBuilder:
	_draft.ambush = true
	return self

func validate() -> PackedStringArray:
	var errors := PackedStringArray()
	if _draft.enemy_ids.is_empty():
		errors.append("an encounter needs at least one enemy")
	if _draft.spawn_points.size() < _draft.enemy_ids.size():
		errors.append("%d enemies but only %d spawn points" % [
			_draft.enemy_ids.size(), _draft.spawn_points.size(),
		])
	if _draft.wave_delay < 0.0:
		errors.append("wave_delay must not be negative")
	if _draft.is_boss and _draft.ambush:
		errors.append("boss encounters cannot be ambushes")
	return errors

func build() -> Encounter:
	var errors := validate()
	if not errors.is_empty():
		push_error("EncounterBuilder: " + ", ".join(errors))
		return null
	return _draft.duplicate(true)   # the builder stays usable as a preset
```

Every option method ends in `return self`, which is what makes the chain work. `build()` returns a deep copy of the draft rather than the draft itself, so a builder configured once can stamp out several encounters that share most settings — call `build()`, tweak, call it again.

```gdscript:title="res://levels/floor_generator.gd"
extends Node

func _ready() -> void:
	var points: Array[Vector2] = [
		Vector2(100, 0), Vector2(200, 0), Vector2(300, 0), Vector2(400, 0),
	]

	var skirmish := EncounterBuilder.new() \
		.add_enemy("grunt", 3) \
		.spawn_points(points) \
		.build()
	print(skirmish)

	var boss_fight := EncounterBuilder.new() \
		.add_enemy("warden") \
		.spawn_points(points) \
		.wave_delay(0.0) \
		.boss("res://audio/music/warden.ogg") \
		.build()
	print(boss_fight)

	var broken := EncounterBuilder.new() \
		.add_enemy("grunt", 6) \
		.spawn_points(points) \
		.ambush() \
		.boss("res://audio/music/warden.ogg") \
		.build()
	print(broken)
```

```text
Encounter(3 enemies, delay=2.0, boss=false, ambush=false)
Encounter(1 enemies, delay=0.0, boss=true, ambush=false)
EncounterBuilder: 6 enemies but only 4 spawn points, boss encounters cannot be ambushes
<null>
```

The third call is the important one. Nothing about the chain looked wrong when it was written, and nothing in the parser could have said otherwise. `build()` is the first moment the whole configuration exists to be checked, so it's the only place the rules can live — and a floor generator that runs at level load gets the error at level load, which is the best a runtime check can offer. Because `validate()` is a pure function on a `RefCounted`, a gdUnit4 test can drive every rule without a scene tree.

## The builder you already use

Tween is Godot's own builder, and comparing it to the one above shows what the fluent shape gives up.

```gdscript:title="res://ui/toast.gd"
extends Control

func show_toast() -> void:
	var tw := create_tween()
	tw.tween_property(self, "scale", Vector2.ONE, 0.3) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_interval(2.0)
	tw.tween_property(self, "modulate:a", 0.0, 0.2)
	tw.tween_callback(queue_free)
```

Each `tween_*` call appends a step. `set_trans` and `set_ease` on the returned tweener refine that step; the same methods on `tw` set the default for every later step. `set_parallel` and `set_loops` configure the whole. There is no `build()` — the tween starts on the next frame — and that is the difference. Tween has no `validate()` because the object is already live: a misspelt property name is reported when that step *runs*, two seconds into the animation, and a tween you created and never added steps to logs an error on the next frame rather than at the call. That's "validation only fails at runtime" in its purest form, and it's fine for a tween because the failure is immediate and harmless. For an encounter that fails on floor seven, an explicit `build()` with a `validate()` in front of it is worth the extra method.

### Common mistake: the missing `return self`

Forget the return in one option method and the chain breaks with `Invalid call. Nonexistent function 'wave_delay' in base 'Nil'` — pointing at the *next* call, not the one at fault. Type every option method `-> EncounterBuilder`; the parser then refuses a method that can fall off the end without returning.

## When to Use

- An object has more than three or four optional parameters and callers set different subsets of them.
- The valid combinations have rules that a constructor can't express and the inspector can't enforce.
- Construction happens at runtime from procedural or network data, where a `.tres` in the inspector isn't an option.
- You want a preset — one builder, several similar products.

## When Not to Use

- The object has two or three fields. `Encounter.new()` and property assignment is shorter and just as clear.
- Designers author the object by hand. `@export`s on a Resource already give defaults and override-any-subset, with the editor doing the validation you'd otherwise write.
- The options are truly independent with no rules between them. A `Dictionary` of overrides applied in a loop is a builder with one method instead of twelve.

## The Decision

The builder costs one method per option, and that is a real cost: an encounter with twenty options is twenty small functions, each one `return self` away from a confusing error. In exchange the call site reads as a list of decisions, defaults live in one place, and adding an option breaks no existing caller. The other cost is subtler: validation moves to `build()`, which is later than a constructor and much later than the parser. If the builder runs at level load, that's early enough. If it runs in response to a player action, the first sign of an impossible combination is a `push_error` mid-game.

The Godot-specific choice is builder versus inspector. A Resource with `@export`s is a builder whose `build()` is "press save" and whose validation is whatever the editor's type system gives you, which is most of what you need for authored content. Write a builder for the content that has to be assembled by code, keep the same Resource as its output, and you get both — the same `Encounter` class serves a hand-made `.tres` and a procedural floor.

This is [build the simplest thing](/philosophy/build-the-simplest-thing) applied to construction: the fluent API isn't the goal, the readable call site is, and if a constructor with two arguments gives you that, stop there.

## Related Patterns

- **[Factory Method](/patterns/creational/factory-method)**: chooses *which* thing to make; a factory often returns a partly configured builder for the caller to finish.
- **[Abstract Factory](/patterns/creational/abstract-factory)**: produces a consistent set of simple products; Builder produces one complicated one.
- **[Prototype](/patterns/creational/prototype)**: `build()` above returns `duplicate(true)` of the draft — the preset behaviour is Prototype inside Builder.
- **[Data-Driven Design](/patterns/architectural/data-driven)**: for authored content the inspector is the builder; keep the same Resource class as the output of both.
