---
title: "Event-Driven"
description: "Let gameplay announce facts — an enemy died, an item was picked up, a level was cleared — on an EventBus autoload or through groups, so achievements, audio, analytics, and tutorials react without the emitter knowing they exist."
---

# Event-Driven

**Buys producer/consumer decoupling so achievements, audio, and analytics react without the emitter knowing; pays in flow you can't read top-to-bottom and handlers that must tolerate any order.**

Event-Driven is the decision that gameplay code announces *what happened* and stops there. An enemy dies and says so. It does not know that an achievement counts kills, that the tutorial is waiting for the first one, that analytics wants the weapon used, or that a quest needs three more. Those systems listen, and the enemy's script is the same length whether there are zero of them or twelve.

In Godot the mechanism is a signal on something everyone can reach — an `EventBus` Autoload with one typed signal per fact — or a group call, where the group name is the topic and every member implements a handler. Both are in-process and synchronous: `emit` runs every connected handler before it returns. There is no broker, no queue, and no persistence. The style is Event-Driven; the delivery is a plain function call the emitter cannot see.

## Scenario

An action RPG's enemy started with a `die` function that freed itself. Six months later it looks like this:

```gdscript:title="res://enemies/enemy.gd"
func die() -> void:
	AchievementTracker.on_enemy_killed(data.id)
	QuestLog.progress_kill(data.id)
	Analytics.track(&"enemy_killed", {"id": data.id, "weapon": last_hit.weapon_id})
	if TutorialFlow.is_active():
		TutorialFlow.enemy_killed()
	AudioManager.play(data.death_sound, global_position)
	LootSpawner.drop(data.drop_table, global_position)
	get_parent().on_child_enemy_died(self)   # the arena counts survivors
	queue_free()
```

Eight systems, and the enemy names every one. Adding "the companion character comments on kills" means editing `enemy.gd` — and `boss.gd`, and `turret.gd`, which have their own copies of this list, each slightly out of date. The enemy scene cannot run alone: open `enemy.tscn` and press play and it errors on the first Autoload it reaches for. Tests for the enemy need the achievement system quiet. And the arena's `get_parent().on_child_enemy_died(self)` means the enemy only works under a parent with that method.

> **Smell:** A function whose body is a list of calls to systems that do not need each other, or a `queue_free` at the end of a paragraph of notifications.

## Solution

The enemy emits one fact. Everything else subscribes.

```
Enemy.die() ──► EventBus.enemy_died.emit(event) ──┬──► AchievementSystem._on_enemy_died
                                                  ├──► QuestSystem._on_enemy_died
                                                  ├──► AnalyticsSystem._on_enemy_died
                                                  ├──► TutorialSystem._on_enemy_died  (one-shot)
                                                  ├──► AudioReactor._on_enemy_died
                                                  └──► Arena._on_enemy_died
                          the emitter knows none of these exist
```

The bus is an Autoload with typed signals and nothing else. Its whole job is to exist and be reachable:

```gdscript:title="res://autoload/event_bus.gd"
extends Node

signal enemy_died(event: EnemyDiedEvent)
signal item_picked_up(item: ItemData, by: Node2D)
signal level_completed(level_id: StringName, time: float)
signal player_damaged(amount: int, source: StringName)
```

The payload is a value, not the emitter. The enemy is about to be freed; a handler that stores the node or defers work on it would be holding a corpse. Copy what listeners need:

```gdscript:title="res://events/enemy_died_event.gd"
class_name EnemyDiedEvent extends RefCounted

var enemy_id: StringName
var position: Vector2
var weapon_id: StringName
var was_boss: bool

static func from(enemy: Enemy) -> EnemyDiedEvent:
	var e := EnemyDiedEvent.new()
	e.enemy_id = enemy.data.id
	e.position = enemy.global_position
	e.weapon_id = enemy.last_hit.weapon_id if enemy.last_hit else &""
	e.was_boss = enemy.data.is_boss
	return e
```

```gdscript:title="res://enemies/enemy.gd"
func die() -> void:
	EventBus.enemy_died.emit(EnemyDiedEvent.from(self))
	queue_free()
```

Each consumer is its own node, connects in `_ready`, and knows nothing about the others:

```gdscript:title="res://systems/achievement_system.gd"
class_name AchievementSystem extends Node

var _kills: Dictionary[StringName, int] = {}

func _ready() -> void:
	EventBus.enemy_died.connect(_on_enemy_died)

func _on_enemy_died(event: EnemyDiedEvent) -> void:
	_kills[event.enemy_id] = _kills.get(event.enemy_id, 0) + 1
	if _kills[event.enemy_id] == 100:
		Services.achievements.unlock(&"centurion_" + event.enemy_id)
```

```gdscript:title="res://systems/tutorial_system.gd"
class_name TutorialSystem extends Node

func _ready() -> void:
	EventBus.enemy_died.connect(_on_first_kill, CONNECT_ONE_SHOT)

func _on_first_kill(_event: EnemyDiedEvent) -> void:
	%Prompt.show_text("Enemies drop loot. Walk over it to collect.")
```

```gdscript:title="res://systems/analytics_system.gd"
class_name AnalyticsSystem extends Node

func _ready() -> void:
	EventBus.enemy_died.connect(func(e: EnemyDiedEvent) -> void:
		Services.analytics.track(&"enemy_killed", {"id": e.enemy_id, "weapon": e.weapon_id}))
	EventBus.level_completed.connect(func(id: StringName, t: float) -> void:
		Services.analytics.track(&"level_completed", {"id": id, "time": t}))
```

The arena, which used to require a specific parent method, now listens like everyone else:

```gdscript:title="res://levels/arena.gd"
func _ready() -> void:
	EventBus.enemy_died.connect(_on_enemy_died)

func _on_enemy_died(event: EnemyDiedEvent) -> void:
	_alive -= 1
	if _alive == 0:
		EventBus.level_completed.emit(level_id, _elapsed)
```

Godot removes signal connections when the receiving object is freed, so a node that connected a method in `_ready` does not need to disconnect in `_exit_tree`. Lambdas are the exception: a lambda that captured `self` keeps the connection alive only as long as the bus does, and the bus is an Autoload. If a lambda-connected node can be freed, connect a method instead, or disconnect explicitly.

### The group variant

Groups are Event-Driven with no Autoload. The group name is the topic and the method name is the contract:

```gdscript:title="res://enemies/enemy.gd"
func die() -> void:
	get_tree().call_group(&"enemy_died_listeners", &"on_enemy_died", EnemyDiedEvent.from(self))
	queue_free()
```

```gdscript:title="res://systems/quest_system.gd"
func _ready() -> void:
	add_to_group(&"enemy_died_listeners")

func on_enemy_died(event: EnemyDiedEvent) -> void:
	_progress_kill_objectives(event.enemy_id)
```

Groups are worth it when the listeners are scene-local (every enemy in the level reacting to an alarm) or when you want zero global state. They cost you static typing: `call_group` takes a method name as a string, misspell it and nothing happens, and there is no signature check. For project-wide facts the typed bus wins; for "tell everything in this room", groups win.

## Handlers must tolerate any order

Signals call handlers in connection order, and connection order is `_ready` order, which is tree order, which changes when someone reorders nodes in the editor. Three rules keep that from mattering:

1. **A handler never depends on another handler having run.** The achievement system must not read a kill count the quest system maintains. Each derives what it needs from the event.
2. **A handler does not mutate the event.** It is shared with every listener after it.
3. **A handler that emits another event should expect re-entrancy.** `enemy_died` → `Arena` emits `level_completed` → a listener of that spawns the next wave → enemies are added while `enemy_died` handlers are still running. It works, and it surprises. Use `call_deferred` to emit from inside a handler when the chain touches the tree.

If order genuinely matters — the save system must snapshot *after* the quest updates — that is one listener that does both in sequence, not two listeners and a prayer.

## When to Use

- One fact has several independent reactions, and the emitter should not change when a reaction is added.
- Reactions are cross-cutting: achievements, audio, analytics, tutorial, telemetry, screen shake.
- Scenes must run alone. The enemy scene emits into a bus that swallows the event when nobody listens.
- Feature modules need to react to each other without referencing each other.

## When Not to Use

- One producer, one consumer, and they are parent and child. A direct signal on the child — "signal up" — is the same decoupling with no global.
- The caller needs a result. Events are fire-and-forget; a function that must know whether the pickup was accepted calls a method.
- The reaction must happen at a bounded rate or in batches. That is an [Event Queue](/patterns/architectural/event-queue).
- The event must survive a scene change or a crash. That is a save. Nothing on a bus persists.

## The Decision

The trade is legibility for locality. Before, you could read `die()` and know everything that happens when an enemy dies. After, you cannot; you have to find every connection to `enemy_died`, and the editor will not show you connections made in code. Adding a reaction became a one-file change, and understanding the whole reaction became a project-wide search. That is a good trade when reactions are many and independent, and a bad one when the flow is a sequence someone needs to reason about — a boss fight's phase transitions should be a [State](/patterns/behavioral/state) machine you can read, not six listeners on `boss_health_changed`.

The Godot-specific gotchas are about lifetime. The emitter is usually about to `queue_free`, so payloads must be values. Handlers run synchronously inside `emit`, so a handler that adds or removes nodes during a physics callback trips the engine's "flushing queries" error — defer those. And the bus is an Autoload, which means every emitter and every listener depends on it; keep it to signal declarations so that dependency stays trivial. A bus that grows methods, state, or a `Dictionary` of "last values" has become the god object the pattern was meant to prevent.

Everything here is in-process and synchronous. There is no persistence, no retry, no delivery guarantee beyond "every connected handler ran before `emit` returned". That is a feature. The moment the game needs events to cross a network, they are messages with a schema, and [Client-Server Multiplayer](/patterns/architectural/client-server) is the page.

This is [tenet #9 — make the next change local](/philosophy/keep-changes-local#separation-of-concerns): the next achievement should be one new script, and `enemy.gd` should not know it was added.

## Related Patterns

- **[Observer (Signals)](/patterns/behavioral/observer)**: The primitive. A signal on one node observed by nodes that have a reference to it. Event-Driven is Observer with the reference replaced by a well-known bus.
- **[Publish/Subscribe](/patterns/architectural/pub-sub)**: The bus itself — how to shape it, typed versus named signals, and how to find out who emitted what. Event-Driven is the style; Pub/Sub is the mechanism.
- **[Event Queue](/patterns/architectural/event-queue)**: Same decoupling, different timing. When handlers must run later, in batches, or under a budget.
- **[Mediator](/patterns/behavioral/mediator)**: The alternative when reactions need coordinating rather than just notifying. A Mediator knows the participants; a bus does not.
- **[Event Sourcing](/patterns/architectural/event-sourcing)**: Records events as the source of truth. Do not confuse the two: a bus event is a notification, not a stored fact, and a replay system should not be listening to `EventBus`.
- **[Feature Modules](/patterns/architectural/feature-modules)**: The bus is how modules talk without importing each other. It is also how they quietly couple through payload shapes, so version those with care.
- **[Singleton (Autoload)](/patterns/creational/singleton)**: The bus is one. Read that page for the cost, and keep the bus to signals so the cost stays small.
