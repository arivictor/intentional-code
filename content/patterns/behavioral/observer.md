---
title: "Observer (Signals)"
description: "React to a change in one node from any number of others through signals, without the emitter knowing who is listening."
---

# Observer (Signals)

**Buys clean decoupling — react to a change without the emitter knowing who listens; pays in visibility, connections that outlive their nodes, and an order nobody guarantees.**

Observer defines a one-to-many relationship: a subject changes, and every registered observer hears about it, without the subject knowing who they are. In Godot you don't implement this pattern; you use it. A `signal` is the subject's notification, `connect` registers an observer, `emit` notifies them all. Every `body_entered`, `timeout`, and `pressed` you have ever connected was Observer.

What the page adds is the part the engine doesn't say out loud: what a signal guarantees and what it doesn't. It guarantees that every connected Callable is called, synchronously, with the emitted arguments. It does not guarantee an order you should rely on, it does not clean up a lambda that captured a freed node, and it does not tell you who is listening when you read the emitter's script. The rule that keeps signals healthy is "call down, signal up": a parent calls methods on its children directly; a child emits signals and never reaches up to find who cares.

## Scenario

A player's health drops and three things must react: the HUD bar, a hurt sound, and an achievement counter. The naive version has the player find each of them.

```gdscript:title="res://player/player.gd"
class_name Player extends CharacterBody2D

var health: int = 100

func take_damage(amount: int) -> void:
	health -= amount
	get_node("/root/Main/Hud/HealthBar").value = health
	get_node("/root/Main/Audio").play_hurt()
	Achievements.register_damage_taken(amount)
	if health <= 0:
		get_node("/root/Main").on_player_died()
```

The player now depends on the exact path of the HUD, an audio node, an Autoload, and its own root. Open `player.tscn` on its own and press F6 and it crashes in `take_damage` because `/root/Main` doesn't exist. Move the HUD under a `CanvasLayer` and it crashes again. Adding a fourth reaction (screen shake) means editing the player, which is the one script that should have nothing to do with screens. There is no way to test damage logic without building the whole main scene around it.

> **Smell:** a child scene that contains `get_node("/root/...")` or `get_parent().get_parent()`. It's reaching up. That's a signal waiting to be declared.

## Solution

Move health into a component that owns the data and announces changes. Everything that cares connects to it, and the component never learns their names.

```
Level (Node2D)
├── Player (CharacterBody2D)
│   └── HealthComponent (Node)   ← emits health_changed, died
├── Hud (CanvasLayer)            ← connects, updates the bar
└── AudioDirector (Node)         ← connects, plays the sound
```

```gdscript:title="res://components/health_component.gd"
class_name HealthComponent extends Node

signal health_changed(current: int, maximum: int)
signal died

@export var max_health: int = 100

var health: int:
	set(value):
		var clamped := clampi(value, 0, max_health)
		if clamped == health:
			return
		health = clamped
		health_changed.emit(health, max_health)
		if health == 0:
			died.emit()

func _ready() -> void:
	health = max_health

func take_damage(amount: int) -> void:
	health -= amount
```

The setter is the only place the signal fires, so there is exactly one path from "health changed" to "listeners told". The guard against equal values matters: without it, `take_damage(0)` and repeated `health = 0` would spam the HUD and emit `died` twice.

```gdscript:title="res://ui/hud.gd"
class_name Hud extends CanvasLayer

@onready var _health_bar: ProgressBar = %HealthBar

func bind_health(health: HealthComponent) -> void:
	_health_bar.max_value = health.max_health
	_health_bar.value = health.health
	health.health_changed.connect(_on_health_changed)

func _on_health_changed(current: int, _maximum: int) -> void:
	_health_bar.value = current
	print("[hud] %d" % current)
```

The parent scene does the wiring, because it is the one node that legitimately knows both children exist. This is "call down": the level calls `bind_health` on the HUD and hands it the component.

```gdscript:title="res://levels/level.gd"
extends Node2D

@onready var _player: Player = %Player
@onready var _hud: Hud = %Hud

func _ready() -> void:
	var health: HealthComponent = _player.get_node("HealthComponent")
	_hud.bind_health(health)
	health.died.connect(_on_player_died, CONNECT_ONE_SHOT)
	health.health_changed.connect(_flash_damage, CONNECT_DEFERRED)

func _on_player_died() -> void:
	print("[level] player died, respawning in 2s")
	await get_tree().create_timer(2.0).timeout
	_respawn()

func _flash_damage(_current: int, _maximum: int) -> void:
	%DamageOverlay.modulate.a = 1.0
```

Two flags are doing real work here. `CONNECT_ONE_SHOT` disconnects after the first emission, so the respawn logic can't fire twice if `died` somehow does. `CONNECT_DEFERRED` runs `_flash_damage` at idle time instead of inside the setter; use it when a handler changes the scene tree or wants every other synchronous reaction to have happened first.

Output:

```text
[hud] 100
[hud] 75
[hud] 0
[level] player died, respawning in 2s
```

### Connections that outlive their nodes

When you connect a method (`health.died.connect(_on_player_died)`), Godot records the target object and disconnects the connection automatically when that object is freed. Method connections are safe by default.

