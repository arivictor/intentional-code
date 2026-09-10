---
title: "Service Locator"
description: "Put audio, save, and analytics services behind one Services lookup with an explicit registration step and null implementations, so a scene can swap or silence its infrastructure without editing call sites."
---

# Service Locator

**Buys swappable global services (audio, save, analytics) behind one lookup, with a null service for tests; pays in hidden dependencies — the same tax as an Autoload, slightly better disguised.**

A Service Locator is a single well-known object that hands out services by type: `Services.audio`, `Services.save`, `Services.analytics`. Callers ask the locator rather than holding a reference or naming a concrete Autoload. The point is not the lookup — an Autoload already gives you that — it is that the slot behind the lookup is *assignable*. At startup you register the real `SteamAnalytics`; in a test you register `NullAnalytics`; on a platform with no achievements you register nothing and the null default swallows the calls.

In Godot this usually means one Autoload named `Services` whose properties are typed to an abstract base and whose defaults are null implementations. That is deliberately one Autoload, not one per service, and it is the difference between "every script depends on `AudioManager`" and "every script depends on the *idea* of an audio service". The guarantee is that nobody outside the registration step names a concrete implementation.

## Scenario

A game has grown four Autoloads: `AudioManager`, `SaveManager`, `Analytics`, `Achievements`. Gameplay scripts call them directly:

```gdscript:title="res://weapons/sword.gd"
extends Node2D

func _on_hitbox_body_entered(body: Node2D) -> void:
	if body is Enemy:
		body.take_damage(damage)
		AudioManager.play(&"sword_hit", global_position)
		Analytics.track(&"enemy_hit", {"weapon": "sword"})
		if body.is_dead():
			Achievements.progress(&"slayer", 1)
```

Then the problems arrive together. The team writes GUT tests for `Sword`; every test plays a real sound, fires a real analytics event at the real backend, and writes achievement progress to `user://`. A console port needs a different achievements API and the only option is `if OS.get_name() == ...` inside `Achievements`. A demo build must ship with analytics off and the least bad option is a boolean inside `Analytics.track` that every call pays for. And a designer opening `sword.tscn` alone finds it errors on `_ready` because the Autoloads exist but their `_ready` order is not what the scene assumed.

> **Smell:** A test suite that needs `OS.get_name()` checks, a "disable in tests" flag, or a special test-only Autoload to keep the real infrastructure quiet.

## Solution

Define each service as an abstract base class, give it a null implementation, and register the real one in exactly one place.

```
Startup (main.gd _ready)                  Test (GUT before_each)
  Services.audio = AudioPlayerService       Services.audio = NullAudio
  Services.save = FileSaveService           Services.save = MemorySave
  Services.analytics = SteamAnalytics       Services.analytics = NullAnalytics
              │                                        │
              └──────────► Services (Autoload) ◄───────┘
                                  │
        sword.gd ── Services.audio.play(&"sword_hit") ── (whichever is registered)
```

The base classes are the contract. Audio needs the scene tree to play anything, so its base extends `Node`; analytics and save do not, so they extend `RefCounted`:

```gdscript:title="res://services/audio_service.gd"
class_name AudioService extends Node

func play(sound: StringName, at: Vector2 = Vector2.ZERO) -> void:
	pass

func set_bus_volume(bus: StringName, linear: float) -> void:
	pass
```

```gdscript:title="res://services/analytics_service.gd"
class_name AnalyticsService extends RefCounted

func track(event: StringName, props: Dictionary = {}) -> void:
	pass
```

The null implementations are the base classes themselves: methods that do nothing. For tests, a recording variant is more useful than pure silence:

```gdscript:title="res://services/null_audio.gd"
class_name NullAudio extends AudioService

var played: Array[StringName] = []

func play(sound: StringName, _at: Vector2 = Vector2.ZERO) -> void:
	played.append(sound)
```

The locator is one Autoload with typed slots that default to the null versions, plus a registration method that refuses to be called twice by accident:

```gdscript:title="res://autoload/services.gd"
extends Node

var audio: AudioService = NullAudio.new()
var save: SaveService = MemorySave.new()
var analytics: AnalyticsService = AnalyticsService.new()

func register_audio(service: AudioService) -> void:
	_replace(audio, service)
	audio = service

func register_save(service: SaveService) -> void:
	save = service

func register_analytics(service: AnalyticsService) -> void:
	analytics = service

## Node-based services need to live in the tree; RefCounted ones do not.
func _replace(old: AudioService, new: AudioService) -> void:
	if old.is_inside_tree():
		remove_child(old)
		old.queue_free()
	if not new.is_inside_tree():
		add_child(new)
```

Registration happens once, where the game boots. This is the only script in the project that names a concrete service:

```gdscript:title="res://game/main.gd"
extends Node

func _ready() -> void:
	Services.register_audio(AudioPlayerService.new())
	Services.register_save(FileSaveService.new("user://save.json"))
	match OS.get_name():
		"Windows", "Linux", "macOS":
			Services.register_analytics(SteamAnalytics.new())
		_:
			pass   # null analytics stays registered
```

And the sword no longer knows what it is talking to:

```gdscript:title="res://weapons/sword.gd"
extends Node2D

func _on_hitbox_body_entered(body: Node2D) -> void:
	if body is Enemy:
		body.take_damage(damage)
		Services.audio.play(&"sword_hit", global_position)
		Services.analytics.track(&"enemy_hit", {"weapon": "sword"})
```

