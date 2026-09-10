---
title: "State"
description: "Give each player or enemy state its own script under a StateMachine node, with enter/exit/update hooks and transitions by name."
---

# State

**Buys isolated per-state behaviour so adding a state is one new script; pays in class proliferation and a state–owner cycle that surprises newcomers.**

State lets a node change its behaviour when its internal state changes, by delegating to a separate object per state instead of branching on a flag in every method. In Godot the idiomatic shape is a `StateMachine` node with one `State` child per state. Each child gets the same four hooks — `enter`, `exit`, `update`, `physics_update` — and the machine forwards the engine's callbacks to whichever child is current. Transitions are requested by name, so a state knows the *names* of its neighbours and nothing else about them.

The guarantee is that everything the player does while jumping lives in `jump.gd`, and adding a wall-slide is a new file and a new child node, not a new branch in five methods. The engine's own `AnimationTree` state machine is the same idea applied to animation, and the two work best side by side rather than one standing in for the other.

## Scenario

A platformer's player started with a `match` and grew a few booleans.

```gdscript:title="res://player/player.gd"
class_name Player extends CharacterBody2D

enum Mode { IDLE, RUN, JUMP, FALL }

var mode := Mode.IDLE
var is_dashing := false
var is_attacking := false
var can_double_jump := true

func _physics_process(delta: float) -> void:
	velocity += get_gravity() * delta
	match mode:
		Mode.IDLE:
			if not is_attacking and Input.is_action_just_pressed("jump"):
				mode = Mode.JUMP
				velocity.y = -jump_speed
			elif not is_dashing and Input.get_axis("move_left", "move_right") != 0.0:
				mode = Mode.RUN
		Mode.RUN:
			# ... the same jump check, copied
		Mode.JUMP:
			if is_dashing:
				pass  # dashing while jumping? nobody decided
	move_and_slide()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("attack") and mode != Mode.JUMP and not is_dashing:
		is_attacking = true
	# ...
```

The `match` in `_physics_process` is one of three: `_unhandled_input` has another, the animation update has a third. The booleans combine in ways nobody designed. `is_dashing and is_attacking and mode == Mode.JUMP` is a state, it's just one that has no name and no code. Every new ability adds a flag, and every flag has to be checked in every branch of every `match`. The transitions are implicit: to learn when the player leaves `RUN`, you read the whole file.

> **Smell:** booleans named `is_*` that have to be checked against each other before any of them can be set.

## Solution

One node per state, one script per state, one machine that forwards to the current one.

```
Player (CharacterBody2D)
├── Sprite2D
├── CollisionShape2D
├── AnimationPlayer
└── StateMachine (Node)       initial_state → Idle
    ├── Idle (State)
    ├── Run (State)
    ├── Jump (State)
    └── Fall (State)
```

```gdscript:title="res://player/states/state.gd"
class_name State extends Node

signal transition_requested(to: StringName)

var player: Player

func enter(_previous: StringName) -> void:
	pass

func exit() -> void:
	pass

func handle_input(_event: InputEvent) -> void:
	pass

func update(_delta: float) -> void:
	pass

func physics_update(_delta: float) -> void:
	pass
```

```gdscript:title="res://player/states/state_machine.gd"
class_name StateMachine extends Node

signal state_changed(from: StringName, to: StringName)

@export var initial_state: State

var _current: State
var _states: Dictionary[StringName, State] = {}

## Called by the owner from its _ready, so the owner's @onready vars are set.
func start(player: Player) -> void:
	for child in get_children():
		var state := child as State
		if state == null:
			continue
		_states[state.name] = state
		state.player = player
		state.transition_requested.connect(_change_state)
	_change_state(initial_state.name)

func _unhandled_input(event: InputEvent) -> void:
	if _current:
		_current.handle_input(event)

func _process(delta: float) -> void:
	if _current:
		_current.update(delta)

func _physics_process(delta: float) -> void:
	if _current:
		_current.physics_update(delta)

func _change_state(to: StringName) -> void:
	assert(_states.has(to), "Unknown state: %s" % to)
	var from: StringName = _current.name if _current else &""
	if _current:
		_current.exit()
	_current = _states[to]
	_current.enter(from)
	state_changed.emit(from, to)
```

