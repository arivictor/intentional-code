---
title: "Hexagonal"
description: "Put the game logic in the centre, declare ports for input, save storage, and platform services, and plug in Godot adapters for play and in-memory adapters for tests and headless runs."
---

# Hexagonal

**Buys full game-logic tests with no real input, storage, or platform services via in-memory adapters; pays in port proliferation and steady mapping at every edge.**

Hexagonal Architecture — ports and adapters — answers one question: what does the game logic *need* from the world, and can we hand it a fake? The logic sits in the middle as plain `RefCounted` classes. Around it are **ports**: small base classes that name a need without saying how it is met. "Give me the player's intent this tick." "Store this run under slot 3." "Unlock this achievement." **Adapters** satisfy the ports. In play, the adapters are Godot: `Input.get_vector`, `FileAccess`, the Steam or console SDK. In tests and headless runs, the adapters are Arrays and Dictionaries.

The terminology splits ports by direction. **Driving** ports are how the world calls the game (a scene calling `RunService.tick()`); **driven** ports are how the game calls the world (the run asking `SaveStorage` to write). In Godot the driven side is where the pattern earns its keep, because the three things a game most needs from outside — input, storage, platform — are exactly the three things a test cannot have.

If you have read [Clean Architecture](/patterns/architectural/clean-architecture) this will look familiar. Same rule, different diagram: rings emphasise the layering; the hexagon emphasises that every edge is symmetric and swappable. Use whichever your team draws on the whiteboard.

## Scenario

A roguelike's run controller reads the keyboard, writes the save file, and unlocks achievements, all from one node:

```gdscript:title="res://run/run_controller.gd"
extends Node

var floor_number: int = 1
var gold: int = 0
var hp: int = 30

func _physics_process(_delta: float) -> void:
	var dir := Input.get_vector("left", "right", "up", "down")
	if dir != Vector2.ZERO:
		_step(dir)
	if Input.is_action_just_pressed("descend") and _on_stairs():
		floor_number += 1
		if floor_number == 2:
			Steam.setAchievement("FIRST_DESCENT")   # platform SDK, right here
		var file := FileAccess.open("user://run.json", FileAccess.WRITE)
		file.store_string(JSON.stringify({"floor": floor_number, "gold": gold, "hp": hp}))
```

To test "descending to floor two unlocks the achievement" you need a keyboard, a writable `user://`, and the Steam client running. On a CI machine you have none of them. So the rule goes untested, and the day someone reorders the two `if`s the achievement silently fires on every floor.

> **Smell:** `Input.`, `FileAccess.` and a platform SDK call within ten lines of each other. Three edges of the hexagon are welded to the logic.

## Solution

Draw the hexagon. Game logic inside; one port per outside need; adapters outside.

```
        ┌──────── Driving adapters ────────┐
        │  RunScene (Node) calls tick()    │
        │  HeadlessRunner (SceneTree)      ├──►  [driving port: RunService]
        │  GUT / gdUnit4 test              │              │
        └──────────────────────────────────┘     ┌────────┴─────────┐
                                                 │   RunService     │
        ┌──────── Driven adapters ─────────┐     │   (RefCounted)   │
        │  GodotInput   / RecordedInput ───┼────►│ port: InputSource│
        │  FileStorage  / MemoryStorage ───┼────►│ port: SaveStorage│
        │  SteamPlatform / NullPlatform ───┼────►│ port: Platform   │
        └──────────────────────────────────┘     └──────────────────┘
```

### The ports

GDScript has no `interface` keyword, so a port is a base class whose methods do nothing useful. Static typing on the port type is what keeps adapters honest.

```gdscript:title="res://run/ports/input_source.gd"
class_name InputSource extends RefCounted

class Intent extends RefCounted:
	var move: Vector2 = Vector2.ZERO
	var descend: bool = false

## Driven port: what did the player want this tick?
func read_intent() -> Intent:
	return Intent.new()
```

```gdscript:title="res://run/ports/save_storage.gd"
class_name SaveStorage extends RefCounted

func write(slot: int, data: Dictionary) -> Error:
	return ERR_UNAVAILABLE

func read(slot: int) -> Dictionary:
	return {}
```

```gdscript:title="res://run/ports/platform_services.gd"
class_name PlatformServices extends RefCounted

func unlock_achievement(id: StringName) -> void:
	pass

func submit_score(board: StringName, score: int) -> void:
	pass
```

