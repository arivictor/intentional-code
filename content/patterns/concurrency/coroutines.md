---
title: "Coroutines"
description: "Write multi-frame logic — cutscenes, attack sequences, dialogue — as straight-line code by awaiting signals and timers on the main thread."
---

# Coroutines

**Buys sequential-looking code for multi-frame logic (cutscenes, attack sequences, dialogue) with no threads; pays in functions that quietly become coroutines and resume on freed nodes.**

A coroutine is a function that can pause in the middle and resume later. In GDScript, any function containing `await` is one. `await some_signal` suspends the function until that signal fires; `await get_tree().create_timer(0.4).timeout` suspends it for 0.4 seconds; `await get_tree().process_frame` suspends it for exactly one frame. While it is suspended the engine keeps rendering, physics keeps stepping, other nodes keep processing. When the awaited thing happens, the function continues from the line after the `await`, on the main thread, with all its local variables intact.

Nothing here is parallel. A coroutine is a way to write "wind up, then swing, then recover" as three lines instead of a phase variable and a countdown you decrement in `_process`. The guarantee is ordering: the line after an `await` runs after the awaited event, and never at the same time as anything else.

## Scenario

A brute enemy has a three-phase attack: a wind-up telegraph, a swing with an active hitbox, and a recovery. Written the way `_process` invites you to write it, the sequence becomes a phase counter and a countdown:

```gdscript:title="res://enemies/brute.gd"
extends CharacterBody2D

@onready var anim: AnimationPlayer = $AnimationPlayer
@onready var hitbox: Area2D = $Hitbox
@onready var telegraph: Sprite2D = $Telegraph

var _phase := 0
var _phase_time := 0.0

func attack() -> void:
	_phase = 1
	_phase_time = 0.4
	telegraph.visible = true

func _process(delta: float) -> void:
	match _phase:
		1:
			_phase_time -= delta
			if _phase_time <= 0.0:
				telegraph.visible = false
				anim.play("swing")
				_phase = 2
		2:
			if not anim.is_playing():
				hitbox.monitoring = true
				_phase = 3
				_phase_time = 0.1
		3:
			_phase_time -= delta
			if _phase_time <= 0.0:
				hitbox.monitoring = false
				_phase = 4
				_phase_time = 0.6
		4:
			_phase_time -= delta
			if _phase_time <= 0.0:
				_phase = 0
```

The sequence is spread across four branches, the timings live in three places, and adding a step means renumbering. Read top to bottom, `_process` tells you nothing about what an attack *is*.

> **Smell:** a `match` on a phase integer, plus a countdown float, plus a `_process` that does nothing but decrement it. That is a coroutine written by hand.

## Solution

Write the sequence as the sequence:

```gdscript:title="res://enemies/brute.gd"
class_name Brute extends CharacterBody2D

signal attack_finished

@onready var anim: AnimationPlayer = $AnimationPlayer
@onready var hitbox: Area2D = $Hitbox
@onready var telegraph: Sprite2D = $Telegraph

var _attacking := false

func attack() -> void:
	if _attacking:
		return
	_attacking = true

	telegraph.visible = true
	await get_tree().create_timer(0.4).timeout        # wind-up

	telegraph.visible = false
	anim.play("swing")
	await anim.animation_finished                     # the swing itself

	hitbox.monitoring = true                          # active frames
	await get_tree().create_timer(0.1).timeout
	hitbox.monitoring = false

	await get_tree().create_timer(0.6).timeout        # recovery
	_attacking = false
	attack_finished.emit()
```

Each `await` hands control back to the engine. Frames render, the player moves, other enemies think. When the timer or the animation finishes, `attack` picks up on the next line. The timings sit next to the steps they time, and the whole attack reads as one paragraph.

`attack` returns to its caller at the first `await`, not at the end. A caller that wants to wait for the whole thing awaits the call:

