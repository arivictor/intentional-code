---
title: "MVC / MVP / MVVM"
description: "Split the HUD and menus into a model that emits signals, Control scenes that only draw, and a presenter or view-model between them, so the UI reacts to change instead of polling it every frame."
---

# MVC / MVP / MVVM

**Buys UI that reflects state through signals instead of polling and a model testable without Controls; pays in indirection — more scripts, more wiring.**

All three patterns separate *what the game knows* from *what the screen shows*, and differ only in what sits between. The **Model** is the state and the rules: a `PlayerStats` `Resource` or a `RefCounted` that emits a signal when something changes. The **View** is a `Control` scene — labels, bars, buttons — that knows how to draw a value and nothing about where it came from. The third thing is the join:

- **MVC** — a *Controller* takes input (button presses, hotkeys) and calls the model. The view observes the model directly.
- **MVP** — a *Presenter* sits between both: it subscribes to the model, formats, and calls methods on the view; the view is dumb enough to fake in a test.
- **MVVM** — a *ViewModel* exposes view-shaped properties and signals; the view binds to them, in Godot's case through an `@export` and a setter that rewires connections.

In Godot the model is what you test without a scene tree, the view is what you build in the editor, and the join is where the temptation to poll in `_process` goes to die.

## Scenario

A HUD that reads the player every frame:

```gdscript:title="res://ui/hud.gd"
extends CanvasLayer

@onready var _player: CharacterBody2D = get_node("/root/Main/World/Player")

func _process(_delta: float) -> void:
	%HealthBar.max_value = _player.max_health
	%HealthBar.value = _player.health
	%GoldLabel.text = "%d g" % Global.gold
	%AmmoLabel.text = "%d / %d" % [_player.weapon.ammo, _player.weapon.clip_size]
	if _player.health < 0.25 * _player.max_health:
		%HealthBar.modulate = Color.RED
	else:
		%HealthBar.modulate = Color.WHITE
```

Every frame: three string allocations, four property reads through an absolute node path, and a colour decision that re-runs sixty times a second whether or not anything changed. The HUD cannot run without a `/root/Main/World/Player` in the tree, so the UI scene will not open on its own and cannot be tested. And the pause menu, which needs the same numbers, has grown its own copy of the same `_process`.

> **Smell:** `_process` in a `Control` script that only assigns `text` and `value`. Presentation is polling for a change nobody told it about.

## Solution

Make the model announce changes. Make the view react. Put a thin object between them so neither knows the other's shape.

```
┌────────────────┐   signals    ┌──────────────────┐   calls    ┌─────────────────┐
│  PlayerStats   │ ───────────► │   HudPresenter   │ ─────────► │  Hud (Control)  │
│  (Resource)    │              │   (RefCounted)   │            │  labels, bars   │
│  health_changed│              │  formats, decides│            │  show_health()  │
│  gold_changed  │ ◄─────────── │  colour, text    │ ◄───────── │  heal_pressed   │
└────────────────┘   method     └──────────────────┘  signals   └─────────────────┘
        ▲  calls
        │  (Controller: input → model)
```

### The model

A `Resource` so designers can seed a `.tres` for testing the HUD in isolation, with signals in the past tense.

```gdscript:title="res://player/player_stats.gd"
class_name PlayerStats extends Resource

signal health_changed(current: int, maximum: int)
signal gold_changed(gold: int)
signal died

@export var max_health: int = 100:
	set(value):
		max_health = maxi(value, 1)
		health = mini(health, max_health)
		health_changed.emit(health, max_health)

@export var health: int = 100:
	set(value):
		var clamped := clampi(value, 0, max_health)
		if clamped == health:
			return
		health = clamped
		health_changed.emit(health, max_health)
		if health == 0:
			died.emit()

@export var gold: int = 0:
	set(value):
		if value == gold:
			return
		gold = value
		gold_changed.emit(gold)

func is_low() -> bool:
	return health < max_health / 4
```

Setters emit only on actual change, so a `_physics_process` that assigns the same value each tick does not spam the UI.

### The view

The `Control` scene has no idea a `PlayerStats` exists. It exposes methods to show things and signals for what the user did.

