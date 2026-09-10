---
title: "Singleton (Autoload)"
description: "Hold one globally reachable instance as an Autoload, and know when a passed reference, an exported node, or a static var is the better tool."
---

# Singleton (Autoload)

**Buys one guaranteed, globally reachable instance via an Autoload; pays in hidden dependencies, scenes that can't run alone, and tests that share state — prefer passing references for anything that isn't truly global.**

An Autoload is Godot's singleton. Register a script or scene under Project Settings → Globals → Autoload and the engine instantiates it as a child of the root window before the main scene loads, keeps it alive across every `change_scene_to_file`, and exposes it to every script by name. That is a stronger guarantee than most environments give a singleton: not just "one instance", but "one instance that exists before anything else and outlives everything else". The guarantee is real and useful. It is also why Autoloads become the dumping ground of most Godot projects, because a global that is always there is a global you will always reach for.

This page is therefore two things: how to write an Autoload well when you need one, and the three alternatives that should absorb most of what people put in them.

## Scenario

A project has a `GameManager` Autoload. It started as a score counter and grew.

```gdscript:title="res://autoload/game_manager.gd"
extends Node

var score: int = 0
var enemies_alive: int = 0
var player: Player
var current_level: Level

func register_enemy(enemy: Enemy) -> void:
	enemies_alive += 1
	enemy.died.connect(_on_enemy_died.bind(enemy))

func _on_enemy_died(enemy: Enemy) -> void:
	enemies_alive -= 1
	score += enemy.points
	current_level.hud.set_score(score)     # reaches down into the level
	if enemies_alive == 0:
		current_level.open_exit()
```

```gdscript:title="res://enemies/enemy.gd"
class_name Enemy extends CharacterBody2D

signal died

@export var points: int = 10

func _ready() -> void:
	GameManager.register_enemy(self)

func _physics_process(_delta: float) -> void:
	var to_player := GameManager.player.global_position - global_position
	velocity = to_player.normalized() * 80.0
	move_and_slide()
```

Open `enemy.tscn` and run it on its own with F6. It crashes in the first physics frame: `GameManager.player` is null because nothing set it. The enemy scene *looks* self-contained — a body, a sprite, a collision shape, a script — but it has two dependencies that appear nowhere in the scene tree or the inspector. The level has the same problem in reverse: `GameManager` reaches into `current_level.hud`, so the manager can't be exercised without a level either.

Tests are worse. A GUT test that instantiates three enemies and kills one leaves `enemies_alive == 2` and `score == 10` sitting in the Autoload for every test that runs afterwards. Each test now needs a teardown that knows the manager's internals, and the moment two suites run in one process, order matters.

> **Smell:** You can't run a scene on its own with F6. Every scene that names an Autoload has quietly acquired a dependency on project configuration, and every Autoload that stores "the current X" has acquired a dependency on scene order.

## Solution

Keep the Autoload for things that are genuinely global — one per running game, needed by unrelated scenes, meaningless to duplicate. Move everything else to one of three alternatives. The scene tree makes the boundary visible:

```
root (Window)
├── Settings (Autoload)        ← global: read by menus, audio, input
├── AudioBus (Autoload)        ← global: one mixer for the whole game
├── SceneFlow (Autoload)       ← global: owns menu → level → pause
└── Level (current scene)
    ├── HUD
    ├── Player
    └── EnemySpawner
        ├── Enemy              ← knows nothing above EnemySpawner
        └── Enemy
```

### A well-behaved Autoload

Settings is a good Autoload: every scene may read it, no scene owns it, and there is no sense in which two of them could exist. Lazy initialisation needs no locking because only the main thread touches the scene tree, and Autoloads live in it. The first `get_value` call loads the file; every later call hits the cached `ConfigFile`.

```gdscript:title="res://autoload/settings.gd"
extends Node

signal changed(section: String, key: String)

const PATH := "user://settings.cfg"

var _config: ConfigFile

func get_value(section: String, key: String, default: Variant = null) -> Variant:
	if _config == null:
		_config = ConfigFile.new()
		var err := _config.load(PATH)
		if err != OK and err != ERR_FILE_NOT_FOUND:
			push_warning("Settings: could not load %s (%s)" % [PATH, error_string(err)])
	return _config.get_value(section, key, default)

func set_value(section: String, key: String, value: Variant) -> void:
	get_value(section, key)      # guarantees _config exists
	_config.set_value(section, key, value)
	_config.save(PATH)
	changed.emit(section, key)
```

Note what it does not do. It holds no reference to the current scene, calls nothing on the HUD, and has no idea what a `Player` is. Communication runs outward through `changed`. An Autoload that only ever *emits* is one every scene can safely ignore, which is the property that keeps F6 working.

### Alternative 1: signal up, let the owner count

The enemy doesn't need to register anywhere. It emits `died`; whoever spawned it listens. The score lives in the level, which is the thing that actually has a score. This is "call down, signal up" applied to construction: the spawner calls down to configure the enemy, the enemy signals up when something happens.

```gdscript:title="res://enemies/enemy.gd"
class_name Enemy extends CharacterBody2D

signal died(points: int)

@export var points: int = 10
@export var speed: float = 80.0
@export var max_health: int = 30

var target: Node2D      # injected by whoever spawns us
var _health: int

func _ready() -> void:
	_health = max_health

func _physics_process(_delta: float) -> void:
	if not is_instance_valid(target):
		return
	velocity = (target.global_position - global_position).normalized() * speed
	move_and_slide()

func take_damage(amount: int) -> void:
	_health -= amount
	if _health <= 0:
		died.emit(points)
		queue_free()
```

