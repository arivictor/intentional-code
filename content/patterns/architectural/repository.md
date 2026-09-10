---
title: "Repository"
description: "Put every read and write of the save file behind one SaveRepository contract, with a FileAccess implementation for play and an in-memory one for tests, and version the schema from day one."
---

# Repository

**Buys game-logic tests without touching disk and an explicit save contract; pays in interface sprawl and leaks once queries and versioning creep in.**

A Repository is a contract for persistence that the game logic depends on, with the actual storage hidden behind it. Game code says `repo.save_slot(2, game)` and `repo.load_slot(2)`; whether that becomes a JSON file under `user://`, a `ConfigFile`, a cloud sync, or an in-memory `Dictionary` in a test is the repository's business. The logic never opens a `FileAccess`.

GDScript has no interfaces, so the contract is a base class with a `class_name` and methods that do nothing useful — interface-by-convention — and static typing on `SaveRepository` is what keeps the implementations honest. Two things make the pattern more than a wrapper around `FileAccess`: the in-memory implementation, which is what lets a `GameSession` test run without a disk, and the **versioned schema**, which is what lets a save written by version 1.0 load in version 1.4.

## Scenario

Saving started as a helper on the player and grew from there:

```gdscript:title="res://player/player.gd"
extends CharacterBody2D

func save_game() -> void:
	var file := FileAccess.open("user://save.json", FileAccess.WRITE)
	file.store_string(JSON.stringify({
		"pos_x": global_position.x,
		"pos_y": global_position.y,
		"hp": hp,
		"gold": Global.gold,
	}))
```

```gdscript:title="res://ui/main_menu.gd"
extends Control

func _ready() -> void:
	if FileAccess.file_exists("user://save.json"):
		var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("user://save.json"))
		%ContinueButton.disabled = false
		%ContinueLabel.text = "HP %d, %d gold" % [data["hp"], data["gold"]]
```

The schema is whatever string keys happen to appear in two scripts. When the inventory system starts writing `"items"` from a third script, the main menu crashes on saves that predate it. There is one slot, hard-coded twice. And no test can exercise "load a save, take damage, save again" without writing to the real `user://` directory of whoever runs the suite.

> **Smell:** a string literal like `"user://save.json"` or `"hp"` appearing in more than one script. The save format has no owner.

## Solution

One class owns the shape of a save. One contract owns reading and writing it. Everything else calls the contract.

```
GameSession (logic)  ──uses──►  SaveRepository (contract, RefCounted)
                                   ▲              ▲
                          implemented by   implemented by
                                   │              │
                        FileSaveRepository   InMemorySaveRepository
                        (FileAccess + JSON)  (Dictionary, for tests)
```

### The save schema

The `SaveGame` is a `RefCounted` (or a `Resource`, if you want it in the inspector) that knows its own version and how to migrate older shapes forward.

```gdscript:title="res://save/save_game.gd"
class_name SaveGame extends RefCounted

const SCHEMA_VERSION := 3

var position: Vector2 = Vector2.ZERO
var hp: int = 10
var gold: int = 0
var items: Dictionary[StringName, int] = {}   # item id → count (v2)
var play_time_sec: float = 0.0                 # v3

func to_dict() -> Dictionary:
	return {
		"version": SCHEMA_VERSION,
		"position": {"x": position.x, "y": position.y},
		"hp": hp,
		"gold": gold,
		"items": items.duplicate(),
		"play_time_sec": play_time_sec,
	}

static func from_dict(raw: Dictionary) -> SaveGame:
	var d := _migrate(raw.duplicate(true))
	var save := SaveGame.new()
	save.position = Vector2(d["position"]["x"], d["position"]["y"])
	save.hp = int(d["hp"])
	save.gold = int(d["gold"])
	for key: String in d["items"]:
		save.items[StringName(key)] = int(d["items"][key])
	save.play_time_sec = float(d["play_time_sec"])
	return save

## Walks a dictionary forward one version at a time. Each step is small and
## stays forever; a v1 save from launch day still loads.
static func _migrate(d: Dictionary) -> Dictionary:
	var version := int(d.get("version", 1))
	if version < 2:
		d["position"] = {"x": d.get("pos_x", 0.0), "y": d.get("pos_y", 0.0)}
		d.erase("pos_x")
		d.erase("pos_y")
		d["items"] = {}
		version = 2
	if version < 3:
		d["play_time_sec"] = 0.0
		version = 3
	d["version"] = version
	return d
```

