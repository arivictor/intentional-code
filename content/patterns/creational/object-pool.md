---
title: "Object Pool"
description: "Pre-instantiate bullets and effects once and recycle them through acquire/release, so bursts of spawning never cost a frame."
---

# Object Pool

**Buys frame-stable spawning for bullets and particles by reusing instances instead of instantiating; pays in reset bugs — a pooled object that remembers its last life fails at the worst time.**

An object pool instantiates a batch of scenes up front and hands them out on demand. When a bullet finishes, it goes back to the pool instead of being freed, and the next shot reuses it. `PackedScene.instantiate()` allocates a node tree, runs `_ready` on every node in it, and registers any physics bodies with the physics server; `queue_free()` unregisters and frees them at the end of the frame. At a few spawns a second that's invisible. At three hundred bullets a second, plus the impact effects, the profiler shows the cost as spikes on exactly the frames the player is busiest.

The pool's guarantee is no allocation on the hot path. Its cost is identity: a pooled bullet is the *same object* across many lives, and every piece of state that changed during one life is still there at the start of the next unless something put it back.

## Scenario

A twin-stick blaster spawns a bullet scene per shot and each bullet frees itself on impact or after two seconds.

```gdscript:title="res://player/blaster.gd"
extends Node2D

const BULLET := preload("res://projectiles/bullet.tscn")

@export var fire_rate: float = 30.0    # bullets per second

var _cooldown: float = 0.0

func _physics_process(delta: float) -> void:
	_cooldown -= delta
	if Input.is_action_pressed("fire") and _cooldown <= 0.0:
		_cooldown = 1.0 / fire_rate
		var bullet := BULLET.instantiate() as Bullet
		bullet.global_position = global_position
		bullet.direction = Vector2.RIGHT
		get_tree().current_scene.add_child(bullet)
```

Each bullet is an `Area2D` with a `Sprite2D` and a `CollisionShape2D`: one instantiate, three `_ready` calls, one area registered with the physics server, and the reverse two seconds later. With the player and three turrets all firing, that's over a hundred instantiations and a hundred frees per second, arriving in bursts. The frame time graph is flat until the first firefight and then saw-toothed for the rest of the level.

> **Smell:** Profiler spikes line up with spawn counts, and the same scene is instantiated and freed hundreds of times a minute. The bullets are interchangeable and short-lived — ideal pool candidates.

## Solution

Make a `BulletPool` node that owns its bullets as children, creates `initial_size` of them at `_ready`, and hands out inactive ones. A bullet that finishes calls `release` on the pool that made it. Bullets stay in the tree the whole time; "inactive" means hidden, not processing, and not colliding.

```
Level (Node2D)
├── Player
│   └── Blaster ──── pool.acquire() ────┐
├── BulletPool (Node)                   │
│   ├── Bullet (inactive) ◄─────────────┘
│   ├── Bullet (active)
│   ├── Bullet (active)
│   └── … 61 more
└── Turrets
```

```gdscript:title="res://projectiles/bullet_pool.gd"
class_name BulletPool extends Node

@export var bullet_scene: PackedScene
@export var initial_size: int = 64
@export var max_size: int = 256        # 0 means unbounded
@export var grow: bool = true

var _free: Array[Bullet] = []
var _total: int = 0

func _ready() -> void:
	for i in initial_size:
		_free.append(_create())

func acquire() -> Bullet:
	var bullet: Bullet
	if _free.is_empty():
		if not grow or (max_size > 0 and _total >= max_size):
			return null                       # the caller decides what to skip
		bullet = _create()
		push_warning("BulletPool grew to %d; raise initial_size" % _total)
	else:
		bullet = _free.pop_back()
	bullet.activate()
	return bullet

func release(bullet: Bullet) -> void:
	if not bullet.is_active():
		return                                # double release: already ours
	bullet.deactivate()
	_free.append(bullet)

func _create() -> Bullet:
	var bullet := bullet_scene.instantiate() as Bullet
	bullet.pool = self
	add_child(bullet)                         # _ready runs once, here
	bullet.deactivate()
	_total += 1
	return bullet
```