```gdscript:title="res://enemies/brute_ai.gd"
func _think() -> void:
	if _target_in_range():
		await brute.attack()        # resumes after attack_finished
		await get_tree().create_timer(randf_range(0.5, 1.5)).timeout
```

Awaiting a coroutine call works like awaiting a signal; the value of the expression is whatever the coroutine returned.

### A cutscene

The same tool scales up. A cutscene is a list of things that happen one after another, most of which take time:

```gdscript:title="res://cutscenes/intro_cutscene.gd"
class_name IntroCutscene extends Node

@onready var camera: Camera2D = %Camera
@onready var dialogue: DialogueBox = %DialogueBox
@onready var hero: CharacterBody2D = %Hero
@onready var gate: AnimationPlayer = %GateAnimation

func play() -> void:
	var tw := create_tween()
	tw.tween_property(camera, "position", hero.position, 1.5) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	await tw.finished

	await dialogue.say("Hero", "They said the gate was sealed.")
	await dialogue.say("Guide", "It was.")

	gate.play("open")
	await gate.animation_finished
	await get_tree().create_timer(0.5).timeout

	get_tree().change_scene_to_file("res://levels/level_01.tscn")
```

`dialogue.say` is itself a coroutine: it shows the line, then awaits an `advanced` signal that the box emits when the player presses confirm. The cutscene doesn't know or care how the dialogue box decides it's done.

```gdscript:title="res://ui/dialogue_box.gd"
class_name DialogueBox extends Control

signal advanced

@onready var speaker_label: Label = %Speaker
@onready var line_label: Label = %Line

func say(speaker: String, line: String) -> void:
	speaker_label.text = speaker
	line_label.text = line
	show()
	await advanced
	hide()

func _unhandled_input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_accept"):
		advanced.emit()
		get_viewport().set_input_as_handled()
```

## Functions that quietly become coroutines

There is no keyword marking a coroutine. Add one `await` to a function and every caller's behaviour changes: the call now returns at that `await`, and any code after it in the callee runs later. This bites when the `await` is added for cosmetics:

```gdscript:title="res://components/health_component.gd"
func take_damage(amount: int) -> void:
	_flash.play("hit")
	await _flash.animation_finished     # added for a nicer hit flash
	health -= amount                    # now runs a few frames after the call
	if health <= 0:
		died.emit()
```

A caller that does `enemy.take_damage(50)` and then reads `enemy.health` sees the old value. A caller that checks `if enemy.health <= 0` on the next line to award score sees a living enemy. Nothing warns you.

Two habits keep this in check. Do the state change first and the presentation after the `await`, so callers that don't await still see correct state immediately. And when a function is a coroutine by design — `attack`, `play`, `say` — always `await` it at the call site, even when you don't need the result, so the suspension is visible to whoever reads the caller.

## Resuming on a freed node

A suspended coroutine belongs to the node it was running on. If that node is freed while the coroutine is waiting — the brute dies mid-wind-up and is `queue_free`d — the engine notices when the timer fires: it refuses to resume, prints an error, and drops the coroutine. That's noise rather than a crash, but the lines after the `await` never run. For a node that's gone, fine. For a node that was merely removed from the tree and kept — a pooled enemy — the coroutine *does* resume, and carries on working on a node that's no longer in the game.

The dangerous case is the other way round. The coroutine's own node is alive, but something it captured *before* the `await` is gone:

```gdscript:title="res://enemies/brute.gd"
func lunge_at(target: Node2D) -> void:
	await get_tree().create_timer(0.3).timeout
	if not is_instance_valid(target):       # the player may have died meanwhile
		return
	velocity = (target.global_position - global_position).normalized() * lunge_speed
```

Every `await` is a point where the world may have changed. After one, re-check anything you can't guarantee: `is_instance_valid` for other nodes, `is_inside_tree()` for yourself if the scene may have changed, and your own state flags if the function can be entered twice. [Cancellation](/patterns/concurrency/cancellation) covers the scene-change case in full.

