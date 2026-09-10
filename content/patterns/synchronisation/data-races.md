---
title: "Data Races"
description: "What a data race is in GDScript terms, why count += 1 is three steps, what Godot's debug thread guards do and don't catch, and how to reproduce a race on purpose with a stress test."
---

# Data Races

**Buys early, loud failure by keeping thread-safety checks on in debug builds; pays in a detector that catches only the interleavings it observes — the discipline is yours.**

A data race is two threads touching the same memory at the same time, with at least one of them writing. The result is undefined: the right answer, a wrong answer, a torn value, or a crash — and which one you get changes between runs, machines, and builds. Races are the most expensive bug in threaded code because the symptom almost never appears where the cause lives, and because the interleaving that triggers it may not happen on your machine at all.

This page is the foundation for the rest of the family. [Mutex](/patterns/synchronisation/mutex), [Snapshot](/patterns/synchronisation/snapshot), [Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership), [Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue) — each exists to make a race impossible. It also names what Godot does for you: the debug builds check that nodes are touched from the right thread, and that is all. There is no race detector for your own variables. The discipline is the tool.

## Scenario

A loot roll runs across the [Worker Thread Pool](/patterns/concurrency/worker-thread-pool) — four hundred tasks, each rolling one drop and counting rare results into a shared tally:

```gdscript:title="res://loot/loot_stats.gd"
class_name LootStats extends RefCounted

var rare_count: int = 0

func roll_all(rolls: int) -> int:
	var gid := WorkerThreadPool.add_group_task(_roll_one, rolls)
	WorkerThreadPool.wait_for_group_task_completion(gid)
	return rare_count

func _roll_one(_index: int) -> void:
	if randf() < 0.1:
		rare_count += 1   # data race
```

Ten percent of four hundred rolls is forty, give or take the dice. Call `roll_all(400)` and the count is right most of the time, and every so often it's thirty-eight. The dice didn't change; two increments were lost.

`rare_count += 1` looks like one step. It's three: read the current value into a temporary, add one, write the temporary back. When two pool threads read `12` at the same moment, both compute `13`, and both write `13`. Two increments, one result. There's no line you can point at and say "the race is here" — the race is in the interleaving, not the source.

> **Smell:** A variable is read or written from a `Thread` callable or a pool task *and* from anywhere else, and you can't point at the Mutex, the deferred call, or the ownership rule that orders the two. "They'll probably never collide" is a probability, not a guarantee, and four hundred tasks is a lot of trials.

## Solution

Make the read-modify-write indivisible. A [Mutex](/patterns/synchronisation/mutex) does exactly that — one thread in the critical section at a time, so the three steps of `+= 1` can't interleave with another thread's:

```gdscript:title="res://loot/loot_stats.gd"
class_name LootStats extends RefCounted

var _mutex := Mutex.new()
var _rare_count: int = 0

func roll_all(rolls: int) -> int:
	var gid := WorkerThreadPool.add_group_task(_roll_one, rolls)
	WorkerThreadPool.wait_for_group_task_completion(gid)
	return _rare_count   # safe: every task has finished; the join orders it

func _roll_one(_index: int) -> void:
	if randf() < 0.1:
		_mutex.lock()
		_rare_count += 1
		_mutex.unlock()
```

Better still is to not share the counter at all. Give each task its own slot and add them up after the [join](/patterns/synchronisation/join):

```gdscript:title="res://loot/loot_stats.gd"
func roll_all(rolls: int) -> int:
	var hits: Array[int] = []
	hits.resize(rolls)                         # sized BEFORE the tasks start
	var gid := WorkerThreadPool.add_group_task(
		func(i: int) -> void: hits[i] = 1 if randf() < 0.1 else 0, rolls)
	WorkerThreadPool.wait_for_group_task_completion(gid)
	return hits.reduce(func(sum: int, h: int) -> int: return sum + h, 0)
```

Each task writes `hits[i]` — its own index — and nothing else. No lock, no race, and no contention on a hot path. Resizing *before* the tasks start is the detail: `resize()` during the batch would be a write to the Array itself, racing with every task. The order of preference for any race is the same as here: don't share; if you must share, hand off; if you must genuinely share over time, lock.

## What Godot checks for you

Debug builds and the editor carry **thread guards** on Node methods and on the servers behind them. Call `add_child`, `queue_free`, `get_node`, or a property setter that reaches the rendering or physics server from a thread that isn't the main thread, and you get:

```text
ERROR: Caller thread can't call this function in this node (/root/Level/Enemies/Grunt3). Use call_deferred() or call_thread_group() instead.
   at: (scene/main/node.cpp)
```

The call is skipped, the node path is in the message, and you can fix it in a minute. Keep these checks on. `Thread.set_thread_safety_checks_enabled(false)` disables them for the calling thread; the only reason to call it is that you have read the engine source for a specific call and know it's safe from that specific thread. Calling it to silence an error is disabling the smoke alarm because it went off.

Be precise about what the guard is. It checks *which thread is calling a node*. It does not check *whether two threads touch the same variable*. The `rare_count` race above triggers nothing — `LootStats` is a `RefCounted`, `rare_count` is a script variable, and no guard exists for script variables. The same is true of a Dictionary shared between a worker and `_process`, an Array appended from two tasks, or a `bool` flag used as a hand-off. Godot catches the crossing into the tree; races on your own data are yours to prevent.

