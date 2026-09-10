---
title: "Event Queue"
description: "Buffer requests — sound effects, damage numbers, spawn orders — in a queue and process them each frame under a budget with deduplication and staleness rules, instead of handling every emit the instant it happens."
---

# Event Queue

**Buys decoupled timing — emit now, process later at a bounded rate; pays in events that go stale before they're handled and a queue that can grow without limit.**

A signal is handled *now*, inside the emitter's call stack, by every listener, in the order they connected. That is the right default for most game logic and the wrong one for anything that arrives in bursts. An Event Queue separates the two halves: producers append a request and return immediately; a single consumer drains the queue on its own schedule — so many per frame, or a fixed time budget, or "when the audio system has a free player". The request is a small value object, which means the consumer can inspect the whole backlog before acting: merge duplicates, drop what is too old, or refuse to grow past a limit.

Godot gives you the pieces but not the pattern. `CONNECT_DEFERRED` moves a handler to the end of the frame, which decouples *when* by one frame and does nothing about *how many*. `call_deferred` is the same. An Event Queue is what you build when the number of events matters as much as their timing.

## Scenario

A bomb kills forty enemies in one physics frame. Each one dies the obvious way:

```gdscript:title="res://enemies/enemy.gd"
func die() -> void:
	AudioManager.play(&"enemy_death", global_position)
	DamageNumbers.spawn(global_position, last_hit)
	Particles.burst(&"blood", global_position)
	queue_free()
```

```gdscript:title="res://autoload/audio_manager.gd"
func play(sound: StringName, at: Vector2) -> void:
	var player := AudioStreamPlayer2D.new()
	player.stream = _library[sound]
	player.global_position = at
	add_child(player)
	player.finished.connect(player.queue_free)
	player.play()
```

Forty identical death sounds start on the same frame. They sum to clipping noise, not a louder death. Forty `AudioStreamPlayer2D` nodes are created and added to the tree inside one `_physics_process`, which is exactly the frame that already has forty `queue_free` calls and forty particle bursts in it. The spike is visible. And the audio system has no say in any of it: it cannot decide that eight simultaneous death sounds are plenty, because by the time it hears about the ninth the first eight are already playing.

> **Smell:** A `play`, `spawn`, or `show` function that does its work synchronously and gets called from a loop, a signal handler, or a collision callback.

## Solution

Producers append requests. One node drains them under a budget.

```
Enemy.die() ─┐
Enemy.die() ─┼─► AudioQueue.request(&"enemy_death", pos) ─► [ring buffer]
Enemy.die() ─┘                                                    │
                                                    _process(): up to 4 per frame
                                                    dedupe same sound this frame
                                                    drop if older than 6 frames
                                                                  ▼
                                                        AudioStreamPlayer2D pool
```

The request is a plain value. It carries when it was made, because staleness is a property of the request, not the queue:

```gdscript:title="res://audio/audio_request.gd"
class_name AudioRequest extends RefCounted

var sound: StringName
var position: Vector2
var frame: int

func _init(p_sound: StringName, p_position: Vector2) -> void:
	sound = p_sound
	position = p_position
	frame = Engine.get_process_frames()
```

The queue is a ring buffer over a fixed-size Array. An `Array.pop_front()` is O(n) — it shifts every remaining element — which is fine for ten items and not for a queue that fills during a burst. Head and tail indices cost nothing:

```gdscript:title="res://autoload/audio_queue.gd"
extends Node

const CAPACITY := 64
const PER_FRAME_BUDGET := 4
const MAX_AGE_FRAMES := 6

@export var library: AudioLibrary

var _buffer: Array[AudioRequest] = []
var _head: int = 0
var _tail: int = 0
var _count: int = 0

var _players: Array[AudioStreamPlayer2D] = []

func _ready() -> void:
	_buffer.resize(CAPACITY)
	for i in 16:
		var p := AudioStreamPlayer2D.new()
		add_child(p)
		_players.append(p)

func request(sound: StringName, at: Vector2) -> void:
	if _count == CAPACITY:
		_drop_oldest()
	_buffer[_tail] = AudioRequest.new(sound, at)
	_tail = (_tail + 1) % CAPACITY
	_count += 1

func _process(_delta: float) -> void:
	var now := Engine.get_process_frames()
	var started_this_frame: Dictionary[StringName, bool] = {}
	var played := 0
	while _count > 0 and played < PER_FRAME_BUDGET:
		var req := _buffer[_head]
		_buffer[_head] = null
		_head = (_head + 1) % CAPACITY
		_count -= 1
		if now - req.frame > MAX_AGE_FRAMES:
			continue                         # stale: the moment has passed
		if started_this_frame.has(req.sound):
			continue                         # duplicate: one death sound is enough
		var player := _free_player()
		if player == null:
			break                            # no player free; leave the rest queued
		player.stream = library.get_stream(req.sound)
		player.global_position = req.position
		player.play()
		started_this_frame[req.sound] = true
		played += 1

func _free_player() -> AudioStreamPlayer2D:
	for p in _players:
		if not p.playing:
			return p
	return null

func _drop_oldest() -> void:
	_buffer[_head] = null
	_head = (_head + 1) % CAPACITY
	_count -= 1
```

The enemy's `die` becomes a one-line request and returns before any sound exists:

```gdscript:title="res://enemies/enemy.gd"
func die() -> void:
	AudioQueue.request(&"enemy_death", global_position)
	queue_free()
```

