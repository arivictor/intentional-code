---
title: Design for the change you can see, not the change you imagine
nav_title: Change you can see
description: There are two futures — the one in your backlog and the one in your head. Build for the first; the second is speculation you pay for now.
order: 6
---

# Design for the change you can see, not the change you imagine

There are two kinds of future. There's the change you can *see*, the second enemy type already in the design doc, the frame time you've actually profiled, the level the designer is building right now. And there's the change you *imagine*, which is the "what if we add co-op someday," the "this might need to be moddable," the extensibility that exists only in your head. Both feel like the same prudent instinct. They are not. The first is information; the second is a guess you start paying for the moment you build to it.

Design for the change you can see. When the change you imagined finally shows up wearing real requirements, it almost never looks like what you guessed, and the scaffolding you built for the guess is now in the way.

This is an argument against *designing* ahead, not against thinking. Decisions that are genuinely hard to reverse, the save file format, whether the game is multiplayer at all, the shape of the Resources a hundred `.tres` files depend on, all deserve real upfront thought, because changing them later is disproportionately expensive. Operational concerns such as object pooling, threaded loading, and chunk streaming should be added in response to evidence from the profiler, because you can only learn their real shape by running the game.

## Good enough first, better over time

Perfect architecture stays out of reach, and that's fine. Ship a build that's playable enough to be real, then listen for evidence that the shape is wrong:

- adding an enemy takes longer than it should
- regressions keep appearing in the same scene
- a feature ripples through scripts that shouldn't care — a new pickup edits the HUD
- people can't confidently decide where new code goes, so it goes in the Autoload

When those signals keep showing up, adjust the boundaries, one seam at a time, kept close to the pain. That's letting the game tell you what it needs instead of guessing in advance.

## Gall's Law

This tenet has an older, sharper statement, and it's an observation rather than a slogan:

*"A complex system that works is invariably found to have evolved from a simple system that worked. A complex system designed from scratch never works and cannot be made to work. You have to start over with a working simple system."* (John Gall, *Systemantics*, 1975)

A complex system has too many interacting parts to predict before you run it: assumptions made while designing turn out wrong, and interactions that looked independent turn out coupled. Compare a game framework designed for every future requirement on day one with the prototype that actually gets played:

```gdscript:title="res://autoload/game_manager.gd"
# BAD — designed on day one to run every game this studio will ever make.
# Never finished, never played end-to-end, never shipped.

extends Node

var save_system: SaveSystem
var mod_loader: ModLoader
var localisation: LocalisationService
var analytics: AnalyticsSink
var netcode: NetworkLayer
var replay_recorder: ReplayRecorder
var achievements: AchievementTracker
var difficulty: DifficultyDirector
var event_bus: EventBus
var scene_router: SceneRouter
var settings: SettingsRegistry
```

```gdscript:title="res://main.gd"
# GOOD — day one: one level, one player, one enemy type.
# It's playable, it's been handed to testers, it's telling you what's fun.

extends Node2D

const GRUNT := preload("res://enemies/grunt.tscn")

@onready var player: Player = %Player
@onready var spawn_points: Array[Node] = $SpawnPoints.get_children()

func _ready() -> void:
	for point: Node2D in spawn_points:
		var grunt := GRUNT.instantiate() as Node2D
		grunt.position = point.position
		add_child(grunt)
	player.died.connect(_on_player_died)

func _on_player_died() -> void:
	get_tree().reload_current_scene()
```

The first made a dozen architectural bets — a mod loader, a replay recorder, a difficulty director — before a single enemy was on screen, and most are wrong for the game that actually emerges. The second ships to testers, and then *tells* you what to add: that the fun is in the swarm, so the spawner needs waves; that reloading the whole scene on death is fine for three levels and unbearable at ten, so a [scene flow](/patterns/architectural/scene-flow) owner is now a change you can see; that the HUD reading player health by node path breaks the moment the level is restructured, so a signal is earned. Complexity added on that evidence is earned. This is the Rule of Three from [DRY](/philosophy/wrong-abstraction#dry) at system scale, and it's why rewrites that throw away the working prototype to "do it properly" tend to fail.

> **Smell:** A game that has never been played start to finish. A design document more detailed than the project. An engine layer that handles ten hypothetical genres but hasn't shipped the first level. A rewrite that requires moving every scene at once.

See also: [YAGNI](/philosophy/no-pattern#yagni), [KISS](/philosophy/no-pattern#kiss), [Event-Driven](/patterns/architectural/event-driven), [Scene Flow](/patterns/architectural/scene-flow).
