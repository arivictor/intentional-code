---
title: "Publish/Subscribe"
description: "A signal bus autoload — typed signals or named topics — that lets a HUD, a level, and an enemy talk without holding references to each other, and how to keep track of who is talking once they do."
---

# Publish/Subscribe

**Buys one-to-many fan-out across scenes that never reference each other; pays in lost observability — the bus hides who talks to whom.**

Publish/Subscribe is the mechanism under [Event-Driven](/patterns/architectural/event-driven): a place both sides can reach, where a publisher emits without a reference to any subscriber and each subscriber connects without a reference to any publisher. In Godot that place is an Autoload, and the "topics" are either **typed signals** declared on it — `signal enemy_died(enemy: Enemy)` — or **named channels** keyed by a `StringName` with a generic payload. The choice between those two is most of this page.

The distinction from [Observer](/patterns/behavioral/observer) is only where the signal lives. Observer is a signal on the node that owns the state; whoever connects must have a reference to that node, which is easy for a parent and hard for a HUD three scenes away. Pub/Sub moves the signal to a bus so the reference is never needed. That is the whole gain, and it is also the whole cost: a signal on a node tells you who emits it (the node) and where to find the listeners (its connections); a signal on a bus tells you neither.

## Scenario

The HUD needs the player's health. The HUD is a `CanvasLayer` under `Game`; the player is inside whatever level is loaded. The first attempt reaches across:

```gdscript:title="res://ui/hud.gd"
extends CanvasLayer

@onready var _player: Player = get_node("/root/Game/CurrentScene/Level/Player")

func _ready() -> void:
	_player.health_changed.connect(_on_health_changed)
```

That path is a promise about the whole tree. Rename `Level`, load a different level scene, open the HUD on its own, or add a level that spawns the player a frame late, and `get_node` returns null. The next attempt polls — `_process` reads `_player.health` every frame — which fixes nothing about the path and adds a per-frame cost. The one after that puts `health` on a `Global` Autoload the player writes to and the HUD reads from, which works and means the player is now writing UI state.

## Solution

Put a signal where both can reach it.

```
Player (in Level)                 EventBus (Autoload)                 Subscribers
─────────────────                 ──────────────────                 ───────────
take_damage() ──emit──► signal player_health_changed(cur, max) ──► Hud._on_health
                                                                 ──► LowHealthVignette
                                                                 ──► Companion._on_health
                                                                 ──► AudioReactor (heartbeat)
   publisher holds no reference          bus holds connections          subscribers hold none
```

### Typed signals

One signal per fact, with typed arguments, declared on the bus:

```gdscript:title="res://autoload/event_bus.gd"
extends Node

signal player_health_changed(current: int, maximum: int)
signal enemy_died(enemy: Enemy)
signal coin_collected(value: int, at: Vector2)
```

```gdscript:title="res://player/player.gd"
func take_damage(amount: int) -> void:
	health = maxi(health - amount, 0)
	EventBus.player_health_changed.emit(health, max_health)
```

```gdscript:title="res://ui/hud.gd"
extends CanvasLayer

func _ready() -> void:
	EventBus.player_health_changed.connect(_on_health_changed)

func _on_health_changed(current: int, maximum: int) -> void:
	%HealthBar.max_value = maximum
	%HealthBar.value = current
```

The editor autocompletes `EventBus.player_health_changed`, the parser rejects a connection whose handler takes the wrong number of arguments, and `emit` with the wrong types fails at the call. A typo in the signal name is an error at parse time. Every one of those is a bug caught before the game runs, and it is why typed signals should be the default.

### Named channels

The alternative is a generic bus keyed by topic name:

```gdscript:title="res://autoload/topic_bus.gd"
extends Node

var _subscribers: Dictionary[StringName, Array] = {}

func subscribe(topic: StringName, handler: Callable) -> void:
	if not _subscribers.has(topic):
		_subscribers[topic] = []
	_subscribers[topic].append(handler)

func unsubscribe(topic: StringName, handler: Callable) -> void:
	if _subscribers.has(topic):
		_subscribers[topic].erase(handler)

func publish(topic: StringName, payload: Dictionary = {}) -> void:
	if not _subscribers.has(topic):
		return
	for handler: Callable in _subscribers[topic].duplicate():
		if handler.is_valid():
			handler.call(payload)
		else:
			_subscribers[topic].erase(handler)
```

```gdscript
TopicBus.publish(&"player.health_changed", {"current": health, "maximum": max_health})
TopicBus.subscribe(&"player.health_changed", _on_health_changed)
```

Topics can be created at runtime, which is the one thing typed signals cannot do. A mod, a dialogue script, or a data file can publish `&"quest.the_lost_ring.completed"` without anyone having declared it. The price is that nothing is checked: a misspelt topic is a silent no-op, a payload is a `Dictionary` whose keys are a convention, and the `duplicate()` in `publish` exists because a handler that unsubscribes mid-iteration would otherwise corrupt the loop — a bug class typed signals do not have.

Reach for named channels only when the set of topics is genuinely open — mod support, scripting, data-driven quests. For everything the project itself emits, declare a typed signal. The two can coexist on one Autoload, with the typed signals as the API and a single `custom(topic, payload)` signal for the open set.

### When a direct signal is better

If the subscriber can get a reference to the publisher without a global path, connect directly and skip the bus:

- **Parent and child.** `HealthComponent` emits `died`; `Enemy` connects in the editor or in `_ready`. That is "signal up", and it should never go through a bus.
- **Same scene.** A level that owns its `Player` and its `ExitDoor` wires them itself.
- **One subscriber.** A bus with one listener is a global variable with extra steps.

The bus is for the cases that remain: publisher and subscriber in different scenes, loaded at different times, with no owner in common that could introduce them. In practice that is UI listening to gameplay, cross-cutting systems (achievements, audio, analytics), and module-to-module facts.

## The observability problem

Open `hud.gd` and read `EventBus.player_health_changed.connect(...)`. Who emits it? The bus does not know. Open `player.gd` and read the `emit`. Who listens? The bus knows, but the editor's signal panel shows nothing, because the connection was made in code on an Autoload. This is the tax, and there are three ways to pay it.

**Search.** `EventBus.player_health_changed.emit` is a string; grep the project. This is the honest answer most of the time, and it argues for a naming convention that makes the search precise — one signal name, never emitted via a variable.

**Ask the bus.** At runtime, `get_signal_connection_list` lists every subscriber of a signal, and each `Callable` knows its object and method:

```gdscript:title="res://autoload/event_bus.gd"
func debug_dump(signal_name: StringName) -> void:
	for c in get_signal_connection_list(signal_name):
		var cb: Callable = c["callable"]
		print("%s ← %s.%s" % [signal_name, cb.get_object(), cb.get_method()])
```

**Log the emitter.** For "who emitted this" — the question that comes up when a health bar flickers and three scripts might be responsible — wrap the emit in debug builds and print the stack:

```gdscript:title="res://autoload/event_bus.gd"
func emit_traced(sig: Signal, args: Array) -> void:
	if OS.is_debug_build():
		var frame: Dictionary = get_stack()[1]
		print("%s emitted from %s:%d" % [sig.get_name(), frame["source"], frame["line"]])
	sig.emit.callv(args)
```

`get_stack()` only works in debug builds with the debugger attached, which is exactly where you want it. Do not ship a bus that walks the stack on every emit.

### The subscriber that arrived late

A bus signal is not state. If the player emits `player_health_changed` in its `_ready` and the HUD connects in *its* `_ready` a frame later, the HUD has missed it and will show the wrong value until the next hit. Two fixes: the subscriber pulls the current value once on connect (it needs a reference for that — sometimes the right answer is that the bus was the wrong tool here), or the publisher re-emits after the tree settles with `call_deferred`. What you must not do is make the bus remember last values for every signal; that turns it into a state store that every scene depends on and nothing owns.

## When to Use

- Publisher and subscriber live in different scenes with no common owner to wire them.
- Several subscribers with different lifetimes react to one fact.
- A scene must run alone: it emits into a bus that swallows the signal when nobody is listening.
- Topics are data-defined and must be created at runtime — the named-channel case.

## When Not to Use

- A parent and child, or two nodes in one scene. Wire them directly; the editor will even show you the connection.
- The subscriber needs the publisher's current state, not just changes. Give it a reference, or make the fact a property on a model it can read.
- The event must be batched, rate-limited, or delivered later. That is an [Event Queue](/patterns/architectural/event-queue).
- There is one publisher and one subscriber and there always will be. A bus buys nothing.

## The Decision

The pattern trades a reference for a name. The reference was the coupling — the HUD knowing where the player lives — and removing it is what lets scenes be loaded, swapped, and tested independently. The name is a coupling too, just a looser one: every script that emits or connects agrees on `player_health_changed` and its argument list, and the compiler enforces that agreement only for typed signals. Choose typed signals and the trade is close to free. Choose named channels and you have moved the contract from the parser to a `Dictionary` and a comment.

What is lost is the ability to read the flow. A signal on a node has an owner; a signal on a bus has a name and a search. Budget for that: keep the bus to declarations, forbid emitting a bus signal via an alias, and write the `debug_dump` before the first "why did the health bar change" bug rather than during it. And keep the bus flat. The moment `EventBus` has forty signals, split it by module — `CombatEvents`, `UiEvents`, `EconomyEvents` — so that a search for subscribers is a search through one file's worth of names.

This is [tenet #2 — if you can't name the trade-off, you didn't decide](/philosophy/name-the-trade-off): the bus is worth it exactly when the reference it removes would have crossed a scene boundary, and not otherwise.

## Related Patterns

- **[Observer (Signals)](/patterns/behavioral/observer)**: The same signal, on the node that owns the state. Prefer it whenever a reference is available; Pub/Sub is what Observer becomes when the reference is the problem.
- **[Event-Driven](/patterns/architectural/event-driven)**: The style that Pub/Sub delivers. That page covers payload shape, handler order, and re-entrancy; this one covers the bus itself.
- **[Event Queue](/patterns/architectural/event-queue)**: Delivery later and in batches. A subscriber that pushes into a queue is the common combination.
- **[Mediator](/patterns/behavioral/mediator)**: A hub that *knows* the participants and routes with logic, versus a bus that knows only names. When subscribers start needing to be told about each other, you wanted a Mediator.
- **[Singleton (Autoload)](/patterns/creational/singleton)**: The bus is one. The scenes-that-can't-run-alone cost does not apply — a bus with no listeners is harmless — but the hidden-dependency cost does.
- **[MVC / MVP / MVVM](/patterns/architectural/mvc)**: The HUD-reads-player problem has a second answer: a model the UI observes. Use that when the UI needs current state, and the bus when it needs only changes.
