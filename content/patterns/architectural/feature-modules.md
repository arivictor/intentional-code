---
title: "Feature Modules"
description: "Organise the project as res://features/<feature>/ folders that each own their scenes, scripts, and resources, expose a root script and signals as their only public surface, and never reach into each other with node paths."
---

# Feature Modules

**Buys folder-per-feature boundaries with in-process speed and one project; pays in the discipline to stop features reaching into each other with `get_node("../../")`.**

A feature module is a folder that owns everything one feature needs — its scenes, its scripts, its `Resource` definitions, its `.tres` data, its tests — and exposes one small public surface to the rest of the game: the script on its root scene, with its exported properties, its methods, and its signals. Inventory is a folder. Dialogue is a folder. Quests are a folder. Anything outside a folder that wants something from inside it goes through the root script, and anything inside that wants to tell the world something emits a signal and lets the world decide.

This is the opposite of the layout most projects start with — `res://scenes/`, `res://scripts/`, `res://assets/` — where a feature is smeared across three trees and the only thing holding it together is the developer's memory. Organising by feature does not make code faster or smaller; it makes the question "what does dialogue depend on?" answerable by looking at one folder. In Godot, where any script can reach any node with a long enough path, that answer is only true if nobody writes the path.

## Scenario

Organised by type, and everybody reaches for everything:

```
res://
├── scenes/
│   ├── player.tscn        dialogue_box.tscn     quest_log.tscn
│   ├── inventory.tscn     shop.tscn             hud.tscn
├── scripts/
│   ├── player.gd          dialogue_box.gd       quest_log.gd
│   ├── inventory.gd       shop.gd               hud.gd
└── assets/ …
```

```gdscript:title="res://scripts/dialogue_box.gd"
extends Control

func _on_choice_selected(choice: Dictionary) -> void:
	if choice.has("give_item"):
		# Dialogue knows the whole tree above it and inventory's internals.
		var inventory := get_node("/root/Main/World/Player/Inventory")
		inventory.items[choice["give_item"]] = inventory.items.get(choice["give_item"], 0) + 1
		inventory.get_node("../../../HUD/InventoryPanel").refresh()
	if choice.has("quest"):
		get_parent().get_parent().get_node("QuestLog").active_quests.append(choice["quest"])
```

Move the player under a `YSort` and dialogue breaks. Rename `QuestLog` and dialogue breaks. Open `dialogue_box.tscn` on its own to work on the layout and it crashes in `_on_choice_selected`. Add a stacking limit to inventory and it is bypassed, because dialogue writes to the dictionary directly. Nothing about the folder structure told anyone that dialogue depends on inventory, quests, the HUD, and the exact shape of the scene tree.

> **Smell:** `get_node("/root/…")`, `get_node("../../")`, or `get_parent().get_parent()` in a script that is not the scene's own root. Someone outside a feature is holding a reference to its insides.

## Solution

One folder per feature. One public surface per folder. Wiring lives above the features, never between them.

```
res://
├── features/
│   ├── inventory/
│   │   ├── inventory.tscn        ← root scene; its script is the public surface
│   │   ├── inventory.gd
│   │   ├── item_data.gd          ← Resource definition
│   │   ├── items/                ← sword.tres, potion.tres …
│   │   ├── ui/inventory_panel.tscn
│   │   └── test/test_inventory.gd
│   ├── dialogue/
│   │   ├── dialogue_box.tscn
│   │   ├── dialogue_box.gd
│   │   └── lines/                ← .tres conversations
│   └── quests/
│       ├── quest_tracker.tscn
│       ├── quest_tracker.gd
│       └── quests/
├── game/
│   ├── main.tscn                 ← composes features; the ONLY cross-feature wiring
│   └── main.gd
└── shared/                       ← genuinely common: EventBus, utility classes
```

### A feature's public surface

The inventory root script is what the rest of the game is allowed to see. Its methods enforce its rules. Its signals announce what happened. It never names another feature.

