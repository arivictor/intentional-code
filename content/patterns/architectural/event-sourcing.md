---
title: "Event Sourcing"
description: "Record the seed and every input as the source of truth and rebuild game state by replaying them through a deterministic simulation, giving you replays, ghosts, and desync debugging from one small file."
---

# Event Sourcing

**Buys replays, ghosts, and debuggable desyncs by recording inputs and events as the source of truth; pays in strict determinism and forever-compatible event formats.**

Event Sourcing stores *what happened* rather than *what things are*. In a game the events are almost always inputs: on tick 412 the player pressed jump; on tick 413 the stick was at (0.7, 0). Give a deterministic simulation the same seed and the same inputs in the same order, and it produces the same state on every tick — so the recording *is* the state, compressed to a few bytes per tick. A replay is playback. A ghost is a second simulation stepping through the same recording beside the live one. A desync in lockstep multiplayer is two machines whose recordings match but whose state does not, and the tick where they diverge is exactly the tick to look at.

The guarantee is total reproducibility, and it is only as good as your determinism. Everything the simulation reads must come from the recording or be derived from it. That rules out `randf()`, `Time.get_ticks_msec()`, `delta` from `_process`, and — usually — the engine's physics servers. In Godot that pushes you towards a simulation you own, stepped at a fixed tick, that nodes only *display* (see [Simulation / Presentation Split](/patterns/architectural/simulation-presentation)). Event Sourcing is what that split is for.

## Scenario

A time-trial racer wants ghost cars and shareable replays. The first implementation records the car's transform every frame:

```gdscript:title="res://replay/frame_recorder.gd"
extends Node

var frames: Array[Transform2D] = []

func _process(_delta: float) -> void:
	frames.append(%Car.global_transform)   # ~60 transforms a second, forever

func save(path: String) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_var(frames)
```

It works for a ghost, badly: two minutes of racing is 7,200 transforms, and the ghost stutters if the replay runs at a different frame rate from the recording. It does not work at all for the thing the team actually needed next. A bug report says "the car clipped through the barrier on lap three"; the transforms show the car on one side and then the other, and nothing about *why*. Later the game adds two-player lockstep and the two clients slowly drift apart; there is no way to tell which one is wrong, or when it went wrong, because neither has anything but its own current state.

> **Smell:** A replay system that records outputs (positions, health, scores) instead of inputs, or a bug that reproduces "sometimes" with the same actions.

## Solution

Record the seed and the inputs. Derive everything else.

```
Live play                                   Replay / ghost
────────────────────────────────            ──────────────────────────────
Input.get_vector(...) ──► InputFrame        recording.frames[tick] ─► InputFrame
        │                     │                                          │
        │        Recording.append(frame)                                 │
        ▼                     ▼                                          ▼
   Simulation.step(frame)  ──────── same code, same seed ────────  Simulation.step(frame)
        │                                                                │
   CarView reads sim.car_state                                   GhostView reads sim.car_state
```

An input frame is a value object. Keep it tiny; it is written once per tick:

```gdscript:title="res://sim/input_frame.gd"
class_name InputFrame extends RefCounted

const ACCEL := 1
const BRAKE := 2
const HANDBRAKE := 4

var steer: float = 0.0       # -1..1
var buttons: int = 0

static func capture() -> InputFrame:
	var f := InputFrame.new()
	f.steer = Input.get_axis("steer_left", "steer_right")
	if Input.is_action_pressed("accelerate"):
		f.buttons |= ACCEL
	if Input.is_action_pressed("brake"):
		f.buttons |= BRAKE
	if Input.is_action_pressed("handbrake"):
		f.buttons |= HANDBRAKE
	return f
```

The recording is a Resource so it can be saved with `ResourceSaver`, loaded with `load`, and inspected. Packed arrays keep it compact — one float and one int per tick:

```gdscript:title="res://replay/recording.gd"
class_name Recording extends Resource

const FORMAT_VERSION := 1

@export var format_version: int = FORMAT_VERSION
@export var game_version: String = ""
@export var track_id: StringName
@export var seed: int = 0
@export var steer: PackedFloat32Array = PackedFloat32Array()
@export var buttons: PackedInt32Array = PackedInt32Array()

func append(frame: InputFrame) -> void:
	steer.append(frame.steer)
	buttons.append(frame.buttons)

func frame_at(tick: int) -> InputFrame:
	var f := InputFrame.new()
	f.steer = steer[tick]
	f.buttons = buttons[tick]
	return f

func tick_count() -> int:
	return steer.size()
```

The simulation is plain code. No nodes, no `delta`, no engine physics. It owns its random number generator and is seeded once:

