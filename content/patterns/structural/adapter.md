---
title: "Adapter"
description: "Wrap a platform SDK or third-party addon behind a class you own so game code never imports the vendor API, with a null version for the editor and tests."
---

# Adapter

**Buys one-place translation isolating a platform SDK or third-party addon from your game code; pays in indirection and silent information loss when a rich API is flattened.**

An Adapter converts the interface of something you cannot change into the interface your code wants. In Godot the "something you cannot change" is usually a platform SDK or an addon under `res://addons/`: Steamworks, a mobile ads plugin, a console achievements API, an analytics service. Each arrives with its own naming, its own quirks about call order, and its own idea of what an id looks like. The Adapter is a small class you own that speaks your vocabulary on one side and the vendor's on the other, so the translation exists in exactly one script.

The pattern earns a second benefit in game projects that the textbook version rarely mentions: once game code depends on your class rather than the vendor's singleton, you can substitute a `Null` version that does nothing. The editor runs without the platform. GUT or gdUnit4 runs without the platform. An itch.io build ships without the platform. That substitution is the reason to wrap, even when there is only one vendor today.

## Scenario

You are shipping on Steam first, using a Steamworks addon that registers a `SteamAPI` singleton. Unlocking an achievement is two calls, and they are sprinkled wherever an achievement happens:

```gdscript:title="res://bosses/forest_guardian.gd"
func _on_died() -> void:
	SteamAPI.set_achievement("ACH_FOREST_GUARDIAN")
	SteamAPI.store_stats()
	_drop_loot()
```

```gdscript:title="res://quests/quest_tracker.gd"
func _on_quest_completed(quest: QuestData) -> void:
	if quest.id == &"tutorial" and SteamAPI.is_steam_running():
		SteamAPI.set_achievement("ACH_TUTORIAL")
		SteamAPI.store_stats()
```

Three months later the publisher wants a console port and a mobile build. Every one of those call sites needs a branch per platform. Running a boss scene in the editor with no Steam client prints a wall of errors, or crashes, depending on the addon's mood. The rule that `store_stats()` must follow `set_achievement()` is copied by hand into a dozen scripts and forgotten in two of them. And the vendor's ids — `"ACH_FOREST_GUARDIAN"` — are strings scattered through gameplay code, so renaming one on the partner site is a project-wide search.

> **Smell:** `grep -r SteamAPI res://` returns files outside `res://platform/`.

## Solution

Define the contract your game wants, in your terms. Write one adapter per vendor, one null adapter for everything else, and choose between them in one place at startup.

```
                 ┌────────────────────────────────┐
  game code ────►│ AchievementService (RefCounted)│
  (bosses,       │ unlock(id: StringName)         │
   quests, HUD)  │ is_unlocked(id) -> bool        │
                 └───────────────┬────────────────┘
                                 │ extends
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
┌─────────▼─────────┐  ┌─────────▼─────────┐  ┌─────────▼─────────┐
│ SteamAchievements │  │ LocalAchievements │  │ NullAchievements  │
│ wraps SteamAPI    │  │ ConfigFile under  │  │ records calls,    │
│ (addon singleton) │  │ user://           │  │ does nothing else │
└───────────────────┘  └───────────────────┘  └───────────────────┘
```

The base class is the target interface. GDScript has no interface keyword, so a base class with default bodies does the job; a subclass that forgets a method gets the default rather than a compile error, which is one of the costs.

```gdscript:title="res://platform/achievement_service.gd"
class_name AchievementService extends RefCounted
## The contract game code sees. Ids are ours, not the vendor's.

signal unlocked(id: StringName)

func unlock(_id: StringName) -> void:
	push_error("unlock() not implemented on %s" % get_script().get_global_name())

func is_unlocked(_id: StringName) -> bool:
	return false
```

The Steam adapter holds the id mapping and the call-order rule. Both now live in one script.

```gdscript:title="res://platform/steam_achievements.gd"
class_name SteamAchievements extends AchievementService
## Adapter over the Steamworks addon. Nothing outside res://platform/ touches SteamAPI.

const VENDOR_IDS: Dictionary[StringName, String] = {
	&"tutorial": "ACH_TUTORIAL",
	&"forest_guardian": "ACH_FOREST_GUARDIAN",
	&"no_damage_run": "ACH_NO_DAMAGE",
}

func unlock(id: StringName) -> void:
	if not VENDOR_IDS.has(id):
		push_warning("No Steam achievement mapped for %s" % id)
		return
	if is_unlocked(id):
		return
	SteamAPI.set_achievement(VENDOR_IDS[id])
	SteamAPI.store_stats()  # the addon needs this after every set; one place remembers
	unlocked.emit(id)

func is_unlocked(id: StringName) -> bool:
	if not VENDOR_IDS.has(id):
		return false
	return SteamAPI.get_achievement(VENDOR_IDS[id])
```

The null adapter is the one you will use most often, because it is what runs every time you press F6 on a scene.