Lambdas are different. A lambda is its own Callable; the connection holds the lambda, and the lambda holds whatever it captured. If it captured a node that later got `queue_free`d, the connection survives and the next emission runs code against a freed object:

```gdscript:title="res://levels/level.gd"
# Risky: the lambda captures `popup`; if popup is freed first, this connection
# stays live and errors on the next emission.
health.died.connect(func() -> void: popup.show_defeat())

# Safe: a method on a node the engine can track, disconnected when Hud is freed.
health.died.connect(_hud.show_defeat)
```

The other direction is duplicate connections. A scene that is removed from the tree and added back runs `_enter_tree` again but not `_ready`, and a scene that connects in `_enter_tree` will connect twice. In debug builds Godot errors on a duplicate connection; in release it silently double-fires. Either connect in `_ready` and disconnect in `_exit_tree`, or guard with `is_connected`:

```gdscript:title="res://ui/hud.gd"
func _exit_tree() -> void:
	if _health and _health.health_changed.is_connected(_on_health_changed):
		_health.health_changed.disconnect(_on_health_changed)
```

### Signal bus or direct signal?

A direct signal connects two nodes that share a parent, which is most of them. When the listener is in a different scene entirely — an achievement tracker, an analytics logger, a music system reacting to combat — there is no shared parent to do the wiring, and an Autoload signal bus fills the gap:

```gdscript:title="res://autoload/event_bus.gd"
extends Node

signal enemy_killed(kind: StringName, position: Vector2)
signal player_damaged(amount: int)
```

The bus is [Publish/Subscribe](/patterns/architectural/pub-sub) in one script. It buys fan-out across scenes that never reference each other, and it pays exactly what the one-liner says: nobody can tell from the emitter who reacts. Reserve it for events that are genuinely global. If the listener is a sibling, wire it in the parent and keep the bus small.

### Ordering

Handlers run synchronously in connection order. That is an implementation detail, not a contract: the order depends on which `_ready` ran first, which depends on tree position, which changes when someone drags a node in the editor. If A must run before B, don't connect both to the same signal. Have the parent connect A, and have A's handler call B directly, or have B connect with `CONNECT_DEFERRED` so it runs after every synchronous handler. If you need a handler to run exactly once and then continue in sequence, `await health.died` inside a [coroutine](/patterns/concurrency/coroutines) reads better than a one-shot connection.

## When to Use

- One node changes and several unrelated nodes react: HUD, audio, achievements, camera shake.
- The set of listeners is dynamic. Enemies spawn and despawn; each connects to what it cares about while alive.
- You want the emitter to be runnable on its own. A scene that only emits signals can be opened and tested in isolation.
- A parent needs to know something happened in a child without the child holding a reference up the tree.

## When Not to Use

- Exactly one listener, and it's the parent. A direct method call on a child is clearer than a signal the parent connects to itself, though "signal up" still applies when the child shouldn't know the parent's type.
- The order of reactions matters. Observer doesn't promise one; sequence it explicitly.
- The listener has to answer. Signals are one-way; a signal whose handler writes a result back into the emitter is a method call in disguise.
- The event fires every physics frame for hundreds of nodes. Signal dispatch is cheap, but not free; a direct call or a batched update wins there.

## The Decision

Decoupling is the win, and in Godot it's nearly free: the `HealthComponent` above has no dependency on the HUD, the level, or any Autoload, and it can be dropped into an enemy unchanged. The cost is that you can't read the consequences of `died.emit()` in the file that emits it. Godot's editor helps a little (the Node dock lists connections made in the editor, and `get_signal_connection_list(&"died")` lists them at runtime), but connections made in code are scattered across every listener's `_ready`.

The second cost is lifetime. Method connections clean themselves up; lambda connections and `await` on a signal do not, and the failure is an error in a frame that has nothing to do with the code that caused it. Treat every lambda connection as something you must disconnect, and prefer a named method whenever the handler is more than one line.

The third is the bus temptation. Once an `EventBus` exists, every new feature wants to talk through it, and six months later every system is connected to every other system through one file with forty signals. That's not decoupling, it's coupling you can't see. This is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off) in practice: signals hide who talks to whom, so keep the ones that cross scene boundaries few and loud.

## Related Patterns

- **[Mediator](/patterns/behavioral/mediator)**: The parent that wires siblings together is a mediator, and signals are how it hears from them. Use Mediator when the routing has logic (who gets rewarded when an enemy dies); use bare signals when it's one-to-many and dumb.
- **[Publish/Subscribe](/patterns/architectural/pub-sub)**: The Autoload signal bus. Same mechanism, wider reach, less visibility. Graduate to it only for events that cross scenes.
- **[Event Queue](/patterns/architectural/event-queue)**: Signals fire now, synchronously. When you need to emit now and handle later at a bounded rate, put the event in a queue instead.
- **[Command](/patterns/behavioral/command)**: A signal tells you something happened; a Command is something to do. Handlers that build up a to-do list are Observer feeding Command.
- **[Coroutines](/patterns/concurrency/coroutines)**: `await some_signal` is a one-shot observer that resumes a function. It's the cleanest way to sequence reactions, with the same freed-node hazard as a lambda connection.