```gdscript:title="res://ui/hud.gd"
class_name Hud extends CanvasLayer

signal heal_pressed

func _ready() -> void:
	%HealButton.pressed.connect(heal_pressed.emit)

func show_health(current: int, maximum: int, low: bool) -> void:
	%HealthBar.max_value = maximum
	%HealthBar.value = current
	%HealthBar.modulate = Color.RED if low else Color.WHITE

func show_gold(text: String) -> void:
	%GoldLabel.text = text

func show_dead() -> void:
	%DeathOverlay.visible = true
```

Because it depends on nothing, the HUD scene opens and runs on its own in the editor, and a designer can restyle it without a player in the tree.

### The presenter (MVP)

```gdscript:title="res://ui/hud_presenter.gd"
class_name HudPresenter extends RefCounted

var _stats: PlayerStats
var _view: Hud

func _init(stats: PlayerStats, view: Hud) -> void:
	_stats = stats
	_view = view
	_stats.health_changed.connect(_on_health_changed)
	_stats.gold_changed.connect(_on_gold_changed)
	_stats.died.connect(_view.show_dead)
	_view.heal_pressed.connect(_on_heal_pressed)
	# Push the initial state once; no polling after this.
	_on_health_changed(_stats.health, _stats.max_health)
	_on_gold_changed(_stats.gold)

func _on_health_changed(current: int, maximum: int) -> void:
	_view.show_health(current, maximum, _stats.is_low())

func _on_gold_changed(gold: int) -> void:
	_view.show_gold("%d g" % gold)

func _on_heal_pressed() -> void:
	if _stats.gold >= 10:
		_stats.gold -= 10
		_stats.health += 25
```

The presenter is the only script that knows both sides. Formatting ("%d g"), the low-health colour decision, and the heal rule all live here, which means they are testable with a fake view:

```gdscript:title="res://test/unit/test_hud_presenter.gd"
extends GutTest

class FakeHud extends Hud:
	var health_calls: Array = []
	var gold_text: String = ""
	func _ready() -> void:
		pass   # no %HealButton in a fake
	func show_health(current: int, maximum: int, low: bool) -> void:
		health_calls.append([current, maximum, low])
	func show_gold(text: String) -> void:
		gold_text = text

func test_low_health_flag_set_below_quarter() -> void:
	var stats := PlayerStats.new()
	var view := FakeHud.new()
	var presenter := HudPresenter.new(stats, view)
	stats.health = 20
	assert_eq(view.health_calls.back(), [20, 100, true])
	view.free()

func test_heal_costs_ten_gold() -> void:
	var stats := PlayerStats.new()
	stats.gold = 15
	stats.health = 50
	var view := FakeHud.new()
	var presenter := HudPresenter.new(stats, view)
	view.heal_pressed.emit()
	assert_eq(stats.gold, 5)
	assert_eq(stats.health, 75)
	assert_eq(view.gold_text, "5 g")
	view.free()
```

`FakeHud` is a `CanvasLayer` that is never added to a tree, so it must be freed by hand — `queue_free` needs a tree to defer to. A `RefCounted` view interface avoids even that; the price is losing `class_name Hud` as the view's type.

### Wiring and the controller (MVC)

```gdscript:title="res://main.gd"
extends Node

var _hud_presenter: HudPresenter

func _ready() -> void:
	var stats: PlayerStats = %Player.stats
	_hud_presenter = HudPresenter.new(stats, %Hud)

func _unhandled_input(event: InputEvent) -> void:
	# Controller: input goes to the model, never to the view.
	if event.is_action_pressed("quick_heal"):
		%Player.stats.health += 25
		get_viewport().set_input_as_handled()
```

Hold the presenter in a variable. It is `RefCounted`; if nothing references it, it is freed and every connection it made goes with it.

## The MVVM variant: `@export` bindings

MVVM removes the presenter class and makes the *view* bind to a view-model through a property. In Godot the binding is an `@export` with a setter that disconnects the old model and connects the new one — so the same `Hud` scene can be pointed at a real `PlayerStats` in the game or a test `.tres` in the editor.