A related trap is silent: awaiting a signal on an object that is then freed. The signal never fires, so the coroutine never resumes. No error, no crash — the function just never finishes, and anything awaiting *it* never resumes either. Put a bound on it with [Await and Timeouts](/patterns/concurrency/await-timeout).

## `await` in `_ready`

`_ready` can be a coroutine, and two uses are common. Waiting one frame lets `Control` layout settle before you read a `size`:

```gdscript
func _ready() -> void:
	await get_tree().process_frame
	_layout_columns(size.x)
```

And a child that needs its parent's `_ready` to have run (children are readied first) can await it:

```gdscript
func _ready() -> void:
	if not owner.is_node_ready():
		await owner.ready
	_register_with(owner as Level)
```

The `is_node_ready` check matters: `ready` fires once. A node added at runtime under a parent that is already ready would await a signal that has already been and gone.

The catch with both is that the engine does not wait. `_process` starts running on the very next frame whether or not your `_ready` has resumed. If `_process` relies on setup that happens after the `await`, call `set_process(false)` at the top of `_ready` and `set_process(true)` at the bottom, or guard with a flag.

## When to Use

- Any logic that spans frames and reads as a sequence: attack phases, cutscenes, dialogue, tutorials, turn order, a "3, 2, 1, go" countdown.
- Waiting for one thing to finish before starting the next: an animation, a tween, a timer, a loading request, a network reply.
- Replacing a `_process` phase machine that exists only to count down and advance.

## When Not to Use

- Behaviour that branches and loops indefinitely (an enemy that patrols, chases, attacks, and retreats depending on the player). That's a [State](/patterns/behavioral/state) machine; a coroutine that tries to be one becomes a `while true` with nested awaits nobody can cancel.
- Anything that must respond every frame. `await get_tree().process_frame` in a loop is `_process` with extra steps and less control.
- Actual heavy computation. `await` yields time to the engine, it doesn't add any. Work that takes 40 ms takes 40 ms; move it to a [Worker Thread Pool](/patterns/concurrency/worker-thread-pool).

## The Decision

The trade is readability now against invisibility later. A coroutine puts a whole sequence in one place, at the cost of hiding that the function returns early, that its remaining lines run in some future frame, and that the world may have moved on by then. The engine gives you no static marker for any of that; a reviewer sees `func attack() -> void` and has to scan the body for `await` to know how it behaves.

The Godot-specific gotchas are worth listing because they're silent. `create_timer` timers keep counting while the tree is paused unless you pass `process_always = false`. A `SceneTreeTimer` cannot be stopped, only ignored. Awaiting a signal with several arguments yields an `Array` of them, not the first one. And a coroutine that is entered twice — `attack()` called again before the first finishes — interleaves two copies of itself with no error, which is why the example guards with `_attacking`.

Against all that, the alternative is the phase machine in the Scenario, which hides nothing because it makes everything explicit and everything tedious. For a linear sequence the coroutine wins comfortably. This is [tenet #4 — build the simplest thing that could possibly work](/philosophy/build-the-simplest-thing) applied to time: three awaits are simpler than a state machine, right up until the sequence stops being linear.

## Related Patterns

- **[Await and Timeouts](/patterns/concurrency/await-timeout)**: a coroutine that awaits a signal that may never fire is stuck forever; race it against a timer.
- **[Cancellation](/patterns/concurrency/cancellation)**: how to stop a coroutine when its scene changes, and why you check `is_instance_valid` after every `await`.
- **[Deferred Calls](/patterns/concurrency/call-deferred)**: the other way to "do this later" — one frame step later, with no suspension. Use it for tree changes the engine won't allow right now.
- **[State](/patterns/behavioral/state)**: for behaviour that branches and repeats rather than runs once from top to bottom.
- **[Observer (Signals)](/patterns/behavioral/observer)**: signals are what coroutines wait on; a well-named signal is a coroutine's natural resume point.