```gdscript:title="res://levels/enemy_spawner.gd"
class_name EnemySpawner extends Node2D

signal all_defeated

const ENEMY_SCENE := preload("res://enemies/enemy.tscn")

@export var target: Node2D             # drag the Player in from the inspector
@export var score_board: ScoreBoard    # drag the HUD's score board in

var _alive: int = 0

func spawn(at: Vector2) -> Enemy:
	var enemy := ENEMY_SCENE.instantiate() as Enemy
	enemy.target = target                 # owner injects into child
	enemy.global_position = at
	enemy.died.connect(_on_enemy_died)
	add_child(enemy)
	_alive += 1
	return enemy

func _on_enemy_died(points: int) -> void:
	_alive -= 1
	score_board.add(points)
	if _alive == 0:
		all_defeated.emit()
```

Now `enemy.tscn` runs alone with F6: with no target it stands still instead of crashing. A GUT test creates a spawner, hands it a plain `Node2D` as the target and a stub `ScoreBoard`, and asserts on `all_defeated` — nothing global to reset, and two suites can run in one process without seeing each other.

### Alternative 2: `@export` the dependency

Where a scene needs something from outside itself, `@export var target: Node2D` says so in the inspector. The level scene wires it by dragging a node in; a test wires it in code. The dependency is visible, typed, and null when unset, which is exactly what a missing dependency should be. The argument is the same one made for constructor injection everywhere else: put the dependency in the signature, not in the body, so the reader can see it without opening the script.

### Alternative 3: `static var` for shared, immutable data

Some things are global because they are *constant*, not because they are *shared state*. A damage-type table, a lookup from tile id to name, a compiled `RegEx` — none of these needs a node in the tree. A `static var` on a `RefCounted` class is reachable through the class name, initialises lazily on first use, and never touches the scene.

```gdscript:title="res://combat/damage_table.gd"
class_name DamageTable extends RefCounted

static var _multipliers: Dictionary[String, float] = {}

static func multiplier(attack: String, armour: String) -> float:
	if _multipliers.is_empty():
		_load()
	return _multipliers.get("%s:%s" % [attack, armour], 1.0)

static func _load() -> void:
	var file := FileAccess.open("res://combat/damage_table.json", FileAccess.READ)
	var rows: Array = JSON.parse_string(file.get_as_text())
	for row: Dictionary in rows:
		_multipliers["%s:%s" % [row.attack, row.armour]] = row.multiplier
```

The rule that keeps this honest: nothing writes to `_multipliers` after `_load`. A `static var` that mutates during play is a singleton with the inspector hidden, and inherits every problem on this page.

## When an Autoload is right

- **Input**: an `InputMap` remapping layer that the settings screen writes and every scene reads through `Input.is_action_pressed`.
- **Settings**: graphics, volume, language — read everywhere, owned nowhere.
- **Audio bus**: one `AudioStreamPlayer` per bus for music and UI sounds, so a scene change doesn't cut the music.
- **Scene flow**: the one owner of menu → loading → level → pause transitions, because *something* must outlive the scene being replaced.

They share a shape: one per game, no scene owns them, and they mostly emit signals outward rather than calling into scenes.

## When to Use

- The thing genuinely must outlive scene changes: music, the transition manager, a network peer.
- Unrelated scenes across the whole game need it and there is no sensible owner in the tree.
- The data is read-only after load. Then a `static var` or a `const` often beats an Autoload entirely.

## When Not to Use

- The "global" is really per-level state: score, enemies alive, the current player. Give it to the level and let children signal up.
- You reach for it because typing `GameManager.` is faster than wiring an `@export`. That saving is paid back the first time you press F6.
- You want scenes and logic testable in isolation. An Autoload is shared state between tests, and GUT or gdUnit4 can't give you a fresh one per test without you writing a reset.
- You need two of them: a second player, a split-screen HUD, a replay running beside the live game. A singleton makes the second one impossible by design.

## The Decision

An Autoload buys you certainty — the instance exists, it's the only one, and any script can find it — at the cost of making every dependency on it invisible. Nothing in `enemy.tscn` shows that it needs `GameManager`; you find out when F6 crashes or when a test leaves a score behind. Passing a reference costs one `@export` or one `setup()` call per dependency, and in exchange the dependency is on screen, typed, and replaceable. For anything a level, a player, or a spawner can reasonably own, the reference wins.

Two Godot-specific traps. First, Autoloads are ready before the main scene, so an Autoload that touches `get_tree().current_scene` in `_ready` finds null; if it must know the scene, it should be told through a signal, not go looking. Second, `static var` is initialised per script, once, for the life of the process — including the editor process if the script is `@tool`. Keep static data immutable after load, or the editor and the running game will disagree about it.

This is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off) in practice. The global isn't free; it's a dependency you took on without writing it into any inspector or signature. If you can't say what the Autoload buys over a passed reference, you didn't decide to use it — you defaulted into it.

## Related Patterns

- **[Service Locator](/patterns/architectural/service-locator)**: the same global reach behind a lookup instead of a name, with a null service for tests. Slightly better disguised, same hidden-dependency tax.
- **[Scene Flow](/patterns/architectural/scene-flow)**: the Autoload that has to exist — someone must own the transition between scenes, because the scene being replaced can't.
- **[Publish/Subscribe](/patterns/architectural/pub-sub)**: an event-bus Autoload lets scenes talk without referencing each other, but hides who talks to whom; prefer direct signals between a parent and its children.
- **[Node Composition](/patterns/architectural/composition)**: the alternative to a manager that knows everything — components that know only their owner and signal up.
- **[Once](/patterns/synchronisation/once)**: when lazy initialisation must be safe from a worker thread, the `if _config == null` check above is no longer enough.