```gdscript:title="res://ui/hud_bound.gd"
extends CanvasLayer

@export var stats: PlayerStats:
	set(value):
		if stats != null and stats.health_changed.is_connected(_on_health_changed):
			stats.health_changed.disconnect(_on_health_changed)
			stats.gold_changed.disconnect(_on_gold_changed)
		stats = value
		if stats == null:
			return
		stats.health_changed.connect(_on_health_changed)
		stats.gold_changed.connect(_on_gold_changed)
		if is_node_ready():
			_refresh()

func _ready() -> void:
	_refresh()

func _refresh() -> void:
	if stats == null:
		return
	_on_health_changed(stats.health, stats.max_health)
	_on_gold_changed(stats.gold)

func _on_health_changed(current: int, maximum: int) -> void:
	%HealthBar.max_value = maximum
	%HealthBar.value = current
	%HealthBar.modulate = Color.RED if stats.is_low() else Color.WHITE

func _on_gold_changed(gold: int) -> void:
	%GoldLabel.text = "%d g" % gold
```

Drop a `debug_stats.tres` into the exported slot and the HUD is fully live in the editor with `@tool`, or in an isolated UI test scene. Assign `%Player.stats` at runtime and it follows the real player. Formatting has moved back into the view, so what you test is the model; the view is verified by looking at it.

### Common mistakes

- **Connecting in `_process`.** A `connect` every frame stacks handlers; the emission fires N times. Connect once, in `_ready` or a setter, and guard with `is_connected`.
- **The model holding a node.** `PlayerStats` with `var owner_node: CharacterBody2D` is a model that cannot be tested and cannot be a `.tres`. Signals go up; references never go down from model to view.
- **Emitting from the view.** `%HealthBar.value_changed.connect(func(v): stats.health = v)` turns a display into an input path. Route user intent through the presenter or controller so the rule ("heal costs gold") runs.
- **Sharing one `.tres` model across two players.** Both HUDs react to both players. Call `duplicate()` on the `Resource` per instance, or build the model at runtime.

## When to Use

- A `Control` script has a `_process` that only assigns `text`, `value`, or `visible`. Signals replace it and the allocations vanish.
- The same numbers appear on two screens (HUD, pause menu, death screen). One model, three views, no duplicated reads.
- You want the UI scene to open and run on its own — for designers, for screenshots, for a UI test — without the whole game underneath it.
- A formatting or threshold rule ("low health is under 25%") needs a test.

## When Not to Use

- A label that shows a value set once (`%TitleLabel.text = level.name`). There is no change to react to.
- A debug overlay that prints twenty engine counters. Polling in `_process` is the honest implementation; there is no model.
- A jam-sized UI with one screen. Wire the button to the player directly and split later if a second screen arrives.

## The Decision

The win is that the UI becomes *reactive*: it does work when something changes and idles otherwise. The scene tree can be full of Controls and the per-frame cost is zero until a signal fires. And because the model is a `Resource` with no node inside it, every rule that used to hide in a `_process` — formatting, thresholds, the heal cost — has somewhere to live that a GUT test can reach.

The price is three scripts where there was one, and wiring that has to be right. The presenter must be held in a variable or it is collected; the `@export` setter must disconnect before it connects or a re-assigned model doubles every handler; a model shared through a `.tres` is shared by every scene that loads it. None of that is hard, but all of it is invisible in the editor, which is where UI people live.

Choose by who owns the join. If a programmer owns the formatting and it needs tests, MVP — the presenter is a plain class. If designers own the screen and want to point it at test data, MVVM — the `@export` binding is inspector-friendly. MVC's controller is just "input handlers call the model", which you will have either way. Whichever you pick, the rule that pays is the same one: [keep changes local](/philosophy/keep-changes-local#separation-of-concerns) — a colour change touches the view, a threshold change touches the model, and neither touches the other.

## Related Patterns

- **[Observer (Signals)](/patterns/behavioral/observer)**: the mechanism under every arrow here. The model is an emitter; the presenter and view are observers.
- **[Mediator](/patterns/behavioral/mediator)**: a presenter that starts routing between *several* views and models has become a mediator. Fine, if you name it and keep it small.
- **[Layered](/patterns/architectural/layered)**: MVC/MVP/MVVM is the internal structure of the presentation layer. The model here is the top of the game-logic layer.
- **[Command](/patterns/behavioral/command)**: the controller's input path grows into commands when you need undo, remapping, or replay.
- **[Publish/Subscribe](/patterns/architectural/pub-sub)**: when the HUD needs to react to things that are not on one model — an achievement, a quest update, a loot drop — a bus replaces direct signal connections.