The bullet owns its own `activate` and `deactivate`, because only the bullet knows what state it has. `_ready` is for things that happen once per object — connecting signals — and `activate` is for things that happen once per life.

```gdscript:title="res://projectiles/bullet.gd"
class_name Bullet extends Area2D

@export var speed: float = 600.0
@export var lifetime: float = 2.0
@export var pierce: int = 1

var pool: BulletPool
var direction: Vector2 = Vector2.RIGHT

var _age: float = 0.0
var _hits_left: int = 1
var _active: bool = false

func _ready() -> void:
	body_entered.connect(_on_body_entered)    # once per object, never per life

func launch(from: Vector2, dir: Vector2) -> void:
	global_position = from
	direction = dir.normalized()
	rotation = direction.angle()

func is_active() -> bool:
	return _active

func activate() -> void:
	_age = 0.0
	_hits_left = pierce
	modulate = Color.WHITE
	scale = Vector2.ONE
	_active = true
	visible = true
	process_mode = Node.PROCESS_MODE_INHERIT
	set_deferred("monitoring", true)
	set_deferred("monitorable", true)

func deactivate() -> void:
	_active = false
	visible = false
	process_mode = Node.PROCESS_MODE_DISABLED
	set_deferred("monitoring", false)         # can't flip during a physics callback
	set_deferred("monitorable", false)

func _physics_process(delta: float) -> void:
	position += direction * speed * delta
	_age += delta
	if _age >= lifetime:
		pool.release(self)

func _on_body_entered(body: Node2D) -> void:
	if not _active:
		return
	if body.has_method("take_damage"):
		body.take_damage(1)
	_hits_left -= 1
	if _hits_left <= 0:
		pool.release(self)
```

The blaster asks the pool instead of the scene, and decides what to do when the pool says no.

```gdscript:title="res://player/blaster.gd"
extends Node2D

@export var pool: BulletPool               # drag the level's pool in
@export var fire_rate: float = 30.0

var _cooldown: float = 0.0

func _physics_process(delta: float) -> void:
	_cooldown -= delta
	if Input.is_action_pressed("fire") and _cooldown <= 0.0:
		_cooldown = 1.0 / fire_rate
		var bullet := pool.acquire()
		if bullet == null:
			return                            # exhausted and capped: drop the shot
		bullet.launch(global_position, Vector2.RIGHT)
```

### The `reset()` contract

Every field a bullet changes during a life must be put back in `activate()`. That's the whole contract, and it's the whole risk. The cases that get missed:

- **Counters.** `_hits_left` not reset means a piercing bullet that used two of three hits comes back with one and dies on its first contact. It works in the first minute of play and fails in the boss fight, when the pool is finally cycling.
- **Timers and tweens.** A hit-flash `Tween` running when the bullet is released finishes on the *next* life, snapping `modulate` back to white mid-flight. Keep a reference and `kill()` it in `deactivate`; `stop()` any `Timer` child.
- **Visual state.** `modulate`, `scale`, `rotation`, a frame index on an `AnimatedSprite2D` — anything a hit effect touched.
- **Signal connections.** Connect in `_ready`, once. A `connect` in `activate()` without a matching `disconnect` stacks a new connection every life, and the handler runs twice, then three times.
- **Physics.** `monitoring` and `monitorable` are what actually stop an inactive `Area2D` from reporting overlaps. `visible = false` and a disabled `process_mode` do not.

Write the reset as a checklist next to the script's `var` declarations, and write one gdUnit4 test: acquire, mutate every field, release, acquire, assert defaults. The test is ten lines and catches the bug the boss fight would otherwise find.

### Hiding versus removing from the tree

The pool above toggles visibility and process mode. The alternative is `remove_child` on release and `add_child` on acquire. Both work; they trade differently.

Toggling keeps nodes in the tree, so the Remote tab shows 256 bullets and every inactive one still costs a little per frame in tree bookkeeping. It's cheap to flip, `_ready` never runs again, and nothing is orphaned. Its one duty is the explicit physics disable above.

