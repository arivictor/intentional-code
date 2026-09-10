---
title: "Facade"
description: "Give the menu, the level exit, and the debug console one call — GameFlow.start_level() — that runs the audio, save, scene, and HUD sequence the same way every time."
---

# Facade

**Buys one entry point so a sequence change (start a level, open a shop) propagates everywhere at once; pays by becoming a god-autoload magnet unless kept to a single workflow.**

A Facade is one method over several subsystems. The subsystems keep their own APIs and stay independently usable; the facade owns the *sequence* in which a particular job calls them. In a game that job is almost always a transition — start a level, return to the menu, open the shop, die and respawn — and the subsystems are the usual suspects: audio, save data, scene loading, the HUD. Each of those is simple on its own. The bug-prone part is the order and the awaits between them, and that part is what the facade takes custody of.

The guarantee is that there is one copy of the sequence. When the designer decides the HUD should fade in after the music starts rather than before, the change is one edit and every caller gets it.

## Scenario

Starting a level touches four systems. The main menu does it like this:

```gdscript:title="res://ui/main_menu.gd"
func _on_new_game_pressed() -> void:
	AudioDirector.fade_out_music(0.5)
	await get_tree().create_timer(0.5).timeout
	SaveRepository.new_slot(1)
	Hud.reset()
	get_tree().change_scene_to_file("res://levels/forest.tscn")
	AudioDirector.play_music(&"forest")
```

The level exit does it like this:

```gdscript:title="res://levels/level_exit.gd"
func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		SaveRepository.record_progress(next_level)
		AudioDirector.fade_out_music(0.5)
		get_tree().change_scene_to_file(next_level)
```

The checkpoint respawn has a third version, the debug console's `warp` command a fourth. The exit forgot the HUD reset, so the new level shows the previous level's boss bar for a frame. It also did not wait for the fade, so two tracks overlap. The menu version waits on a timer that happens to match the fade duration until someone changes the fade to 0.8. Each copy is slightly wrong in its own way, and a fix to one is a fix to one.

> **Smell:** The same four Autoloads, called in roughly the same order, in more than two scripts.

## Solution

One `GameFlow` owns the sequence. Callers say *what* they want; the facade knows *how*.

```
MainMenu ─────┐
LevelExit ────┤        ┌────────────────────────────┐
Checkpoint ───┼───────►│ GameFlow.start_level(id)   │
DebugConsole ─┘        └─────────────┬──────────────┘
                                     │ one fixed sequence
          ┌───────────────┬──────────┼──────────┬──────────────┐
          ▼               ▼          ▼          ▼              ▼
   AudioDirector   SaveRepository  SceneLoader  Hud     LevelCatalogue
```

Rather than four Autoloads plus a fifth to coordinate them, make the facade the one Autoload and give it the subsystems as children. It is a scene, `res://autoload/game_flow.tscn`, registered under the name `GameFlow`:

```
GameFlow (Node)                ← Autoload, script below
├── AudioDirector (Node)
├── SceneLoader (Node)
├── SaveRepository (Node)
└── Hud (CanvasLayer)
```

```gdscript:title="res://autoload/game_flow.gd"
extends Node
## Autoload "GameFlow". One workflow: get the player into a level cleanly.

signal level_started(id: StringName)

const FADE_TIME := 0.4
const CATALOGUE := preload("res://levels/level_catalogue.tres")

@onready var _audio: AudioDirector = $AudioDirector
@onready var _scenes: SceneLoader = $SceneLoader
@onready var _saves: SaveRepository = $SaveRepository
@onready var _hud: Hud = $Hud

var _busy := false

func start_level(id: StringName) -> void:
	if _busy:
		push_warning("start_level(%s) ignored: a transition is running" % id)
		return
	_busy = true

	var entry: LevelEntry = CATALOGUE.get_entry(id)
	_hud.hide()
	await _audio.fade_out_music(FADE_TIME)
	await _scenes.change_to(entry.scene_path)
	_saves.record_level(id)
	_hud.reset()
	_hud.show()
	_audio.play_music(entry.music)

	_busy = false
	level_started.emit(id)
```

Every `await` is in one place, so the ordering questions — does the save happen before or after the scene exists? — have one answer. The `_busy` flag stops a double-tap on the Play button from running two transitions at once, a guard that none of the four scattered copies had.

The subsystems stay plain. `SceneLoader` is the only one worth showing, because it hides the threaded-load dance that every caller used to skip:

```gdscript:title="res://systems/scene_loader.gd"
class_name SceneLoader extends Node

func change_to(path: String) -> void:
	ResourceLoader.load_threaded_request(path)
	var progress: Array = []
	while ResourceLoader.load_threaded_get_status(path, progress) == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
		await get_tree().process_frame
	var scene: PackedScene = ResourceLoader.load_threaded_get(path)
	get_tree().change_scene_to_packed(scene)
	await get_tree().process_frame  # the new scene is current after this frame
```

Callers shrink to one line and stop knowing that audio exists:

```gdscript:title="res://levels/level_exit.gd"
@export var next_level: StringName

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		GameFlow.start_level(next_level)
```

Anything that needs to know the level is ready — an intro cutscene, an analytics ping — connects to `level_started` rather than being added to the sequence. Signal up, not call down into more subsystems.

### Keep it to one workflow

The month after `start_level` lands, someone will add `open_shop()` to `GameFlow`, because it also touches audio and the HUD. Then `show_death_screen()`, then `pause()`. Each is reasonable. Together they turn the facade into the object every script depends on and nobody can change. The rule that keeps it honest: one facade, one verb phrase. `open_shop()` pauses the world, swaps HUD layers, and plays a jingle — that is a different sequence over overlapping subsystems, and it belongs in a `ShopFlow` with its own small surface.

Two signs the line has been crossed. The facade has more *state* than *sequence* — it is tracking the current level, the player's gold, and the shop's inventory instead of running a transition. Or callers use it to *reach* things: `GameFlow._audio.play_sfx(&"click")`. The moment a facade is a path to its subsystems rather than a sequence over them, it has become a [Service Locator](/patterns/architectural/service-locator) with worse manners.

## When to Use

- The same three-plus subsystem calls, in the same order with awaits between them, appear in more than one script.
- A transition has ordering bugs (overlapping music, stale HUD, save before scene) that keep coming back in different places.
- You want one signal — `level_started` — that everything downstream can trust, instead of each caller emitting its own.
- You are wrapping a legacy sequence you cannot yet untangle behind a call you can.

## When Not to Use

- The subsystem is one call. `GameFlow.play_music(id)` over `AudioDirector.play_music(id)` is indirection.
- Callers genuinely need different sequences. A facade with six optional parameters is the scattered copies again, folded into one function.
- Callers need to see and control the steps — a loading screen that shows per-stage progress wants the pieces, not the whole.

## The Decision

You buy a single edit point for a sequence and a guard against two transitions at once. You pay in a dependency that every scene now has, which is the tax any Autoload charges: the level exit scene cannot run alone without a `GameFlow` present. The cheapest defence is to keep the facade's surface tiny, so that a stub with one method satisfies it in a test scene.

Testability is honestly limited here, and that is fine. A facade is orchestration; the interesting logic lives in the subsystems — `SaveRepository`, `LevelCatalogue` — which are `RefCounted` or `Resource` classes and test cleanly under GUT without a tree. Test those. For the facade itself, an integration test that starts a level and asserts `level_started` fired once is about the right depth. If you find yourself wanting to unit-test `start_level` in isolation, make the subsystems `@export` node references so a test scene can swap in fakes, and stop there.

The gotcha that bites most often: the facade is a coroutine. `start_level` contains awaits, so a caller that does `GameFlow.start_level(id); do_something()` runs `do_something()` before the level exists. Callers that care must `await GameFlow.start_level(id)` or connect to `level_started`. The `_busy` flag also means a second call during a transition is dropped, not queued; if queuing is what you need, that is the [Event Queue](/patterns/architectural/event-queue) and it should be its own decision.

This is [keeping changes local](/philosophy/keep-changes-local) at the level of a workflow: the sequence changes in one file, and the callers do not know it changed.

## Related Patterns

- **[Adapter](/patterns/structural/adapter)**: Adapter translates one vendor into one contract; Facade coordinates several of your own subsystems behind one call. A mismatch wants Adapter, a repeated sequence wants Facade.
- **[Mediator](/patterns/behavioral/mediator)**: Mediator routes messages between peers that would otherwise talk to each other; Facade runs a sequence on behalf of an outside caller. Siblings on the HUD want a Mediator; the main menu wants a Facade.
- **[Scene Flow](/patterns/architectural/scene-flow)**: `GameFlow` is the seed of a Scene Flow manager. The architectural pattern is what it becomes when menu, loading, pause, and level transitions all need one owner.
- **[Singleton (Autoload)](/patterns/creational/singleton)**: The facade is an Autoload, with all the costs that page lists. Making it the *only* Autoload for these subsystems is how you keep the count down.
- **[Service Locator](/patterns/architectural/service-locator)**: What a Facade becomes when callers reach through it to the subsystems. Use it on purpose or not at all.