```gdscript:title="res://platform/null_achievements.gd"
class_name NullAchievements extends AchievementService
## Stands in when no platform service exists: the editor, tests, a DRM-free build.
## Remembers what was asked of it so tests can assert on it.

var calls: Array[StringName] = []
var _unlocked: Dictionary[StringName, bool] = {}

func unlock(id: StringName) -> void:
	calls.append(id)
	_unlocked[id] = true
	unlocked.emit(id)

func is_unlocked(id: StringName) -> bool:
	return _unlocked.get(id, false)
```

One Autoload decides which adapter the game gets. This is the only script that knows what platform it is running on; `OS.has_feature` reads the custom feature tags you set per export preset.

```gdscript:title="res://autoload/platform.gd"
extends Node
## Autoload "Platform". The composition root for platform services.

var achievements: AchievementService

func _ready() -> void:
	if OS.has_feature("steam") and SteamAPI.is_steam_running():
		achievements = SteamAchievements.new()
	else:
		achievements = NullAchievements.new()
	print("Achievements via ", achievements.get_script().get_global_name())
```

Game code now speaks in its own ids and never mentions a vendor:

```gdscript:title="res://bosses/forest_guardian.gd"
func _on_died() -> void:
	Platform.achievements.unlock(&"forest_guardian")
	_drop_loot()
```

Reaching for the Autoload directly is fine at the edges, but anything with logic worth testing should take the service as a constructor argument, so a test can hand it a `NullAchievements` and read `calls` back:

```gdscript:title="res://test/unit/test_quest_tracker.gd"
extends GutTest

func test_finishing_the_tutorial_unlocks_the_achievement() -> void:
	var achievements := NullAchievements.new()
	var tracker := QuestTracker.new(achievements)
	tracker.complete(&"tutorial")
	assert_eq(achievements.calls, [&"tutorial"])
```

No scene tree, no Steam client, no export preset. The test runs in milliseconds because `QuestTracker` and both adapters are `RefCounted`.

### What the adapter throws away

Steamworks can report incremental progress on an achievement and show an overlay notification with a percentage. `AchievementService.unlock()` cannot express that. This is the information loss in the one-liner, and it is a decision, not an accident: the adapter's interface is the lowest common denominator of every platform you intend to support. When a designer asks for progress bars, add `set_progress(id, current, total)` to the base class with a no-op default, implement it on the adapters that can, and let the rest ignore it. What you must not do is let gameplay code reach around the adapter for the one feature it lacks, because that first reach-around is where the next platform port starts hurting.

## When to Use

- Game code would otherwise call a vendor singleton (Steam, an ads SDK, a console API, analytics) directly.
- You need to run scenes in the editor or under GUT/gdUnit4 without the platform present.
- Two subsystems of your own were written with different vocabularies (an old save format and a new inventory) and you want the translation in one file.
- You expect to swap or add a vendor: a second store, a second analytics provider.

## When Not to Use

- You own both sides. Change the interface to match instead of wrapping.
- The mismatch is one method name. A wrapper that only renames is indirection with no translation.
- You are wrapping for a port that may never happen. Wrap when the second platform is scheduled, not when it is imagined.

## The Decision

What you buy is a single script to open when the vendor changes their API, renames an id, or adds a mandatory initialisation call. What you pay is one more hop when tracing a call, and an interface that is deliberately smaller than the thing it wraps. GDScript adds a specific gotcha here: a base class with default method bodies does not force subclasses to implement anything, so a new adapter that forgets `is_unlocked()` silently returns `false` forever. From 4.5 `@abstract` lets the engine refuse to instantiate an incomplete adapter; before that, a `push_error` in the base body is the best warning you get.

The other decision is where the adapter lives. A `RefCounted` adapter held by one Autoload is the right default: it has no scene-tree dependency, it can be constructed in a test, and the Autoload is the only place that reads the platform. The tempting alternative — registering the adapter itself as an Autoload named `Achievements` — works until you want two of them (a real one and a recording one in the same test run), which is exactly when you find out how many scripts reach for the global name.

Wrapping an API you do not own is [an abstraction borrowed against the future](/philosophy/borrowed-abstraction): worth it to quarantine a vendor, wasteful when you wrap a class you already own.

## Related Patterns

- **[Facade](/patterns/structural/facade)**: Facade simplifies a whole subsystem into one workflow; Adapter makes one specific vendor speak one specific contract. If the problem is "too many calls in sequence", Facade; if it is "the wrong vocabulary", Adapter.
- **[Proxy](/patterns/structural/proxy)**: Proxy keeps the same interface and controls access; Adapter changes the interface. A `NullAchievements` is an Adapter with nothing behind it, not a Proxy.
- **[Decorator](/patterns/structural/decorator)**: Decorator preserves the interface and adds behaviour. If your wrapper changes the API, it is an Adapter; if it enriches the same API, it is a Decorator.
- **[Bridge](/patterns/structural/bridge)**: Bridge designs two independent axes up front; Adapter is a retrofit over something that already exists and was never designed to fit.
- **[Service Locator](/patterns/architectural/service-locator)**: The `Platform` Autoload above is a small Service Locator. Adapter is what it hands out; the locator is how callers find it.
- **[Hexagonal](/patterns/architectural/hexagonal)**: Hexagonal is Adapter applied at every edge of the game — input, storage, platform — with the same null-implementation trick for tests.