### The core

`RunService` is the driving port. It owns the rules and calls the driven ports. It does not know what a `Node` is.

```gdscript:title="res://run/run_service.gd"
class_name RunService extends RefCounted

signal floor_changed(floor_number: int)

const SAVE_SLOT := 0

var floor_number: int = 1
var gold: int = 0
var hp: int = 30
var position: Vector2i = Vector2i.ZERO
var stairs_at: Vector2i = Vector2i(3, 3)

var _input: InputSource
var _storage: SaveStorage
var _platform: PlatformServices

func _init(input: InputSource, storage: SaveStorage, platform: PlatformServices) -> void:
	_input = input
	_storage = storage
	_platform = platform

func tick() -> void:
	var intent := _input.read_intent()
	if intent.move != Vector2.ZERO:
		position += Vector2i(intent.move.sign())
	if intent.descend and position == stairs_at:
		_descend()

func _descend() -> void:
	floor_number += 1
	if floor_number == 2:
		_platform.unlock_achievement(&"first_descent")
	_storage.write(SAVE_SLOT, to_dict())
	floor_changed.emit(floor_number)

func to_dict() -> Dictionary:
	return {"floor": floor_number, "gold": gold, "hp": hp}
```

### Godot adapters

Each adapter is a few lines, because all the *decisions* were made in the core.

```gdscript:title="res://run/adapters/godot_input.gd"
class_name GodotInput extends InputSource

func read_intent() -> Intent:
	var intent := Intent.new()
	intent.move = Input.get_vector("left", "right", "up", "down")
	intent.descend = Input.is_action_just_pressed("descend")
	return intent
```

```gdscript:title="res://run/adapters/file_storage.gd"
class_name FileStorage extends SaveStorage

func _path(slot: int) -> String:
	return "user://run_%d.json" % slot

func write(slot: int, data: Dictionary) -> Error:
	var file := FileAccess.open(_path(slot), FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(data))
	return OK

func read(slot: int) -> Dictionary:
	if not FileAccess.file_exists(_path(slot)):
		return {}
	var file := FileAccess.open(_path(slot), FileAccess.READ)
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	return parsed if parsed is Dictionary else {}
```

```gdscript:title="res://run/adapters/steam_platform.gd"
class_name SteamPlatform extends PlatformServices

func unlock_achievement(id: StringName) -> void:
	Steam.setAchievement(String(id).to_upper())
	Steam.storeStats()
```

The scene wires them and drives the core from the engine loop:

```gdscript:title="res://run/run_scene.gd"
extends Node2D

var _run: RunService

func _ready() -> void:
	var platform: PlatformServices = SteamPlatform.new() if OS.has_feature("steam") else PlatformServices.new()
	_run = RunService.new(GodotInput.new(), FileStorage.new(), platform)
	# Presentation reacts to the core; the core never reaches for a node.
	_run.floor_changed.connect(func(n: int) -> void: %FloorLabel.text = "Floor %d" % n)

func _physics_process(_delta: float) -> void:
	_run.tick()
	%PlayerSprite.position = Vector2(_run.position) * 32.0
```

Notice `PlatformServices.new()` used directly as the null adapter on builds without Steam. The base class's empty methods *are* the null implementation — no separate `NullPlatform` file needed.

### In-memory adapters and the test

```gdscript:title="res://test/unit/test_run_service.gd"
extends GdUnitTestSuite

class RecordedInput extends InputSource:
	var script_intents: Array[Intent] = []
	func read_intent() -> Intent:
		return script_intents.pop_front() if not script_intents.is_empty() else Intent.new()

class MemoryStorage extends SaveStorage:
	var slots: Dictionary[int, Dictionary] = {}
	func write(slot: int, data: Dictionary) -> Error:
		slots[slot] = data.duplicate(true)
		return OK
	func read(slot: int) -> Dictionary:
		return slots.get(slot, {})

class RecordingPlatform extends PlatformServices:
	var unlocked: Array[StringName] = []
	func unlock_achievement(id: StringName) -> void:
		unlocked.append(id)

func _move(dir: Vector2, descend := false) -> InputSource.Intent:
	var i := InputSource.Intent.new()
	i.move = dir
	i.descend = descend
	return i

func test_first_descent_unlocks_once_and_saves() -> void:
	var input := RecordedInput.new()
	var storage := MemoryStorage.new()
	var platform := RecordingPlatform.new()
	var run := RunService.new(input, storage, platform)

	for i in 3:
		input.script_intents.append(_move(Vector2(1, 1)))
	input.script_intents.append(_move(Vector2.ZERO, true))
	for i in 4:
		run.tick()

	assert_int(run.floor_number).is_equal(2)
	assert_array(platform.unlocked).contains_exactly([&"first_descent"])
	assert_dict(storage.slots[0]).contains_key_value("floor", 2)
```