### Testing with a null service

Because the slot is assignable, a test swaps it and reads back what happened:

```gdscript:title="res://test/unit/test_sword.gd"
extends GutTest

var _audio: NullAudio

func before_each() -> void:
	_audio = NullAudio.new()
	Services.register_audio(_audio)

func test_hit_plays_sword_sound() -> void:
	var sword: Sword = preload("res://weapons/sword.tscn").instantiate()
	add_child_autofree(sword)
	var enemy := double(Enemy).new()
	sword._on_hitbox_body_entered(enemy)
	assert_eq(_audio.played, [&"sword_hit"])
```

No sound plays, nothing is written to disk, nothing leaves the machine. The test is fast and repeatable, and it did not need a "test mode" inside the audio system.

### Failing loudly on a missing service

Null defaults are convenient and they hide mistakes: forget to register audio in a new entry scene and the game is silent with no error. Decide per service whether silence is acceptable. For ones where it is not, make the default a *guard* rather than a null:

```gdscript:title="res://autoload/services.gd"
var save: SaveService:
	get:
		assert(_save != null, "No SaveService registered — call Services.register_save() at startup")
		return _save
var _save: SaveService
```

Analytics can default to null forever. Save probably should not.

## Locator, Autoload, or a passed reference?

Three ways to reach a service, and the choice is the whole decision:

- **A concrete Autoload** (`AudioManager.play(...)`) is the simplest. It is also a hard dependency on one implementation, and the only way to silence it is to edit it.
- **A Service Locator** (`Services.audio.play(...)`) keeps the global reach but makes the implementation a runtime choice. Same hidden dependency, now swappable.
- **A passed reference** (`@export var audio: AudioService`, or a `setup(audio)` call) makes the dependency visible in the scene's interface. It is the most honest and the most wiring.

The rule that has held up: pass references for anything gameplay-shaped — a weapon's owner, a level's context, an enemy's target — and use the locator only for cross-cutting infrastructure that genuinely every scene may touch: audio, save, analytics, localisation, platform services. If you find yourself registering a `Services.player`, stop; that is a reference someone should have passed down.

## When to Use

- Several unrelated scenes need the same infrastructure service and threading a reference through every `setup` call is noise.
- You need to swap an implementation per platform, per build (demo, retail), or per test.
- Tests must run without side effects: no sounds, no disk writes, no network.
- You have more than one Autoload already and each is a concrete class nobody can replace.

## When Not to Use

- There is one implementation and there will only ever be one. A plain Autoload is the same thing with less ceremony.
- The dependency is gameplay state rather than infrastructure. Pass it.
- The scene is meant to be reusable across projects; a locator ties it to your project's `Services` shape. Give it `@export`s instead.
- A single caller needs the service. Give that caller a reference and skip the global.

## The Decision

The honest trade: a Service Locator does not remove the global; it makes the global replaceable. Every script that calls `Services.audio` still has a dependency you cannot see from its `@export`s or its `setup` signature. Open a scene alone and it may run fine — the null audio swallows the calls — which is better than an error and worse than knowing. The gain is that the *implementation* is no longer a compile-time fact, and that gain is what makes the sword testable and the analytics switchable. Whether it is worth it depends entirely on whether you swap. If you never will, you have paid for a slot you never assign.

The Godot-specific gotchas are about the tree. Node-based services must be added somewhere; the locator is a reasonable parent, but then `queue_free` on replacement, not `free`, and remember that the old service's in-flight `AudioStreamPlayer`s die with it. `_ready` order between Autoloads is the order in Project Settings, so registration should happen in the main scene's `_ready`, after every Autoload exists, never inside another Autoload. And with typed slots, GDScript's static typing does real work here: assigning something that is not an `AudioService` fails at parse time, and the call sites get autocompletion — reasons to type the slots rather than store them in a `Dictionary[StringName, Object]`.

This is [tenet #7 — hard to test is the design talking](/philosophy/listen-to-the-tests) in a specific form: when the test suite needs the real audio system silenced, the design is telling you the audio system was reached for, not given.

## Related Patterns

- **[Singleton (Autoload)](/patterns/creational/singleton)**: What a locator is built from and what it improves on. Read it for the full hidden-dependency argument; a locator inherits every point except "cannot be replaced".
- **[Adapter](/patterns/structural/adapter)**: The real services behind the slots are usually adapters — `SteamAnalytics` wraps an SDK behind the `AnalyticsService` contract.
- **[Hexagonal](/patterns/architectural/hexagonal)**: Services are ports; registered implementations are adapters. Hexagonal passes them in explicitly; the locator lets them be looked up. Same idea, different visibility.
- **[Repository](/patterns/architectural/repository)**: `Services.save` is a Repository behind a locator slot. The Repository page covers what the save contract should look like.
- **[Strategy](/patterns/behavioral/strategy)**: Swapping a service is Strategy at application scale. Prefer Strategy — a Resource or Callable handed to one node — when only one node needs the swap.
- **[Facade](/patterns/structural/facade)**: A service that grows into a workflow (`Services.audio.play_level_intro()`) is becoming a Facade; keep services as primitives and put sequences elsewhere.
- **[Feature Modules](/patterns/architectural/feature-modules)**: The locator is the sanctioned way for a feature module to reach shared infrastructure without importing another module.
