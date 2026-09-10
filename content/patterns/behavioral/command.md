---
title: "Command"
description: "Turn player actions into objects so they can be buffered, replayed, undone with UndoRedo, and remapped without touching the actor."
---

# Command

**Buys undo, replay, input buffering, and remappable controls by turning actions into objects; pays in per-command state that gets expensive — use a plain method call until you need one of those.**

Command wraps a request as an object with an `execute()` method. Once an action is a value rather than a call, you can hold it in an Array, stamp it with a frame number, write it to disk, hand it to a different actor, or ask it to undo itself. In Godot the command is a `RefCounted` (no scene tree needed), the actor is the node it acts on, and the four things you get for the price are exactly the four in the one-liner.

The engine already ships one of them: `UndoRedo` is a Command history with `add_do_method` and `add_undo_method`, used by the editor for every operation it performs. The pattern's guarantee is that the code deciding *when* an action happens (an input handler, a replay, an AI) is separate from the code deciding *what* it does.

## Scenario

A platformer's player reads input and acts on it in the same breath.

```gdscript:title="res://player/player.gd"
class_name Player extends CharacterBody2D

@export var jump_speed: float = 420.0

func _physics_process(delta: float) -> void:
	velocity += get_gravity() * delta
	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = -jump_speed
	if Input.is_action_just_pressed("attack"):
		_attack()
	move_and_slide()
```

This is the right code until the first playtest note comes in: "jump feels unresponsive". The player pressed jump three frames before landing, `is_on_floor()` was false at that instant, and the press was lost. Fixing that here means a timer per action. The second note is a replay for the death cam, which means recording every input with its frame and re-feeding it, and there's nowhere to put that because reading input and acting on it are one line. The third is a co-op mode where the same input handler should drive whichever character is active. Each request is reasonable; each one grows `_physics_process`.

> **Smell:** `Input.is_action_just_pressed` scattered through gameplay code, each site with its own buffering timer.

## Solution

Separate the action from the trigger. A command knows how to act on a `Player`; an input handler knows which command each action maps to and when it was pressed.

```
Player (CharacterBody2D)
├── Sprite2D
├── CollisionShape2D
└── InputHandler (Node)     bindings: {jump → JumpCommand, attack → AttackCommand}
                            buffer:   [(JumpCommand, frame 1042), …]
```

```gdscript:title="res://player/commands/command.gd"
class_name Command extends RefCounted

## Returns true if the command took effect. A false lets the buffer retry
## next frame — that's what makes a jump pressed just before landing work.
func execute(_actor: Player) -> bool:
	return false
```

```gdscript:title="res://player/commands/jump_command.gd"
class_name JumpCommand extends Command

func execute(actor: Player) -> bool:
	if not actor.is_on_floor():
		return false
	actor.velocity.y = -actor.jump_speed
	return true
```

```gdscript:title="res://player/commands/attack_command.gd"
class_name AttackCommand extends Command

func execute(actor: Player) -> bool:
	if actor.is_attacking:
		return false
	actor.start_attack()
	return true
```

The buffer entry pairs a command with the physics frame it was requested on.

```gdscript:title="res://player/commands/buffered_command.gd"
class_name BufferedCommand extends RefCounted

var command: Command
var frame: int

func _init(p_command: Command, p_frame: int) -> void:
	command = p_command
	frame = p_frame
```

```gdscript:title="res://player/input_handler.gd"
class_name InputHandler extends Node

const BUFFER_FRAMES := 6

var bindings: Dictionary[StringName, Command] = {
	&"jump": JumpCommand.new(),
	&"attack": AttackCommand.new(),
}

var _buffer: Array[BufferedCommand] = []

func _unhandled_input(event: InputEvent) -> void:
	for action in bindings:
		if event.is_action_pressed(action):
			_buffer.append(BufferedCommand.new(bindings[action], Engine.get_physics_frames()))

## Called by the actor from _physics_process. Runs what it can, keeps what it
## can't for up to BUFFER_FRAMES frames, and drops the rest.
func drain(actor: Player) -> void:
	var now := Engine.get_physics_frames()
	var kept: Array[BufferedCommand] = []
	for entry in _buffer:
		if entry.command.execute(actor):
			continue
		if now - entry.frame < BUFFER_FRAMES:
			kept.append(entry)
	_buffer = kept
```

```gdscript:title="res://player/player.gd"
class_name Player extends CharacterBody2D

@export var jump_speed: float = 420.0
@onready var _input: InputHandler = $InputHandler

var is_attacking: bool = false

func _physics_process(delta: float) -> void:
	velocity += get_gravity() * delta
	_input.drain(self)
	move_and_slide()
```

Input is collected in `_unhandled_input` (so UI gets first refusal) and applied in `_physics_process` (so the simulation sees it at a fixed rate). A jump pressed three frames early now sits in the buffer, fails `is_on_floor()` for three frames, and succeeds on the fourth. Nobody wrote a timer.

### Remapping

