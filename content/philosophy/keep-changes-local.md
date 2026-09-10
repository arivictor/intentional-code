---
title: Make the next change local. That's the whole job
nav_title: Keep changes local
description: Almost every other principle is downstream of one goal — when the next change comes, it touches one place, not six.
order: 9
---

# Make the next change local. That's the whole job

Strip the field of its vocabulary and almost everything that's left points at one goal: when the next change arrives, it should touch one place, not six. Locality is the payoff. Coupling is the tax you pay against it. Cohesion seeks to ensure that the things that change together stay in the same scene. Nearly every principle worth knowing is some specific tactic in service of this one outcome, which is why it's the closest thing this site has to a single job description.

You feel its absence before you can name it. A one-line request, "show floating damage numbers", turns into edits across the enemy, the player, the HUD, and an Autoload. A change to the save format somehow breaks the pause menu. Fixing an inventory stacking rule forces you to re-test the shop. Each of those is locality leaking away, which is a sign that responsibilities have smeared across boundaries that were supposed to contain them.

## Architecture is communication

Locality is also what makes a project legible to other people. When boundaries are clear, a newcomer can open the FileSystem dock and put a new feature in roughly the right place on the first try. Scene trees read like a map. Pull requests argue about behaviour instead of about where things should live. When the structure drifts, every change reopens the same negotiation in slightly different words — and consistency, here, carries far more weight than cleverness.

## Separation of Concerns

The high-level form of the tenet: each part of a game should address one concern, with explicit boundaries between parts. Isolate what changes together, and a change in one domain stops rippling into the others. SoC is the Single Responsibility Principle one level up: SRP says a *script* has one reason to change; SoC says a whole *layer* addresses one domain. The violation is concern leakage, where one layer reaches into another's job:

```gdscript:title="res://player/player.gd"
# BAD — movement, HUD, and persistence in one script.
# Three concerns in one place.

extends CharacterBody2D

var health: int = 100

func take_damage(amount: int) -> void:
	health -= amount

	# HUD leaking into the player:
	get_node("/root/Main/HUD/HealthBar").value = health

	# Persistence leaking into the player:
	var file := FileAccess.open("user://save_1.json", FileAccess.WRITE)
	file.store_string(JSON.stringify({"health": health}))

	# Scene flow leaking into the player:
	if health <= 0:
		get_tree().change_scene_to_file("res://ui/game_over.tscn")
```

Change the HUD layout and you edit the player; change the save format and you edit the player; change what happens on death and you edit the player. It has three reasons to change, and it cannot be run on its own with F6 because `/root/Main/HUD/HealthBar` doesn't exist. Split the concerns and each one moves alone. The player reports what happened; whoever cares listens. That is "call down, signal up":

```gdscript:title="res://player/player.gd"
# GOOD — the player owns its health and announces changes. It knows
# nothing about the HUD, the disk, or what a game over looks like.

extends CharacterBody2D

signal health_changed(current: int)
signal died

var health: int = 100

func take_damage(amount: int) -> void:
	health = maxi(health - amount, 0)
	health_changed.emit(health)
	if health == 0:
		died.emit()
```

Godot has no package system to enforce the split, so the folder layout and the scene tree are the enforcement mechanism. The dependency direction should still be one way:

```
res://
  main.tscn, main.gd   — wires scenes together, connects signals
  player/              — movement, stats; emits signals, knows no UI
  enemies/             — AI, stats; emits signals, knows no UI
  ui/hud/              — listens to player signals; touches no game state
  systems/save/        — file layout and versioning; knows Dictionaries, not nodes
  autoload/            — the event bus, kept small
```

`main` connects `player.health_changed` to the HUD and `player.died` to the save and scene-flow systems; `ui/hud` depends on `player`; `player` depends on nothing above it. The nearest thing to an import-cycle error is a scene that crashes when run alone: that's the signal that two concerns have leaked into each other.

> **Smell:** A player script updates a `ProgressBar`. A `Control` script writes a save file. An enemy calls `get_tree().change_scene_to_file`. You need the whole level loaded to test a damage formula.

See also: [Clean Architecture](/patterns/architectural/clean-architecture), [Hexagonal](/patterns/architectural/hexagonal), [Repository](/patterns/architectural/repository), [Feature Modules](/patterns/architectural/feature-modules).

## Law of Demeter

