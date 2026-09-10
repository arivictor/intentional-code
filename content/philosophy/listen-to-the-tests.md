---
title: Hard to test is the design talking — listen to it
nav_title: Listen to the tests
description: TDD is a design discipline first; the tests it leaves behind are a byproduct.
order: 7
---

# Hard to test is the design talking — listen to it

Tests call your function with nothing but the public surface, no insider knowledge, no sympathy for how the internals happen to work. So when a test is miserable to write, when it needs a whole level instantiated, or an Autoload configured, or a real file on disk to check a damage formula, that pain is the design speaking plainly: the boundaries are in the wrong place, this script knows too much, the dependencies are concrete where they should be abstract.

> [!IMPORTANT] If you find yourself struggling to write a test, the problem is the design, not the test.

The mistake is to treat the symptom. Reaching for a heavier test harness to subdue a stubborn test, building the scene tree in `before_each`, stubbing `get_tree()`, is like turning up the radio to drown out the engine noise. The fix is upstream, in the design. Move the rule out of the node and into a `RefCounted` class. Pull the side effect out of the calculation. Pass the dependency in instead of reaching for `/root/`. Do that and the test gets easy — because the design got better.

That's the whole reason testability is worth caring about: "easy to test" and "easy to change" turn out to be the same property viewed from two angles, and the test is the cheapest place to feel the difference early. In Godot the dividing line is sharp. Logic that lives in a `RefCounted` or `Resource` class can be tested by GUT or gdUnit4 with nothing but `.new()`. Logic that lives in a `Node` needs a tree, a `_ready`, and every sibling the script reaches for.

## Test-Driven Development

The tightest way to keep this feedback loop running is to write the test first: let the difficulty of the test push on the design before the code hardens around a bad shape. The common framing is that TDD is a testing practice: you do it to end up with good test coverage. That is only half true. The real product of TDD is the design pressure, the act of writing the test first forces you to shape the code well (small classes, injectable dependencies, clear behaviour boundaries). The test suite you end up with is a side effect, a byproduct.

TDD is a design discipline and the discipline is the order.

1. Red (write a failing test for behaviour that doesn't exist yet),
2. Green (the smallest code that makes it pass),
3. Refactor (clean up under the safety of a green test).

You must never write production code without a failing test first; and you must never refactor without green.

> The real product of TDD is the design pressure, the act of writing the test first forces you to shape the code well

GDScript is duck-typed, so the pressure shows up immediately. Where you need a seam, you define a small base class and write a plain fake for it in the test. No mocking framework, no scene tree. Here the seam is between the game's save logic and the disk:

```gdscript:title="res://systems/save_storage.gd"
# In production code — a small base class where you need a seam.
class_name SaveStorage extends RefCounted

func write(slot: int, data: Dictionary) -> Error:
	return ERR_UNAVAILABLE

func read(slot: int) -> Dictionary:
	return {}
```

```gdscript:title="res://systems/file_save_storage.gd"
class_name FileSaveStorage extends SaveStorage

func write(slot: int, data: Dictionary) -> Error:
	var file := FileAccess.open("user://save_%d.json" % slot, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(data))
	return OK
```

```gdscript:title="res://systems/save_service.gd"
class_name SaveService extends RefCounted

var _storage: SaveStorage

func _init(storage: SaveStorage) -> void:
	_storage = storage

func save_game(slot: int, player: PlayerState) -> Error:
	return _storage.write(slot, player.to_dict())
```

```gdscript:title="res://test/unit/test_save_service.gd"
# In the test — a simple fake, not a mock framework.
extends GutTest

class FakeSaveStorage extends SaveStorage:
	var writes: Array[Dictionary] = []

	func write(slot: int, data: Dictionary) -> Error:
		writes.append({"slot": slot, "data": data})
		return OK

func test_save_game_writes_player_state_to_slot() -> void:
	var storage := FakeSaveStorage.new()
	var service := SaveService.new(storage)

	service.save_game(1, PlayerState.new())

	assert_eq(storage.writes.size(), 1)
	assert_eq(storage.writes[0]["slot"], 1)
```

Nothing in that test touches the scene tree, `user://`, or an Autoload. The same move gives you a fake `Clock` for cooldowns, a fake `InputSource` for a replay, a fake `Rng` with a fixed sequence for a loot table. This is the tenet running in reverse: an easy test is evidence of a good seam. The classic anti-pattern proves the same point from the other side — if a test needs to instantiate the level scene to check a rule, the rule is in the wrong script. Move it, and the test gets simple because the design did.

See also: [Strategy](/patterns/behavioral/strategy), [Repository](/patterns/architectural/repository), [Clean Architecture](/patterns/architectural/clean-architecture).

## Functional Programming

The other way to make code testable is to give it less to hide. A pure function — output determined entirely by its inputs, no reaching into shared state, no clock, no file access, no `get_node` — is testable by construction: no setup, no fakes, no order-dependence. GDScript isn't a functional language, but the ideas that make code predictable port directly. Godot already hands you the biggest one: `_process(delta)` takes time as a parameter instead of reading it.

```gdscript
# IMPURE — depends on the engine clock; the answer changes while you watch it.
func is_buff_expired(buff: Buff) -> bool:
	return Time.get_ticks_msec() >= buff.expires_at_msec  # hidden input

# PURE — the current time is a parameter. The function is deterministic.
# In tests, pass any moment you like.
func is_buff_expired_at(buff: Buff, now_msec: int) -> bool:
	return now_msec >= buff.expires_at_msec
```

The impure version forces a test to wait in real time, or to fake a static engine call it cannot fake; the pure one takes the moment as an argument and becomes trivially testable. The same instinct drives the rest: a loot roll that takes a `RandomNumberGenerator` with a seed instead of calling `randf()`, a damage formula that takes an `AttackData` and an `ArmourData` and returns an `int` without touching either node, a `Resource` that is treated as immutable once loaded so that no enemy's stats can drift from the `.tres` on disk. The less hidden state a function touches, the less a test (or a future reader) has to reconstruct. Take the ideas that make code clearer and leave the rest; immutability is a tool.

> **Smell:** A function returns different results when called twice with the same arguments. A method mutates a field a worker thread reads without a Mutex. You must configure an Autoload before calling a function in a test. A formula calls `randf()` or `Time.get_ticks_msec()` halfway down.

See also: [Composition over Inheritance](/philosophy/borrowed-abstraction#composition-over-inheritance), [TDD](/philosophy/listen-to-the-tests#test-driven-development), [Simulation / Presentation Split](/patterns/architectural/simulation-presentation).