JSON keys are always `String`, and JSON numbers are always `float`, which is why `from_dict` casts. Do the casting here, once, rather than in every consumer.

### The contract

```gdscript:title="res://save/save_repository.gd"
class_name SaveRepository extends RefCounted

class SlotInfo extends RefCounted:
	var slot: int
	var hp: int
	var gold: int
	var play_time_sec: float

## Interface-by-convention. Subclasses override everything.
func save_slot(slot: int, game: SaveGame) -> Error:
	return ERR_UNAVAILABLE

func load_slot(slot: int) -> SaveGame:
	return null

func has_slot(slot: int) -> bool:
	return false

func delete_slot(slot: int) -> Error:
	return ERR_UNAVAILABLE

func list_slots() -> Array[SlotInfo]:
	return []
```

### The file implementation

```gdscript:title="res://save/file_save_repository.gd"
class_name FileSaveRepository extends SaveRepository

const DIR := "user://saves"

func _init() -> void:
	DirAccess.make_dir_recursive_absolute(DIR)

func _path(slot: int) -> String:
	return "%s/slot_%d.json" % [DIR, slot]

func save_slot(slot: int, game: SaveGame) -> Error:
	var file := FileAccess.open(_path(slot), FileAccess.WRITE)
	if file == null:
		push_error("save failed: %s" % error_string(FileAccess.get_open_error()))
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(game.to_dict(), "\t"))
	return OK

func load_slot(slot: int) -> SaveGame:
	if not has_slot(slot):
		return null
	var text := FileAccess.get_file_as_string(_path(slot))
	var parsed: Variant = JSON.parse_string(text)
	if not parsed is Dictionary:
		push_error("save slot %d is corrupt" % slot)
		return null
	return SaveGame.from_dict(parsed)

func has_slot(slot: int) -> bool:
	return FileAccess.file_exists(_path(slot))

func delete_slot(slot: int) -> Error:
	return DirAccess.remove_absolute(_path(slot))

func list_slots() -> Array[SlotInfo]:
	var result: Array[SlotInfo] = []
	for slot in 3:
		var game := load_slot(slot)
		if game == null:
			continue
		var info := SlotInfo.new()
		info.slot = slot
		info.hp = game.hp
		info.gold = game.gold
		info.play_time_sec = game.play_time_sec
		result.append(info)
	return result
```

Why JSON and not `file.store_var(obj, true)` or `ResourceSaver.save(res, "user://slot.tres")`? Both can embed scripts, and both will happily instantiate whatever class a *modified* save file names when loaded. A user-writable file is untrusted input. JSON through `to_dict`/`from_dict` gives you a schema you can read in a text editor, diff, migrate, and refuse.

### The in-memory implementation

It stores the *serialised* dictionary, not the `SaveGame` object, so a round trip through `to_dict`/`from_dict` — including the migration — is exercised by every test.

```gdscript:title="res://save/in_memory_save_repository.gd"
class_name InMemorySaveRepository extends SaveRepository

var slots: Dictionary[int, Dictionary] = {}

func save_slot(slot: int, game: SaveGame) -> Error:
	slots[slot] = game.to_dict()
	return OK

func load_slot(slot: int) -> SaveGame:
	return SaveGame.from_dict(slots[slot]) if slots.has(slot) else null

func has_slot(slot: int) -> bool:
	return slots.has(slot)

func delete_slot(slot: int) -> Error:
	return OK if slots.erase(slot) else ERR_DOES_NOT_EXIST

func list_slots() -> Array[SlotInfo]:
	var result: Array[SlotInfo] = []
	for slot: int in slots:
		var game := load_slot(slot)
		var info := SlotInfo.new()
		info.slot = slot
		info.hp = game.hp
		info.gold = game.gold
		info.play_time_sec = game.play_time_sec
		result.append(info)
	return result
```

### Using it

The logic that reads and writes saves takes the contract, never the file class:

```gdscript:title="res://game/game_session.gd"
class_name GameSession extends RefCounted

signal loaded(game: SaveGame)

var current: SaveGame
var _repo: SaveRepository
var _slot: int

func _init(repo: SaveRepository, slot: int) -> void:
	_repo = repo
	_slot = slot

func start_or_continue() -> void:
	current = _repo.load_slot(_slot)
	if current == null:
		current = SaveGame.new()
	loaded.emit(current)

func checkpoint(player_position: Vector2) -> void:
	current.position = player_position
	_repo.save_slot(_slot, current)
```