```gdscript:title="res://features/inventory/inventory.gd"
class_name Inventory extends Node

signal item_added(item: ItemData, count: int)
signal item_removed(item: ItemData, count: int)
signal add_rejected(item: ItemData, reason: StringName)

@export var slot_capacity: int = 20

var _stacks: Dictionary[StringName, int] = {}
var _catalogue: Dictionary[StringName, ItemData] = {}

func add(item: ItemData, count: int = 1) -> bool:
	var current := _stacks.get(item.id, 0)
	if current == 0 and _stacks.size() >= slot_capacity:
		add_rejected.emit(item, &"full")
		return false
	if current + count > item.max_stack:
		add_rejected.emit(item, &"stack_limit")
		return false
	_stacks[item.id] = current + count
	_catalogue[item.id] = item
	item_added.emit(item, count)
	return true

func count_of(item_id: StringName) -> int:
	return _stacks.get(item_id, 0)
```

Everything under `res://features/inventory/ui/` may reach `_stacks`, because it is inside the folder. Nothing outside may. The inventory panel is a child of the inventory scene and connects to its parent's signals — inside the boundary, `get_parent()` is fine; it is the *feature's own* tree.

### Another feature that never mentions the first

Quests need to know when items are collected. The quest tracker does not know inventory exists; it exposes a method for "someone collected something" and lets the composition root decide who calls it.

```gdscript:title="res://features/quests/quest_tracker.gd"
class_name QuestTracker extends Node

signal objective_progressed(quest: QuestData, objective_index: int, progress: int)
signal quest_completed(quest: QuestData)

var _active: Array[QuestData] = []
var _progress: Dictionary[StringName, int] = {}

func on_item_collected(item_id: StringName, count: int) -> void:
	for quest in _active:
		for i in quest.objectives.size():
			var objective := quest.objectives[i]
			if objective.kind == QuestObjective.Kind.COLLECT and objective.target_id == item_id:
				var key := StringName("%s:%d" % [quest.id, i])
				_progress[key] = _progress.get(key, 0) + count
				objective_progressed.emit(quest, i, _progress[key])
				_check_complete(quest)
```

Note the parameter is `item_id: StringName`, not `ItemData`. Quests do not import inventory's `Resource` class; they count identifiers. That is a deliberate narrowing of the contract so the two folders share nothing but a string.

### The composition root

The one place that knows more than one feature. It is dull on purpose.

```gdscript:title="res://game/main.gd"
extends Node

@onready var _inventory: Inventory = %Inventory
@onready var _dialogue: DialogueBox = %DialogueBox
@onready var _quests: QuestTracker = %QuestTracker

func _ready() -> void:
	# Signal up from one feature, call down into another. Nothing else.
	_inventory.item_added.connect(
		func(item: ItemData, count: int) -> void: _quests.on_item_collected(item.id, count)
	)
	_dialogue.item_granted.connect(_on_dialogue_item_granted)
	_dialogue.quest_offered.connect(_quests.start)

func _on_dialogue_item_granted(item_id: StringName, count: int) -> void:
	var item: ItemData = load("res://features/inventory/items/%s.tres" % item_id)
	if not _inventory.add(item, count):
		push_warning("dialogue granted %s but inventory refused it" % item_id)
```

Dialogue's script now emits `item_granted(item_id, count)` and stops. It has no idea whether an inventory is listening, which is why `dialogue_box.tscn` opens and plays on its own. The stacking rule is enforced because the only door into inventory is `add()`.

When the number of cross-feature connections grows past what one `_ready` can hold readably, move the fan-out to an event bus — see [Publish/Subscribe](/patterns/architectural/pub-sub). The rule survives the move: features talk to the bus, never to each other.

### Checking the boundary

Godot will not stop a script in `features/dialogue/` from `preload`-ing `res://features/inventory/inventory.gd`, and a `.tscn` can instance another feature's scene by path without any script at all. A small script run headless in CI catches both:

```gdscript:title="res://tools/check_feature_boundaries.gd"
extends SceneTree

const FEATURES_DIR := "res://features"
const PATH_SMELLS := ['get_node("../', 'get_node("/root/', '$"../', "get_parent().get_parent()"]

func _initialize() -> void:
	var violations := 0
	for feature in DirAccess.get_directories_at(FEATURES_DIR):
		violations += _scan("%s/%s" % [FEATURES_DIR, feature], feature)
	print("boundary violations: %d" % violations)
	quit(1 if violations > 0 else 0)

func _scan(dir: String, feature: String) -> int:
	var found := 0
	for file in DirAccess.get_files_at(dir):
		if not (file.ends_with(".gd") or file.ends_with(".tscn")):
			continue
		var path := "%s/%s" % [dir, file]
		var text := FileAccess.get_file_as_string(path)
		for other in DirAccess.get_directories_at(FEATURES_DIR):
			if other != feature and text.contains("res://features/%s/" % other):
				print("%s references feature '%s'" % [path, other])
				found += 1
		for smell in PATH_SMELLS:
			if text.contains(smell):
				print("%s uses %s" % [path, smell])
				found += 1
	for sub in DirAccess.get_directories_at(dir):
		found += _scan("%s/%s" % [dir, sub], feature)
	return found
```