Three policies are in that `_process`, and each is a decision rather than a detail:

- **Budget.** At most four sounds start per frame. Forty deaths spread over ten frames — imperceptible to a player, invisible to the profiler.
- **Deduplication.** The same sound is not started twice in one frame. Whether "same" means the same id, or the same id within a radius, is a design question; the queue is where the answer lives, because only the queue can see the whole batch.
- **Staleness.** A request older than six frames is dropped. A death sound 100 ms late is wrong; a damage number 100 ms late is fine. Set the age per queue.

### Bounding the queue

The fixed capacity is the fourth policy. When the buffer is full, `request` drops the *oldest* entry on the theory that it is the closest to stale anyway. Other choices are legitimate: drop the newest (it arrived during a burst that is already too loud), or drop by priority (keep the boss roar, lose the footstep). What is not legitimate is an unbounded `Array` that grows across a lag spike, then dumps two seconds of sound effects the moment the frame rate recovers. A queue without a cap is a memory leak with a delay.

### Merging instead of dropping

Deduplication throws the second event away. Sometimes merging is better: forty damage numbers at nearly the same position become one number showing the total. The consumer can do that because it sees the batch:

```gdscript:title="res://ui/damage_number_queue.gd"
func _process(_delta: float) -> void:
	var merged: Dictionary[Vector2i, int] = {}
	while _count > 0:
		var req := _pop()
		var cell := Vector2i(req.position / MERGE_CELL_SIZE)
		merged[cell] = merged.get(cell, 0) + req.amount
	for cell in merged:
		_spawn_number(Vector2(cell) * MERGE_CELL_SIZE, merged[cell])
```

A signal cannot do this. Each listener sees one event at a time and has no way to know that thirty-nine more are behind it.

## Queue or signal?

Use a plain signal when the reaction must be *now* and the count is small: the player took damage, the HUD updates. Use `CONNECT_DEFERRED` when the reaction must be *after the current callback* — freeing the node that emitted, changing the tree during a physics callback — and the count still does not matter. Use an Event Queue when the count matters: bursts, budgets, duplicates, or a consumer that has its own capacity (a pool of players, a fixed number of particle emitters, a network send window).

The three are not exclusive. A common shape is a signal from the emitter, a listener that pushes into a queue, and a consumer that drains it. The signal keeps the emitter decoupled; the queue owns the timing.

## When to Use

- Events arrive in bursts and handling them all at once causes a visible spike or an audible mess.
- The consumer has a real capacity limit: N audio players, N particle systems, N bytes per network tick.
- Duplicate or near-duplicate events should be merged, and merging needs the whole batch.
- Producers run on a worker thread and the consumer is the main thread. Then the queue needs a Mutex — see [Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue).

## When Not to Use

- The reaction must be immediate and synchronous: gameplay logic, hit registration, anything the next line of the caller depends on.
- Events are rare. A queue for something that happens twice a second is a delay with extra steps.
- Order across *different* queues matters. Two queues drained by two nodes give you no ordering guarantee between them; if a sound must follow a particle, put them in one queue or one request.
- You need the event to persist across a scene change or a crash. That is a save, not a queue.

## The Decision

An Event Queue trades immediacy for control. Producers lose the ability to know when — or whether — their request is handled; that is the point, and it is also why the consumer needs explicit staleness and drop policies. The failure mode without them is a queue that silently backs up under load and then replays the past: a burst of hit sounds three seconds after the fight ended, damage numbers floating up from an enemy that is long gone. Every queue should be able to answer "what do I do when I am full" and "when is an entry too old", and the answers should be constants at the top of the file, not emergent behaviour.

The Godot-specific gotcha is the payload. A request that holds a `Node` reference may outlive the node; forty enemies `queue_free` themselves the same frame they request a sound. Copy what you need into the request — a `Vector2`, a `StringName`, an amount — and never store the emitter. If a request must refer to a node, check `is_instance_valid` in the consumer and expect it to be false sometimes.

Draining in `_process` rather than `_physics_process` is deliberate: audio and visual feedback are presentation and should follow the render rate. A queue that feeds the simulation — buffered inputs, spawn orders — belongs in `_physics_process` so it drains at the fixed tick.

This is [tenet #4 — build the simplest thing that could possibly work](/philosophy/build-the-simplest-thing) with a twist: the synchronous `play` was the simplest thing, and it worked until the bomb. The queue is the second version, built for the change you can see.

## Related Patterns

- **[Publish/Subscribe](/patterns/architectural/pub-sub)** and **[Event-Driven](/patterns/architectural/event-driven)**: Both deliver events immediately to every listener. An Event Queue is what one of those listeners builds when it needs to control its own pace.
- **[Rate Limiting](/patterns/architectural/rate-limiting)**: The per-frame budget is a rate limit. Rate Limiting covers the drop-versus-delay decision in depth; a queue is the "delay" branch with a cap.
- **[Command](/patterns/behavioral/command)**: A request is a Command without an `execute`. When the entries need to undo, replay, or be inspected as actions, promote them.
- **[Object Pool](/patterns/creational/object-pool)**: The `_players` array is a pool. Queues and pools pair naturally: the pool's size is the queue's capacity to act.
- **[Deferred Calls](/patterns/concurrency/call-deferred)**: One-frame decoupling with no budget, no dedupe, no cap. Reach for it first; reach for a queue when it is not enough.
- **[Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue)**: The same ring buffer with a Mutex and Semaphore around it, for producers on worker threads.