The main scene builds `GameSession.new(FileSaveRepository.new(), chosen_slot)`; the test builds it with `InMemorySaveRepository.new()`.

```gdscript:title="res://test/unit/test_game_session.gd"
extends GutTest

func test_v1_save_migrates_and_round_trips() -> void:
	var repo := InMemorySaveRepository.new()
	repo.slots[0] = {"pos_x": 40.0, "pos_y": 8.0, "hp": 7, "gold": 12}   # launch-day format
	var session := GameSession.new(repo, 0)
	session.start_or_continue()
	assert_eq(session.current.position, Vector2(40, 8))
	assert_eq(session.current.items.size(), 0)

	session.current.items[&"potion"] = 2
	session.checkpoint(Vector2(1, 1))
	assert_eq(repo.slots[0]["version"], SaveGame.SCHEMA_VERSION)

	var reloaded := GameSession.new(repo, 0)
	reloaded.start_or_continue()
	assert_eq(reloaded.current.items[&"potion"], 2)
```

Output of a quick print of `repo.slots[0]` after the checkpoint:

```text
{ "version": 3, "position": { "x": 1.0, "y": 1.0 }, "hp": 7, "gold": 12, "items": { "potion": 2 }, "play_time_sec": 0.0 }
```

## When to Use

- Any game with a save file that will outlive its first release. The migration table is the cheapest insurance you will ever buy.
- Logic that loads or saves needs a test, and the test must not touch the runner's real `user://`.
- More than one screen reads the save (a slot picker, a continue button, the pause menu's "save and quit"). One contract stops each screen inventing its own keys.
- You expect a second storage backend: cloud saves, a console's save API, a browser's `user://` that behaves differently.

## When Not to Use

- A game with no persistence, or with a single `ConfigFile` of settings that one script owns. Wrapping `ConfigFile` in a repository is indirection with nothing behind it.
- The "repository" would have one implementation and no test using it. Then it is `FileAccess` with an extra file.
- The save is a snapshot of hundreds of nodes and you are tempted to serialise the scene tree. That is a [Memento](/patterns/behavioral/memento) problem first; decide what state *is* before deciding where it goes.

## The Decision

The explicit contract is the real product. Before the repository, the save format was whatever three scripts agreed on by accident; after it, `SaveGame.to_dict()` is the format, `SCHEMA_VERSION` says which one, and `_migrate` is a list of every change ever made. That list is the difference between a 1.4 patch that loads every player's file and one that wipes them.

The costs arrive with growth. The first is sprawl: a save, a settings profile, an achievements ledger, a replay index — each wants its own repository, its own file implementation, its own in-memory fake, and the fakes drift from the real ones unless both are tested against the same contract. The second is leakage. `list_slots` is already a query; next comes "the newest slot", then "slots on floor five", then "a thumbnail per slot", and the contract that started as save/load is a query API with disk semantics showing through. When queries multiply, split reads from writes rather than growing the one interface.

The Godot-specific trap is trust. `store_var` and `ResourceSaver` are convenient and both will execute a script a modder or a cheat tool embedded in the file. Keep saves as data — JSON or a `ConfigFile` — and keep the class instantiation on your side of the boundary. The interface itself is [an abstraction borrowed against the future](/philosophy/borrowed-abstraction): it pays off the day you migrate a save or test a session without a disk, and the version field is the reason to borrow it on day one.

## Related Patterns

- **[Hexagonal](/patterns/architectural/hexagonal)**: `SaveRepository` is the canonical driven port. Hexagonal tells you where the port sits; this page is what it looks like once slots and versions arrive.
- **[Layered](/patterns/architectural/layered)**: the repository is the whole of the data layer's write side. Layered plus Repository is enough structure for most single-player games.
- **[Memento](/patterns/behavioral/memento)**: produces the snapshot; the repository stores it. Memento answers "what is the state?"; Repository answers "where does it live and how does an old one load?".
- **[Domain-Driven Design](/patterns/architectural/domain-driven-design)**: one repository per aggregate — an `InventoryRepository` loads and saves a whole `Inventory`, never a single stack.
- **[Data-Driven Design](/patterns/architectural/data-driven)**: the read-only cousin. Designer-authored `.tres` files are loaded with `load()` and never written at runtime; the repository is for state the *player* changes.