The machine is the only thing that calls `enter` and `exit`, so they always pair. States ask for a transition by emitting `transition_requested` with a node name; the machine looks it up. That is "signal up": a state never holds a reference to the machine.

```gdscript:title="res://player/states/idle.gd"
extends State

func enter(_previous: StringName) -> void:
	player.animation_player.play(&"idle")
	player.velocity.x = 0.0

func physics_update(delta: float) -> void:
	player.velocity += player.get_gravity() * delta
	player.move_and_slide()
	if not player.is_on_floor():
		transition_requested.emit(&"Fall")
	elif Input.is_action_just_pressed(&"jump"):
		transition_requested.emit(&"Jump")
	elif Input.get_axis(&"move_left", &"move_right") != 0.0:
		transition_requested.emit(&"Run")
```

```gdscript:title="res://player/states/jump.gd"
extends State

func enter(_previous: StringName) -> void:
	player.animation_player.play(&"jump")
	player.velocity.y = -player.jump_speed

func physics_update(delta: float) -> void:
	player.velocity.x = Input.get_axis(&"move_left", &"move_right") * player.speed
	player.velocity += player.get_gravity() * delta
	player.move_and_slide()
	if player.velocity.y >= 0.0:
		transition_requested.emit(&"Fall")
```

```gdscript:title="res://player/states/fall.gd"
extends State

func enter(_previous: StringName) -> void:
	player.animation_player.play(&"fall")

func physics_update(delta: float) -> void:
	player.velocity.x = Input.get_axis(&"move_left", &"move_right") * player.speed
	player.velocity += player.get_gravity() * delta
	player.move_and_slide()
	if player.is_on_floor():
		transition_requested.emit(&"Run" if player.velocity.x != 0.0 else &"Idle")
```

Emitting a transition calls `_change_state` synchronously, so `exit` and the next state's `enter` run *inside* the emitting state's `physics_update`. Put transition checks last, or `return` straight after emitting; code after the emit runs in a state that has already exited.

The player owns the data the states share and starts the machine once its own `@onready` references exist.

```gdscript:title="res://player/player.gd"
class_name Player extends CharacterBody2D

@export var speed: float = 200.0
@export var jump_speed: float = 420.0

@onready var animation_player: AnimationPlayer = $AnimationPlayer
@onready var state_machine: StateMachine = $StateMachine

func _ready() -> void:
	state_machine.state_changed.connect(_on_state_changed)
	state_machine.start(self)

func _on_state_changed(from: StringName, to: StringName) -> void:
	print("%s -> %s" % [from, to])
```

Output:

```text
 -> Idle
Idle -> Run
Run -> Jump
Jump -> Fall
Fall -> Idle
```

### The enum variant

For a machine with a handful of states and one line of behaviour each, four scripts is too many. An enum plus a single `_enter_state` function keeps the transitions explicit without the node tree.

```gdscript:title="res://world/door.gd"
class_name Door extends StaticBody2D

enum State { CLOSED, OPENING, OPEN, CLOSING }

var _state := State.CLOSED

@onready var _anim: AnimationPlayer = $AnimationPlayer

func interact() -> void:
	match _state:
		State.CLOSED:
			_enter_state(State.OPENING)
		State.OPEN:
			_enter_state(State.CLOSING)

func _enter_state(next: State) -> void:
	_state = next
	match _state:
		State.OPENING:
			_anim.play(&"open")
		State.CLOSING:
			_anim.play_backwards(&"open")

func _on_animation_player_animation_finished(_name: StringName) -> void:
	match _state:
		State.OPENING:
			_enter_state(State.OPEN)
		State.CLOSING:
			_enter_state(State.CLOSED)
```

The rule for graduating from this to the node version: when a state's behaviour stops fitting in one `match` arm, or when a third `match` on the same enum appears in the file.

### `AnimationTree`

`AnimationTree` with an `AnimationNodeStateMachine` is a state machine for *presentation*: it blends between clips with travel paths and cross-fade times. It is tempting to make it the gameplay machine as well, reading `get_current_node()` to decide whether the player may jump. Don't. Animation transitions take time and follow paths; gameplay transitions are instant. Keep the gameplay machine authoritative and let it drive the animation one:

```gdscript:title="res://player/player.gd"
@onready var _playback: AnimationNodeStateMachinePlayback = $AnimationTree.get("parameters/playback")

func _on_state_changed(_from: StringName, to: StringName) -> void:
	_playback.travel(to.to_lower())
```

### Hierarchical states

`Idle` and `Run` above duplicate the "fall if not on floor, jump if pressed" checks. Give them a shared parent class and the duplication goes away:

```gdscript:title="res://player/states/grounded_state.gd"
class_name GroundedState extends State

## Returns true if a transition was requested; callers should return.
func check_grounded_transitions() -> bool:
	if not player.is_on_floor():
		transition_requested.emit(&"Fall")
		return true
	if Input.is_action_just_pressed(&"jump"):
		transition_requested.emit(&"Jump")
		return true
	return false
```

`Idle` and `Run` then `extends GroundedState` and call `if check_grounded_transitions(): return` before their own checks. This is a hierarchy by inheritance, which covers most games. A hierarchy by nesting — `Grounded` as a node with `Idle` and `Run` as *its* children, and the machine calling `enter` on the whole ancestor path — is worth it around ten states with several layers, not before.

## When to Use

- A node's behaviour differs sharply by state, and there are more than three states or more than a line or two of behaviour per state.
- The same `match` on a state field appears in `_physics_process`, `_unhandled_input`, and somewhere else.
- Booleans like `is_dashing` and `is_attacking` are being checked against each other before either can be set.
- Designers or other programmers add states regularly: bosses with phases, NPCs with schedules, a player with an expanding move set.

## When Not to Use

- Two or three states with trivial behaviour. A `bool` or the enum variant is [the simplest thing](/philosophy/no-pattern#kiss).
- The states are really a sequence with no branching (intro → play → outro). A [coroutine](/patterns/concurrency/coroutines) with `await` reads as the sequence it is.
- The transitions are a table, not code: `Dictionary[State, Dictionary[Event, State]]`. When behaviour per state is uniform and only the graph varies, a table beats a script per state.
- What's changing is selected from outside (a designer picks the movement). That's [Strategy](/patterns/behavioral/strategy).

## The Decision

Each state is one file that can be read in isolation, and adding one touches nothing else. The costs are the ones in the one-liner. A player with twelve moves is twelve scripts plus the machine, and someone new to the project has to learn that `player` on a state points back at the node that owns the machine that owns the state. That cycle is normal for the pattern and it's the first thing that surprises people.

The Godot-specific gotchas are about timing. States run inside the machine's `_physics_process`, so a transition emitted mid-function runs `exit` and `enter` before the function returns; check transitions last. `Input.is_action_just_pressed` inside `physics_update` can miss presses between physics ticks; route input through `handle_input` from `_unhandled_input`, or buffer it as a [Command](/patterns/behavioral/command). And an `await` inside a state (a dash that lasts 0.2 seconds) keeps running after the state has exited, unless you check that you're still current when it resumes; counting `delta` in `physics_update` is duller and safer.

Node-based states are also testable: `Idle.new()` with a bare `Player.new()` assigned to `player` can have `physics_update` called directly under GUT, no tree needed, as long as the state doesn't read `Input`. That's an argument for passing input into states rather than reading it globally, which is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off): global `Input` is convenient in the state and expensive in the test.

## Related Patterns

- **[Strategy](/patterns/behavioral/strategy)**: Both delegate to an interchangeable object. Strategy is chosen from outside; a State decides for itself when to hand over. If the objects know their successors, it's State.
- **[Command](/patterns/behavioral/command)**: Buffered commands feed a state machine cleanly: the state drains the buffer in `physics_update` and decides which commands apply in this state.
- **[Template Method](/patterns/behavioral/template-method)**: `State` is a template class: the machine owns the skeleton (`enter`/`physics_update`/`exit`), the subclasses fill in the hooks.
- **[Observer (Signals)](/patterns/behavioral/observer)**: `transition_requested` and `state_changed` are the pattern's whole wiring. The HUD and the `AnimationTree` listen to `state_changed` without the states knowing.
- **[Coroutines](/patterns/concurrency/coroutines)**: For linear sequences, `await` beats a machine; for a machine, avoid `await` inside states.