```gdscript:title="res://sim/race_simulation.gd"
class_name RaceSimulation extends RefCounted

const TICK_RATE := 60
const DT := 1.0 / TICK_RATE

var tick: int = 0
var car: CarState
var track: TrackData
var _rng := RandomNumberGenerator.new()

func _init(p_track: TrackData, seed: int) -> void:
	track = p_track
	_rng.seed = seed
	car = CarState.new()
	car.position = track.start_position

func step(input: InputFrame) -> void:
	car.apply_input(input, DT)
	car.integrate(DT)
	_resolve_track_collision()
	if car.on_gravel:
		car.velocity *= 1.0 - _rng.randf_range(0.01, 0.03)   # seeded: replays match
	tick += 1

func snapshot() -> Dictionary:
	return {"tick": tick, "car": car.to_dict(), "rng": _rng.state}

func restore(snap: Dictionary) -> void:
	tick = snap["tick"]
	car = CarState.from_dict(snap["car"])
	_rng.state = snap["rng"]
```

The recorder samples input at the physics tick, appends it, and steps the simulation. The car node reads the simulation's state and draws it:

```gdscript:title="res://race/race.gd"
extends Node2D

var _sim: RaceSimulation
var _recording: Recording

func _ready() -> void:
	_recording = Recording.new()
	_recording.track_id = track.id
	_recording.seed = randi()                        # the only unseeded call
	_recording.game_version = ProjectSettings.get_setting("application/config/version")
	_sim = RaceSimulation.new(track, _recording.seed)

func _physics_process(_delta: float) -> void:
	var frame := InputFrame.capture()
	_recording.append(frame)
	_sim.step(frame)
	%CarView.present(_sim.car)
```

### Replay and ghost

A replay is the same loop with input read from the recording instead of the keyboard. A ghost is a second simulation running that loop alongside the live one:

```gdscript:title="res://race/ghost.gd"
extends Node2D

var _sim: RaceSimulation
var _recording: Recording

func setup(recording: Recording, track: TrackData) -> void:
	_recording = recording
	_sim = RaceSimulation.new(track, recording.seed)

func _physics_process(_delta: float) -> void:
	if _sim.tick >= _recording.tick_count():
		return
	_sim.step(_recording.frame_at(_sim.tick))
	%GhostView.present(_sim.car)
```

The ghost file for a two-minute lap is about 60 KB — a float and an int per tick — and it plays back correctly at any frame rate, because playback is by tick, not by frame.

### Snapshots for seeking

Replaying from tick zero to reach tick 6,000 is 6,000 steps; fast, but not free, and a scrubbing timeline wants to seek constantly. Store a snapshot every N ticks and replay from the nearest one:

```gdscript:title="res://replay/replay_player.gd"
const SNAPSHOT_INTERVAL := 300   # every five seconds at 60 Hz

var _snapshots: Array[Dictionary] = []

func build_snapshots(recording: Recording, track: TrackData) -> void:
	var sim := RaceSimulation.new(track, recording.seed)
	for t in recording.tick_count():
		if t % SNAPSHOT_INTERVAL == 0:
			_snapshots.append(sim.snapshot())
		sim.step(recording.frame_at(t))

func seek(sim: RaceSimulation, recording: Recording, target_tick: int) -> void:
	var index := target_tick / SNAPSHOT_INTERVAL
	sim.restore(_snapshots[index])
	while sim.tick < target_tick:
		sim.step(recording.frame_at(sim.tick))
```

Snapshots are derived data. They can be rebuilt from the recording at any time, so they are never saved with it and never trusted over it. Note that `snapshot()` includes the generator's `state`: a snapshot that restores the car but not the RNG desyncs on the next gravel patch.

### Debugging a desync

With inputs as the source of truth, a desync is a precise question: on which tick did two simulations that received the same inputs stop agreeing? Hash the state every tick and compare:

```gdscript:title="res://sim/race_simulation.gd"
func state_hash() -> int:
	return hash(snapshot())
```

In lockstep multiplayer each peer sends its `state_hash()` alongside its input for the tick. The first tick where the hashes differ is the bug's address. Attach both peers' recordings to the report, replay both locally to that tick, and diff the snapshots field by field. The same tool finds the barrier clip: replay to the tick the position crosses the wall and step through `_resolve_track_collision` with the exact state that broke it.

## Determinism requirements

Every one of these has caused a replay to drift in a real project:

- **Fixed tick, no `delta`.** The simulation uses `DT`; it is stepped from `_physics_process` (or a loop of your own) and never from `_process`. `Engine.time_scale` and frame drops must not change the number of steps per recorded tick.
- **Seeded randomness, per system.** One `RandomNumberGenerator` per simulation, seeded from the recording. The global `randf()` and `randi_range()` are unseeded and shared with everything else in the game; a particle effect calling `randf()` would perturb your gameplay rolls.
- **No wall clock.** `Time.get_ticks_msec()` and friends are for presentation only.
- **Deterministic iteration.** Iterating a `Dictionary` is insertion-ordered in Godot, so it is fine *if* insertion order is itself deterministic. `get_tree().get_nodes_in_group()` returns tree order, which depends on when nodes were added; do not iterate nodes in the simulation at all.
- **No engine physics in the simulation.** `move_and_slide` and the physics servers are not guaranteed bit-identical across platforms or versions. Use them for presentation collision or write your own integration for the state that matters.
- **Same floats.** A replay recorded on one platform can diverge on another through floating-point differences in `sin`, `pow`, and fused multiply-add. Integer or fixed-point maths removes the risk; if you stay with floats, treat cross-platform replays as best-effort and cross-platform lockstep as a project in itself.

## When to Use

- You want replays, ghosts, or a kill-cam and the game is (or can be made) deterministic.
- Lockstep multiplayer, where exchanging inputs instead of state is the whole design.
- Bug reports that say "sometimes". A recording attached to the report is a reproduction.
- Automated testing of gameplay: a recorded run is an integration test that checks the final state hash.

## When Not to Use

- The simulation cannot be made deterministic without rewriting it, and the payoff is only a cosmetic replay. Record outputs at a low rate and interpolate; it is a worse replay and a far cheaper one.
- The game leans on engine physics for gameplay and has no appetite to own its own.
- You need a save system. Replaying every input since the player installed the game is not how to load a save; snapshot state instead ([Memento](/patterns/behavioral/memento), [Repository](/patterns/architectural/repository)).
- Balance changes ship weekly and old replays must keep working. See the format cost below; it may be more than the feature is worth.

## The Decision

The price is determinism, and determinism is a discipline, not a feature. One unseeded `randf()` in a status effect, one `delta` used in the simulation, one physics query, and replays drift — usually not on the developer's machine, and usually after a patch. Teams that succeed with Event Sourcing treat "the simulation reads only the recording" as a rule enforced in review, and keep the simulation in `RefCounted` classes with no access to the tree, so the tempting APIs are simply not in scope. That constraint is also why those classes test well: a GUT test builds a `RaceSimulation`, feeds it thirty frames, and asserts the state hash.

The second price is the one people underestimate: the recording format is only half the compatibility problem. A replay is reproducible with the *simulation that recorded it*. Change the car's grip constant and every existing ghost is now a lie — it will replay the inputs faithfully into a different track position. Either version the simulation rules alongside the recording (keep the old constants selectable by `game_version`), invalidate recordings on balance changes and tell players, or accept that ghosts are for the current patch only. Pick one before shipping the first replay, because the choice is very hard to change after players have saved thousands of them.

The Godot-specific gotcha is `.tres` from `user://`. Loading a Resource can execute a script embedded in it, so never `load()` a replay another player sent. Store recordings as your own binary layout via `FileAccess.store_var` with `full_objects` left false, or as JSON, and validate the size and version on read.

This is [tenet #7 — hard to test is the design talking](/philosophy/listen-to-the-tests#functional-programming) taken seriously: a simulation that can be replayed is a simulation that is a pure function of its inputs, and that property is what buys everything above.

## Related Patterns

- **[Simulation / Presentation Split](/patterns/architectural/simulation-presentation)**: The precondition. Event Sourcing needs a simulation with no nodes in it; that page is how to get one.
- **[Command](/patterns/behavioral/command)**: An `InputFrame` is a Command that is data rather than an object. Use Command proper when events need to undo or carry behaviour.
- **[Memento](/patterns/behavioral/memento)**: The snapshot. Memento covers the deep-copy discipline that `snapshot()` and `restore()` depend on.
- **[Client-Server Multiplayer](/patterns/architectural/client-server)**: Server-authoritative games send state; lockstep games send inputs. Event Sourcing is the lockstep half, and the desync tooling above is its debugger.
- **[Event-Driven](/patterns/architectural/event-driven)**: Different "event". Event-Driven is about reacting to facts now; Event Sourcing is about storing the facts that produced the state. A game can do both, and they should not share a bus.
- **[Repository](/patterns/architectural/repository)**: Where recordings live on disk and how they are listed and versioned. The Repository is also where a `format_version` check belongs.