```text
$ godot --headless -s res://tools/check_feature_boundaries.gd
res://features/dialogue/dialogue_box.gd references feature 'inventory'
res://features/dialogue/dialogue_box.gd uses get_node("/root/
boundary violations: 2
```

The check is crude — it flags `get_parent().get_parent()` inside a feature's own UI, which is arguably fine — but crude and running beats precise and imagined. Tune the smell list to your project.

### What counts as "shared"

A `res://shared/` folder is inevitable and dangerous. Put in it only things with no feature identity: an `EventBus` autoload, a `Utils` static class, a `StringName` constants file. The moment `shared/` contains `item_data.gd`, every feature that touches items depends on shared, and shared is a feature with no folder. If two features need the same `Resource` class, one of them owns it and the other depends on it explicitly, and the composition root is where that dependency shows.

## When to Use

- The project has more than three or four distinct systems and new team members cannot answer "where does the quest code live?" without grep.
- Scenes will not open on their own because their scripts assume a tree above them. Feature folders plus signals-up make every root scene runnable in isolation.
- Rules are being bypassed — inventory stacking, quest prerequisites — because other systems write to a feature's internals directly.
- You expect to cut a feature (multiplayer, a minigame, a DLC) and want the cut to be "delete a folder".

## When Not to Use

- A jam or a small prototype. A flat `res://` with ten scenes is perfectly legible; folders for one-file features are ceremony.
- Features that are genuinely one thing wearing two names. If "combat" and "enemies" cannot exist without each other, a boundary between them is a wall through the middle of a room.
- The team will not run the check. Boundaries nobody enforces decay into `get_node("../../")` within a month, and then you have the folders *and* the coupling.

## The Decision

Feature modules give you a project where dependencies are visible in the folder tree and every scene runs alone. They cost nothing at runtime — it is one project, one process, one `.pck` — and nothing in the editor; the only tax is discipline, and discipline is precisely what a scene-tree with global paths erodes. `get_node("/root/Main/World/Player/Inventory")` is one line, it works today, and it is the whole pattern failing.

The Godot-specific trap is that `.tscn` files are dependencies too. A designer dragging `inventory_panel.tscn` into the dialogue scene creates a cross-feature reference with no script and no review; the boundary check has to read scene files, not just scripts. The second trap is the autoload. An `Inventory` autoload is reachable from anywhere, which feels like it solves the wiring problem and actually deletes the boundary — every feature now depends on inventory invisibly. Keep autoloads to `shared/` and keep features as scenes the composition root instantiates.

Draw the folders when you feel the second `get_parent().get_parent()`, and keep them as long as the check passes. This is [tenet #7 — keep changes local](/philosophy/keep-changes-local#law-of-demeter): a feature that talks only to its own children and its own signals can be rewritten without anyone else noticing.

## Related Patterns

- **[Publish/Subscribe](/patterns/architectural/pub-sub)**: the composition root's `_ready` becomes an event bus once cross-feature connections outgrow one script. Same rule — features never name each other.
- **[Mediator](/patterns/behavioral/mediator)**: `main.gd` above is a mediator for features. The pattern is the same at scene scale; the folder is what makes it an architecture.
- **[Node Composition](/patterns/architectural/composition)**: inside a feature, behaviour is assembled from child components. Feature modules are the coarse grain; components are the fine grain.
- **[Domain-Driven Design](/patterns/architectural/domain-driven-design)**: bounded contexts are how you decide where the feature folders go. If two "features" share a language, they may be one context.
- **[Microkernel](/patterns/architectural/microkernel)**: feature modules that load from a `.pck` at runtime with a versioned contract. Same shape, harder guarantees.