Removing takes the node out of physics and processing automatically, and a smaller tree is cheaper to walk. But an orphaned node is yours to keep: hold the reference in `_free`, and free every inactive one in `_exit_tree`, or the pool leaks them when the level changes. `add_child` also re-sends enter-tree notifications through every child of the bullet, which is more work than a visibility flip. Use it for heavier pooled objects — enemies with `NavigationAgent2D`s, effects with `GPUParticles2D` — where merely being in the tree costs something, and stay with toggling for bullets.

### Growth policy

An empty pool has three honest answers. **Grow** — instantiate one more and warn, so the pool self-tunes during development and `initial_size` is corrected before release. **Refuse** — return null and let the blaster drop the shot, which is the right call for a capped pool in a bullet hell where one missing bullet is invisible. **Recycle the oldest** — keep a list of active bullets and release the front one; correct for bullets, which are nearly expired anyway, wrong for anything whose early death the player would notice. The pool above supports the first two through `grow` and `max_size`; pick per pool, not per project.

## When to Use

- The profiler shows spikes on burst frames that correlate with instantiate and free counts: bullets, shell casings, damage numbers, impact effects.
- The objects are interchangeable and short-lived, with a small, known set of state to reset.
- Instances need to exist in bounded numbers anyway — a cap on bullets is a gameplay decision as much as a performance one.

## When Not to Use

- You haven't profiled. `instantiate()` is not slow; five hundred of them in one frame is. A dozen enemies a minute, pickups, UI panels — instantiate and `queue_free`, and let the engine do its job.
- The object has rich state that's hard to enumerate: an enemy with an AI state machine, inventory, and signal wiring. Reset bugs scale with state, and a fresh instantiate is cheaper than a wrong reset.
- The objects are pure visuals. `GPUParticles2D` pools its own particles on the GPU, and `MultiMeshInstance2D` draws thousands of sprites with no nodes at all. Neither needs you to manage instances.
- The object must survive scene changes, or is unique. A pool is for interchangeable things that live and die inside one level.

## The Decision

A pool trades allocation cost for reset discipline. The allocation cost is measurable: profile before and after and the spikes are gone or they aren't. The reset cost is not — it's a class of bug that appears only under the load the pool was built for, and only for the field you forgot. That asymmetry is why the decision has to be profile-driven. Adding a pool on a hunch takes on the invisible cost without confirming the visible benefit exists.

The Godot-specific part is that inactive nodes are still nodes. A hidden bullet with `process_mode` disabled still has an `Area2D` in the physics space, still receives `_enter_tree`, and still shows up in `get_children()`. Anything that iterates the pool's parent — `get_tree().call_group`, a `propagate_call` — reaches inactive bullets too, so guard handlers with `is_active()` and give the pool its own node so nothing iterates it by accident.

Keep pooled objects small and dumb. A bullet that moves, hits once, and expires has five fields to reset and a five-line test. The moment a pooled object needs a state machine, ask whether it should be pooled at all. This is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off) in practice: the pool is worth it when you can name the frame you're saving and list every field you're resetting, and not before.

## Related Patterns

- **[Prototype](/patterns/creational/prototype)**: a pool that fills from a configured template node via `duplicate()` instead of a `PackedScene`, with the same shared-Resource cautions.
- **[Factory Method](/patterns/creational/factory-method)**: the same `acquire()` call site can front a factory; callers shouldn't know whether they got a fresh instance or a recycled one.
- **[Flyweight](/patterns/structural/flyweight)**: pooled bullets should share their immutable data — sprite, speed, damage — through one Resource; the pool recycles the mutable part.
- **[Rate Limiting](/patterns/architectural/rate-limiting)**: a capped pool that refuses is a rate limiter on spawning; the fire-rate cooldown is the other half of the same bound.
- **[Worker Thread Pool](/patterns/concurrency/worker-thread-pool)**: similar name, different job — that pools threads with a fixed ceiling; this pools nodes with a reset contract.