Where Separation of Concerns draws the boundaries, the Law of Demeter keeps you from tunnelling through them. Talk only to your immediate collaborators — itself, its parameters, things it creates, its own children. Every segment in a path like `get_node("../../HUD/HealthBar")` is a dependency on the internal structure of a scene you don't own, and a place a distant change can reach in and break you. The informal version: **don't talk to strangers**.

```gdscript
# BAD — the enemy climbs out of itself, up two parents, into the HUD's layout.
# Rename HealthBar, move the HUD, or restructure the level and this breaks.
func _on_hit_player(damage: int) -> void:
	var bar := get_node("../../HUD/HealthBar") as ProgressBar
	bar.value -= damage
```

```gdscript
# GOOD — the enemy talks only to the thing it hit. The player owns its
# health; the HUD listens to the player.
func _on_hit_player(player: Player, damage: int) -> void:
	player.take_damage(damage)
```

The navigation is gone, not moved: the enemy depends on `Player`'s surface, and the HUD connects to `player.health_changed` from its own side. The same instinct is "tell, don't ask": rather than pulling `player.health` out to decide something elsewhere (`player.health -= damage; if player.health <= 0: player.die()`), tell the player to take the damage and let it decide. `$Sprite2D` in your own scene is fine; `..` is a stranger, and `/root/Main/...` from anywhere below `Main` is a stranger you've hard-coded.

> **Smell:** A node path with `..` in it. `get_node("/root/...")` from a scene that isn't the root. Renaming a node in one scene breaks a script in another. A caller extracts data from a node only to hand it straight back.

See also: [Separation of Concerns](/philosophy/keep-changes-local#separation-of-concerns), [Facade](/patterns/structural/facade), [Mediator](/patterns/behavioral/mediator).

## SOLID

The most famous set of object-oriented principles is, read through this tenet, five different tactics for keeping change local: a script with one reason to change (SRP), behaviour you extend without editing (OCP), components narrow enough that no scene carries what it doesn't use (ISP), and dependencies pointed at abstractions so the disk or the platform can move without disturbing game logic (DIP). The fifth, LSP, is the quiet constraint that a subclass must honour its parent's *behaviour*, not just its method names — an `Enemy` whose `take_damage` sometimes heals will break every hurtbox that trusts the name. In Godot, SRP and ISP come nearly free once you compose behaviour from child nodes, OCP falls out of Resources and Callables, DIP takes discipline because `FileAccess` and `Input` are always one static call away, and LSP has no compiler to enforce it.

The clearest of the five for *locality* is the Open/Closed Principle: a design where a new case is a new file, not an edit to a tested one.

```gdscript
# BAD — closed to extension: every new pickup edits this function.
func apply_pickup(kind: String, player: Player) -> void:
	match kind:
		"health":
			player.heal(25)
		"coin":
			player.add_coins(1)
		"speed":
			player.apply_speed_boost(1.5, 5.0)
		_:
			push_error("unknown pickup kind: %s" % kind)
```

```gdscript:title="res://pickups/pickup_effect.gd"
# GOOD — open for extension via a Resource. Adding a shield or a key is a
# new script and a new .tres, with zero changes to Pickup.
class_name PickupEffect extends Resource

func apply(_player: Player) -> void:
	pass
```

```gdscript:title="res://pickups/heal_effect.gd"
class_name HealEffect extends PickupEffect

@export var amount: int = 25

func apply(player: Player) -> void:
	player.heal(amount)
```

```gdscript:title="res://pickups/pickup.gd"
class_name Pickup extends Area2D

@export var effect: PickupEffect

func _on_body_entered(body: Node2D) -> void:
	if body is Player:
		effect.apply(body)
		queue_free()
```

Adding a pickup touches one new script and one new `.tres` a designer can drop into the inspector, and leaves every tested line alone — the change stays local. DIP is the same move aimed at infrastructure: depend on a small `SaveStorage` class your game defines, not on `FileAccess` directly, and swapping the format (or writing a test) stays out of your game logic. That overlap with testability is not a coincidence; it's the same property [the tests were trying to tell you about](/philosophy/listen-to-the-tests).

> **Smell:** You keep adding arms to a `match` for every new variant. You can't test a function without loading a level. A subclass overrides a method with `push_error("not supported")` because the parent's contract doesn't apply.

See also: [Repository](/patterns/architectural/repository), [Observer (Signals)](/patterns/behavioral/observer), [Strategy](/patterns/behavioral/strategy), [Data-Driven Design](/patterns/architectural/data-driven).
