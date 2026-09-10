---
title: "Scene Flow"
description: "Give one root scene ownership of the menu, loading, level, and pause transitions — with threaded loading, fades, and typed data hand-off — instead of letting every scene swap itself for the next one."
---

# Scene Flow

**Buys one owner for menu → loading → level → pause transitions instead of scenes swapping each other; pays in a manager every scene depends on and that you must keep small.**

Scene Flow is the decision that scenes do not change scenes. A main menu does not know the file path of level one; a level does not know what comes after it; a pause menu does not know how to get back to the title screen. One root node — call it `Game` — owns the sequence. Scenes tell it what happened (a button was pressed, the level was completed, the player died) and it decides what is shown next, how the transition looks, and what data crosses the gap.

In Godot the tempting shortcut is `get_tree().change_scene_to_file(path)` called from wherever the decision is made. It works, and for a jam game it is the right call. It also replaces the *entire* current scene, which means anything that should persist — music, a HUD, a fade overlay, a loading screen — has to be an Autoload or be rebuilt on every change. Scene Flow replaces the shortcut with a container: the `Game` root keeps the persistent parts as its own children and swaps only the child of a `CurrentScene` node. The guarantee is that there is exactly one place in the project that knows the order of things.

## Scenario

A platformer with a menu, twelve levels, a pause overlay, and a results screen. Each scene handles its own exit:

```gdscript:title="res://ui/main_menu.gd"
extends Control

func _on_play_pressed() -> void:
	Global.selected_character = %CharacterPicker.selected
	get_tree().change_scene_to_file("res://levels/level_01.tscn")
```

```gdscript:title="res://levels/level_base.gd"
extends Node2D

@export var next_level_path: String

func _on_exit_reached() -> void:
	Global.last_level_time = _timer
	get_tree().change_scene_to_file(next_level_path)   # hard freeze on big levels
```

```gdscript:title="res://ui/pause_menu.gd"
extends CanvasLayer

func _on_quit_pressed() -> void:
	get_tree().paused = false
	get_tree().change_scene_to_file("res://ui/main_menu.tscn")
```

Every scene carries paths to other scenes, so renaming `level_01.tscn` is a project-wide search. Data crosses scenes through `Global`, an Autoload that has become a bag of whatever the last scene wanted to say to the next one — and nobody clears it, so the results screen sometimes shows the previous run's time. The load of a large level freezes the frame because `change_scene_to_file` loads synchronously. And there is no fade, because there is nowhere for a fade to live: the node that would draw it is being freed.

> **Smell:** `change_scene_to_file` appears in more than one script, or an Autoload named `Global`, `Globals`, or `GameState` has properties that only exist to survive a scene change.

## Solution

Make `Game` the main scene. It holds the persistent layers and a single container whose only child is whatever the player is currently in.

```
Game (Node)                          ← main scene; owns the flow
├── CurrentScene (Node)                exactly one child: menu, level, results…
│   └── Level03 (Node2D)
├── Hud (CanvasLayer)                  survives level changes
├── PauseMenu (CanvasLayer)            process_mode = ALWAYS, hidden until paused
├── LoadingScreen (CanvasLayer)        progress bar; hidden unless loading
├── Transition (CanvasLayer)
│   └── Fade (ColorRect)               tweened to black and back
└── Music (AudioStreamPlayer)          keeps playing across levels
```

The flow script is the whole pattern. It knows how to swap the container's child, how to load a scene without freezing, how to fade, and how to pause. It does not know anything about what happens *inside* a level.