No keyboard, no disk, no Steam, no scene tree. The test is the whole point of the pattern; the architecture without it is just extra files.

### A headless run

The same in-memory adapters let you run the game with no window at all — for soak tests, balance simulations, or a dedicated server. A script that extends `SceneTree` is the driving adapter:

```gdscript:title="res://tools/headless_run.gd"
extends SceneTree

func _initialize() -> void:
	var input := RandomWalkInput.new(1234)     # a seeded InputSource adapter
	var run := RunService.new(input, SaveStorage.new(), PlatformServices.new())
	var ticks := 0
	while run.hp > 0 and ticks < 100_000:
		run.tick()
		ticks += 1
	print("survived %d ticks, reached floor %d" % [ticks, run.floor_number])
	quit()
```

```text
$ godot --headless -s res://tools/headless_run.gd
survived 100000 ticks, reached floor 17
```

## When to Use

- A rule cannot be tested today because it needs a controller, a file, or a platform SDK to even run. Ports are the direct fix.
- You ship to several platforms whose services differ (Steam achievements, console trophies, a mobile leaderboard, none at all on itch). One `PlatformServices` port, one adapter per store.
- You want input to be replayable — for bug reports, demos, or a ghost — which means input must arrive through a port you can record and play back.
- A headless build (server, CI balance run) needs to exercise real game logic without a display.

## When Not to Use

- A prototype where the whole run controller is forty lines. Three ports and six adapters for that is ceremony.
- Logic that is inseparable from the engine: physics-driven movement, rendering effects, particle timing. There is no meaningful in-memory adapter for `move_and_slide()`.
- You have no intention of writing the tests. Without them the ports are indirection with nothing on the other side.

## The Decision

The benefit is exact and easy to state: every rule in the core runs in a test with fakes for input, storage, and platform. That is a much stronger guarantee than "we test the parts that don't touch the engine", because with ports there are no such parts — *everything* in the core is reachable.

The cost is also exact. Each new outside need is a new port, and each port needs a Godot adapter and an in-memory one: audio, haptics, the clock, the RNG, analytics, cloud saves. Six ports in, you will have a `res://run/ports/` folder that looks like an SDK and a constructor with six parameters. And at every edge there is mapping: `InputEvent` becomes `Intent`, `RunService` becomes a `Dictionary`, a `Dictionary` becomes JSON, `StringName` becomes a Steam API id. The mapping is mechanical and it never stops growing with the model.

The Godot-specific gotcha is that ports must not leak node types. A `SaveStorage.write(node: Node)` port is a port in name only — the in-memory adapter now needs a scene tree to have anything to write. Keep port signatures to `Dictionary`, `Array`, `Resource`, and plain `RefCounted` types, and the fakes stay trivial. If you arrived here because a rule was untestable, that is [the tests talking](/philosophy/listen-to-the-tests#test-driven-development): adopt ports for the pain you feel, not as a default layer.

## Related Patterns

- **[Clean Architecture](/patterns/architectural/clean-architecture)**: same rule, drawn as rings. Read it for the entity/use-case split inside the hexagon; read this page for the edges.
- **[Adapter](/patterns/structural/adapter)**: the structural pattern each driven adapter uses — `SteamPlatform` wraps the SDK and exposes the port the core defined. Hexagonal is the architecture; Adapter is the technique.
- **[Repository](/patterns/architectural/repository)**: the `SaveStorage` port grown up — slots, versioned schemas, and migrations behind one contract.
- **[Command](/patterns/behavioral/command)**: an `InputSource` that returns command objects instead of an `Intent` struct gives you input buffering and replay for free.
- **[Layered](/patterns/architectural/layered)**: keeps the same core but treats presentation as "above" and data as "below" instead of as equal edges. Prefer layered when only storage needs swapping; prefer hexagonal when input and platform do too.