There are two layers of remapping and they are different problems. Which *key* triggers `"jump"` is the engine's job: `InputMap.action_add_event(&"jump", event)` and the Input Map project settings. Which *behaviour* `"jump"` triggers is the command layer's job: `bindings[&"jump"] = DoubleJumpCommand.new()` when the player picks up the boots, and the input handler never changes. Driving a different character is one more assignment: `drain(active_character)`.

### Replay

Because every input is already an object with a frame stamp, recording is a list and playback is a loop. The recorder appends `[frame, action]` as presses arrive; on playback, presses whose frame matches `Engine.get_physics_frames()` (offset to the replay's start) are pushed into the same buffer the live handler uses. The simulation cannot tell the difference, which is the point. That only holds if the simulation is deterministic — fixed physics tick, seeded random — and that's the subject of [Event Sourcing](/patterns/architectural/event-sourcing).

### Undo with `UndoRedo`

For a turn-based tactics game or a level editor, the fourth benefit matters most. Godot's `UndoRedo` takes a pair of Callables per action and manages the history.

```gdscript:title="res://tactics/turn_controller.gd"
class_name TurnController extends Node

var _history := UndoRedo.new()

func move_unit(unit: Unit, to: Vector2i) -> void:
	var from := unit.cell
	_history.create_action("Move %s" % unit.name)
	_history.add_do_method(unit.move_to.bind(to))
	_history.add_undo_method(unit.move_to.bind(from))
	_history.add_do_property(unit, "has_moved", true)
	_history.add_undo_property(unit, "has_moved", false)
	_history.commit_action()
	print("%s (%d, %d) -> (%d, %d)" % [unit.name, from.x, from.y, to.x, to.y])

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"undo") and _history.has_undo():
		_history.undo()
		print("undo -> %s" % _history.get_current_action_name())
	elif event.is_action_pressed(&"redo") and _history.has_redo():
		_history.redo()
```

`commit_action()` runs the do-side immediately, so the caller never applies the change twice. `UndoRedo` also merges consecutive actions of the same name if you ask it to, which is how dragging a slider produces one undo step instead of two hundred.

Output:

```text
Knight (3, 4) -> (5, 4)
undo -> Move Knight
```

## When to Use

- Input must be buffered, so a press slightly before it's valid still counts. Fighting games, platformers, rhythm games.
- You need undo/redo: editors, turn-based games, puzzle games with a "take back move".
- You want replays, ghosts, or a deterministic test that feeds recorded inputs through the real simulation.
- The same input should drive different actors, or the same action should trigger different behaviours as the game progresses.
- An AI and a human player should issue the same actions. The AI produces commands; the input handler produces commands; the actor can't tell.

## When Not to Use

- None of the above applies. `if Input.is_action_just_pressed("jump"): jump()` is the command, and it's [the simplest thing that works](/philosophy/build-the-simplest-thing).
- The "undo" you need is a full state restore, not a reversed operation. That's [Memento](/patterns/behavioral/memento); Command's undo has to know how to invert each action.
- The action is continuous rather than discrete. Movement from `Input.get_vector` every frame doesn't want to be an object; only the events do.

## The Decision

The buffering and remapping benefits are close to free: three small classes and a Dictionary. Undo is where the cost lives. Every undoable command has to capture enough to reverse itself, and for a unit move that's a `Vector2i`; for "delete this room from the level" it's the room's whole subtree, and now every command carries a snapshot. `UndoRedo` holds those Callables and their bound arguments for the life of the history, so an editor with a deep undo stack holds references to everything it ever touched, including nodes you thought you freed. Cap the history, or clear it on level change.

The Godot-specific gotcha is the handoff between input frames and physics frames. `_unhandled_input` can fire zero or several times between two `_physics_process` calls; reading `is_action_just_pressed` inside `_physics_process` can miss a press that arrived and released between ticks. Collecting in `_unhandled_input` and draining in `_physics_process`, as above, is the fix, and Command gives the collected presses somewhere to live.

Undo code is also the least-exercised code in the game. `execute` runs every session; `undo` runs when a tester hits Ctrl+Z. Write the GUT test for the undo path first: it's a `RefCounted` and a bare `Unit.new()`, no tree required. [Listen to the tests](/philosophy/listen-to-the-tests#test-driven-development) — if undo is hard to test, the command is capturing the wrong state.

## Related Patterns

- **[Memento](/patterns/behavioral/memento)**: Command records what happened and reverses it; Memento records what was and restores it. When inverting an action is harder than copying the state, switch.
- **[Event Queue](/patterns/architectural/event-queue)**: The input buffer above is a tiny event queue. When commands need to cross scenes or be processed at a bounded rate, use the full pattern.
- **[Event Sourcing](/patterns/architectural/event-sourcing)**: Replays are Command plus determinism. The commands are the events; the simulation is the projection.
- **[Strategy](/patterns/behavioral/strategy)**: Both wrap behaviour in an object. Strategy is *how* something behaves; Command is *a thing to do* with a time and possibly an inverse.
- **[Chain of Responsibility](/patterns/behavioral/chain-of-responsibility)**: Godot's input propagation decides which node gets to turn an `InputEvent` into a command in the first place.