```gdscript:title="res://game/game.gd"
class_name Game extends Node

const MAIN_MENU := preload("res://ui/main_menu.tscn")
const RESULTS := preload("res://ui/results_screen.tscn")

@onready var _current: Node = %CurrentScene
@onready var _loading: LoadingScreen = %LoadingScreen
@onready var _pause_menu: PauseMenu = %PauseMenu
@onready var _fade: ColorRect = %Fade

var _levels: LevelCatalogue = preload("res://levels/level_catalogue.tres")

func _ready() -> void:
	_pause_menu.resume_requested.connect(resume)
	_pause_menu.quit_requested.connect(go_to_menu)
	go_to_menu()

func go_to_menu() -> void:
	get_tree().paused = false
	var menu: MainMenu = MAIN_MENU.instantiate()
	menu.play_requested.connect(start_run)
	_swap_to(menu)

func start_run(character: CharacterData) -> void:
	var ctx := LevelContext.new()
	ctx.character = character
	ctx.level_index = 0
	go_to_level(ctx)

func go_to_level(ctx: LevelContext) -> void:
	var path := _levels.path_for(ctx.level_index)
	var packed := await _load_with_screen(path)
	if packed == null:
		push_error("Could not load level %s" % path)
		go_to_menu()
		return
	var level: Level = packed.instantiate()
	level.setup(ctx)                                   # call down
	level.completed.connect(_on_level_completed.bind(ctx))   # signal up
	level.player_died.connect(_on_player_died.bind(ctx))
	_swap_to(level)

func _on_level_completed(result: LevelResult, ctx: LevelContext) -> void:
	ctx.results.append(result)
	if ctx.level_index + 1 < _levels.count():
		ctx.level_index += 1
		go_to_level(ctx)
	else:
		_show_results(ctx)

func _on_player_died(ctx: LevelContext) -> void:
	go_to_level(ctx)   # same index: retry

func _show_results(ctx: LevelContext) -> void:
	var screen: ResultsScreen = RESULTS.instantiate()
	screen.setup(ctx.results)
	screen.continue_requested.connect(go_to_menu)
	_swap_to(screen)
```

Three things to notice. Levels receive a `LevelContext` through `setup` — a typed object built for this run, not a global. Levels report back through signals, and `Game` binds the context to the connection so the handler has everything it needs. And the level index and paths live in a `LevelCatalogue` Resource, so reordering levels is an inspector edit.

### Swapping and fading

```gdscript:title="res://game/game.gd"
func _swap_to(scene: Node) -> void:
	await _fade_out()
	for child in _current.get_children():
		_current.remove_child(child)
		child.queue_free()
	_current.add_child(scene)
	await _fade_in()

func _fade_out() -> void:
	var tw := create_tween()
	tw.tween_property(_fade, "modulate:a", 1.0, 0.25).set_trans(Tween.TRANS_SINE)
	await tw.finished

func _fade_in() -> void:
	var tw := create_tween()
	tw.tween_property(_fade, "modulate:a", 0.0, 0.25).set_trans(Tween.TRANS_SINE)
	await tw.finished
```

`remove_child` before `queue_free` matters: the old level's `_exit_tree` runs immediately, so it stops processing and emitting before the new one is added, instead of overlapping for a frame. Because `_swap_to` awaits a tween, any function that calls it becomes a coroutine — see [Coroutines](/patterns/concurrency/coroutines) for what that implies.

### Loading without a freeze

`change_scene_to_file` and `load()` block the main thread. For anything larger than a menu, request a threaded load and poll it while a loading screen animates:

```gdscript:title="res://game/game.gd"
func _load_with_screen(path: String) -> PackedScene:
	_loading.show_with_progress(0.0)
	var err := ResourceLoader.load_threaded_request(path)
	if err != OK:
		_loading.hide()
		return null
	var progress: Array = []
	while true:
		var status := ResourceLoader.load_threaded_get_status(path, progress)
		match status:
			ResourceLoader.THREAD_LOAD_IN_PROGRESS:
				_loading.show_with_progress(progress[0])
				await get_tree().process_frame
			ResourceLoader.THREAD_LOAD_LOADED:
				_loading.hide()
				return ResourceLoader.load_threaded_get(path) as PackedScene
			_:
				_loading.hide()
				return null
	return null
```

The loading thread parses and builds the resource; `instantiate()` and `add_child` still happen on the main thread, because only the main thread touches the scene tree. A level that is heavy to *instantiate* (not just to load) needs a further step: instantiate it hidden, or split it into chunks added over several frames — which is the [Pipeline](/patterns/concurrency/pipeline) pattern.

### Pausing

Pause is a flow decision, so it lives here too:

```gdscript:title="res://game/game.gd"
func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause") and _current.get_child_count() > 0:
		if get_tree().paused:
			resume()
		else:
			pause()
		get_viewport().set_input_as_handled()

func pause() -> void:
	get_tree().paused = true
	_pause_menu.open()

func resume() -> void:
	_pause_menu.close()
	get_tree().paused = false
```

`PauseMenu` and `Transition` are set to `PROCESS_MODE_ALWAYS` in the inspector; `CurrentScene` is `PROCESS_MODE_PAUSABLE`. The level does not need to know pausing exists.

### Passing data between scenes

The `LevelContext` is the anti-`Global`. It is a `RefCounted` built when a run starts and thrown away when it ends:

```gdscript:title="res://game/level_context.gd"
class_name LevelContext extends RefCounted

var character: CharacterData
var level_index: int = 0
var results: Array[LevelResult] = []
```

Anything the results screen needs was appended by `Game` as it went. Nothing survives by accident, and a unit test can build a `LevelContext` in two lines and drive a `Level` with it — no Autoload state to reset.

## `change_scene_to_packed` or a container?

The two are not enemies. `get_tree().change_scene_to_packed(scene)` frees the current scene, instantiates the new one, and makes it `get_tree().current_scene`. It is one line, it is correct, and everything that should persist has to be an Autoload. If `Game` is itself the main scene, calling it would free `Game` — so the moment you have a root that owns a flow, you own the container instead.

Choose `change_scene_to_*` when the game is small, nothing persists, and there is no loading screen. Choose the container when you want any of: a fade, a loading screen, a HUD or music that survives, typed data hand-off, or one place to read the flow. Most games that reach a second level want at least two of those.

## When to Use

- There is more than one scene the player moves between, and the transitions have any presentation at all.
- Something must survive a scene change: HUD, music, a network session, a fade overlay.
- Levels need input (the chosen character, difficulty, seed) and produce output (score, time) and you are tired of a global bag.
- Levels are large enough that a synchronous load drops frames.

## When Not to Use

- A jam game with two scenes. `change_scene_to_file` in a button handler is the simplest thing that works.
- The "scenes" are really UI panels inside one screen. That is a `Control` that shows and hides children, not a flow.
- The flow is genuinely a graph the *content* defines (a metroidvania with doors between rooms). Then the flow manager should own the *mechanism* of a room swap while rooms declare their connections as data — and you may want a [State](/patterns/behavioral/state) machine for the world map rather than a linear catalogue.

## The Decision

The cost of Scene Flow is a manager every scene depends on. Menus emit `play_requested` and trust that someone listens; levels call `setup` on a contract `Game` defines. That is a healthier dependency than every scene knowing every file path, but it is still a hub, and hubs attract features. The failure mode is `Game` growing a `score`, an `inventory`, an `is_boss_defeated`, until it is `Global` again with a better name. Keep it to sequencing, loading, transitions, and pause. Everything else belongs in the level, in a [Repository](/patterns/architectural/repository), or in a Resource.

The Godot-specific gotcha is `await`. Every function that fades or loads is a coroutine, and a level can be freed while `Game` is awaiting — a player quits mid-fade. Check `is_instance_valid` on anything held across an `await`, and never `await` inside `_exit_tree`. A second gotcha is `get_tree().current_scene`: with a container it points at `Game`, not the level, so code that used to reach for it needs a proper reference passed down instead. That is a feature — the reach was the coupling.

Some teams make the flow an Autoload (`SceneFlow.go_to_level(...)`) so any scene can trigger a change. It removes the need to wire signals but reintroduces the thing the pattern set out to remove: scenes deciding what comes next. If you do it, keep the Autoload's API to `request_*` methods and let it own the decision. This is [tenet #9 — make the next change local](/philosophy/keep-changes-local) applied to sequencing: reordering levels or adding a cutscene should touch one file.

## Related Patterns

- **[Facade](/patterns/structural/facade)**: `Game` is a facade over loading, fading, pausing, and swapping. The Facade page explains why keeping it to one workflow is what stops it becoming a god autoload.
- **[Mediator](/patterns/behavioral/mediator)**: Levels and menus never reference each other; `Game` routes between them. When the routing gets rich, Mediator is the shape it has grown into.
- **[State](/patterns/behavioral/state)**: A flow with branching (menu, options, level, cutscene, results) is a state machine over scenes. Model it as one when `go_to_*` methods start checking what is currently loaded.
- **[Coroutines](/patterns/concurrency/coroutines)** and **[Cancellation](/patterns/concurrency/cancellation)**: Fades and loads are multi-frame; both pages cover resuming on freed nodes and stopping a load the player abandoned.
- **[Singleton (Autoload)](/patterns/creational/singleton)**: The alternative home for flow. Read it before making `SceneFlow` global; the hidden-dependency tax applies.
- **[Repository](/patterns/architectural/repository)**: Where progress goes between sessions. `LevelContext` is for one run; the Repository is for the save file.
- **[Feature Modules](/patterns/architectural/feature-modules)**: Levels, menus, and the game root are separate modules; Scene Flow is the only one allowed to reference all of them.