Release builds compile the guards out. A thread that touched a node "harmlessly" in debug because the guard skipped the call will actually perform the call in release, on a structure the main thread is using. This is why the fix for a guard error is always to move the call, never to disable the guard.

## Discipline in place of a detector

With no race detector for script data, correctness comes from three rules, applied in order:

1. **Main-thread ownership for nodes.** Only the main thread reads or writes anything in the scene tree. Workers take plain values in and hand plain values out through `call_deferred()`. The debug guard backs this rule up; nothing backs up the next two. See [Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership).
2. **Immutable hand-off for data.** A value crosses threads once, and the sender never touches it again. Return it from the `Thread` callable, deliver it with `call_deferred()`, push it through a [Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue), or publish a [Snapshot](/patterns/synchronisation/snapshot). If you `duplicate()` before sending and never mutate after, there is nothing to race on.
3. **A Mutex for the rest.** State that both sides genuinely need to mutate over time — a cache, a tally, a claimed-set — lives in a class that bundles the [Mutex](/patterns/synchronisation/mutex) with the data, and every access goes through the lock.

Two things to internalise: **a single statement is not atomic.** `count += 1`, `dict[key] = value`, `array.append(x)`, and `flag = true` are all several operations at the machine level, and GDScript makes no promise about any of them across threads. And **there are no atomics to reach for.** Other languages offer an atomic integer for the counter case; GDScript's answer is the mutex, or not sharing.

## Reproducing a race on purpose

A race that "works on my machine" is still a race. Since no tool will find it, write a test that gives it the best possible chance to fail. The recipe: many threads, a tight loop, a shared variable, and an assertion on the exact expected result.

```gdscript:title="res://tests/test_loot_stats.gd"
extends GutTest

const TASKS := 8
const ITERATIONS := 20_000

var _stats: SharedCounter   # the class under test, Mutex inside

func test_counter_survives_contention() -> void:
	_stats = SharedCounter.new()
	var gid := WorkerThreadPool.add_group_task(_hammer, TASKS)
	WorkerThreadPool.wait_for_group_task_completion(gid)
	assert_eq(_stats.value(), TASKS * ITERATIONS)

func _hammer(_task_index: int) -> void:   # pool thread
	for _n: int in ITERATIONS:
		_stats.increment()
```

Point this test at a version of `SharedCounter` with the lock removed and it fails within a few attempts — 160,000 increments across eight threads lose updates almost every time. Point it at the locked version a hundred times and it passes a hundred times. That is the closest thing to a race detector you have: a stress test, kept in the suite, that turns "probably fine" into a number.

Repeat it. A race is probabilistic, and a test that passed once proves only that one interleaving was fine. Both GUT and gdUnit4 can repeat a test; make the contention tests loop, and treat a single failure in a hundred runs as a real bug, not a flake.

## When to Use

- Every time a `Thread` or a pool task touches anything it didn't create itself. Ask which of the three rules covers each access; if none does, it's a race.
- Any new thread-safe class. Write the stress test first, watch it fail without the lock, then add the lock.
- Reviewing a threading change. "Where's the lock, the deferred call, or the ownership rule for this variable?" is the whole review.

## When Not to Use

- Coroutines. `await` yields to the engine, but everything before and after it runs on the main thread. Two coroutines interleave only at `await` points, and there's no race between them — just ordering questions, which are [Coroutines](/patterns/concurrency/coroutines) territory.
- Code that never spawns a thread. If your game uses `await`, signals, and `call_deferred` and nothing else, nothing on this page applies, and adding a Mutex "to be safe" is noise.
- `WorkerThreadPool` group tasks that write disjoint slots and are joined before anyone reads. That's the no-share rule already applied; there is nothing left to guard.

## The Decision

**Disable the guards vs. fix the call.** The guard error is a precise, cheap, early report of a crossing that will crash a release build. Every time the temptation to disable it wins, a bug moves from "fixed in a minute in the editor" to "reproduced on one tester's phone next month". Keep them on in every debug build and treat the error as a failing test. The only cost is the plumbing to move the call, which is a `call_deferred` away.

**Lock vs. don't share.** The fastest, simplest, most reviewable fix for a race is to not have shared mutable state. Before you add a mutex, ask whether each task could own its slot, whether the worker could return its result, whether the state could be a snapshot. Locks are correct, and they add contention and a new way to deadlock; unshared data has neither problem. Reach for the mutex when both sides genuinely need the same state over time, and then guard every access to it.

**Test or trust.** With no detector, you either write the stress test or you trust your reading of the code. Reading finds the obvious races; the ones that ship are the non-obvious ones. This is [listen to the tests](/philosophy/listen-to-the-tests) applied where it is hardest to hear them: a threading test that passes a hundred times in a row is evidence, and a threading change without one is a guess.

## Related Patterns

- **[Mutex](/patterns/synchronisation/mutex)**: the general fix — mutual exclusion around the critical section.
- **[Main-Thread Ownership](/patterns/synchronisation/main-thread-ownership)**: the rule the debug guard enforces, and the plumbing that satisfies it.
- **[Snapshot](/patterns/synchronisation/snapshot)** and **[Thread-Safe Queue](/patterns/synchronisation/thread-safe-queue)**: the two hand-off shapes that avoid shared mutation.
- **[Join](/patterns/synchronisation/join)**: orders completion — used above to read results safely after the batch — but does **not** protect memory during it.
- **[Concurrency Patterns](/patterns/concurrency)**: the coroutine-first model that keeps most game logic on the main thread, where none of this applies.
