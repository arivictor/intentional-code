---
title: "Pipe and Filter"
description: "Split procedural generation and damage calculation into independent stages that each transform a shared data object, so stages can be tested alone, reordered in the inspector, and run off the main thread."
---

# Pipe and Filter

**Buys independently testable, reorderable stages for procedural generation and damage calculation; pays in intermediate allocations and stages that only make sense in one order.**

Pipe and Filter is a workflow shaped as a sequence of stages, each of which takes data in, does one thing to it, and passes it on. No stage knows the stage before or after; the pipeline knows the order. The shape shows up twice in almost every game: **generation** (noise → biomes → rivers → object placement, over a map) and **calculation** (base damage → critical → armour → buffs → clamp, over a number). Both start life as one long function and both become a pipeline the first time someone needs to test the river stage alone or move the crit stage before the armour stage.

In Godot the data between stages is a plain object — a `RefCounted` for speed or a `Resource` if you want it saved — and the stages are Resources, so a designer can build a pipeline in the inspector: an exported `Array[MapStage]` where each entry is a `.tres` with its own parameters. The guarantee is that any stage can be run, tested, replaced, or reordered without touching any other stage.

## Scenario

A world generator that has been "finished" three times:

```gdscript:title="res://world/map_generator.gd"
func generate(seed: int, width: int, height: int) -> Dictionary:
	var noise := FastNoiseLite.new()
	noise.seed = seed
	var heights := PackedFloat32Array()
	heights.resize(width * height)
	for y in height:
		for x in width:
			heights[y * width + x] = noise.get_noise_2d(x, y) * 0.5 + 0.5
	# biomes (added in sprint 3)
	var biomes := PackedByteArray()
	biomes.resize(width * height)
	for i in heights.size():
		biomes[i] = _biome_for(heights[i], _moisture_hack(i, seed))
	# rivers (sprint 5) — must run after biomes because it converts tiles to WATER
	var rivers: Array[Vector2i] = []
	for i in 12:
		rivers.append_array(_carve_river(heights, biomes, width, height, seed + i))
	# placement (sprint 7) — reads biomes, avoids rivers, and also tweaks heights
	# because the village needs flat ground. Nobody is sure if this breaks rivers.
	var placements := _place_things(heights, biomes, rivers, width, height, seed)
	return {"heights": heights, "biomes": biomes, "rivers": rivers, "placements": placements}
```

The function is 300 lines. Rivers cannot be tested without generating noise first, so a river bug is reproduced by generating whole worlds until one shows it. The placement stage quietly edits `heights`, which the river stage already consumed, so "does placement break rivers" is a real question nobody can answer. Adding a road stage means deciding where in this function it goes and what it may touch. And it all runs on the main thread, because it is one function that reads `seed` and returns a Dictionary and nobody wants to split it.

> **Smell:** A generator function with sprint-numbered comments, or a stage that "must run after" another for a reason only the author remembers.

## Solution

One data object, one base class for stages, one pipeline that runs them in order.

```
                MapData (RefCounted)
                heights │ biomes │ rivers │ placements
                     ▲       ▲       ▲          ▲
   seed ──► [NoiseStage] ─► [BiomeStage] ─► [RiverStage] ─► [PlacementStage] ──► MapData
              writes          reads h         reads h,b        reads h,b,r
              heights         writes b        writes r,b       writes p
```

The data object holds every layer. Stages mutate it in place — allocating a new `MapData` per stage would copy megabytes of packed arrays four times — and the pipeline's contract is that each stage documents which layers it reads and writes:

```gdscript:title="res://world/map_data.gd"
class_name MapData extends RefCounted

enum Biome { OCEAN, BEACH, GRASS, FOREST, MOUNTAIN, WATER }

var width: int
var height: int
var seed: int
var heights := PackedFloat32Array()
var biomes := PackedByteArray()
var rivers: Array[Vector2i] = []
var placements: Array[Placement] = []

func _init(p_width: int, p_height: int, p_seed: int) -> void:
	width = p_width
	height = p_height
	seed = p_seed
	heights.resize(width * height)
	biomes.resize(width * height)

func index(x: int, y: int) -> int:
	return y * width + x

func height_at(x: int, y: int) -> float:
	return heights[index(x, y)]
```

A stage is a Resource so it can carry exported parameters and be saved as a `.tres`. The base class is the contract:

```gdscript:title="res://world/stages/map_stage.gd"
class_name MapStage extends Resource

## Mutates map in place. Reads and writes are documented per subclass.
func apply(map: MapData) -> void:
	push_error("MapStage.apply not implemented")
```

```gdscript:title="res://world/stages/noise_stage.gd"
## Writes: heights. Reads: nothing.
class_name NoiseStage extends MapStage

@export var frequency: float = 0.01
@export_range(1, 8) var octaves: int = 4

func apply(map: MapData) -> void:
	var noise := FastNoiseLite.new()
	noise.seed = map.seed
	noise.frequency = frequency
	noise.fractal_octaves = octaves
	for y in map.height:
		for x in map.width:
			map.heights[map.index(x, y)] = noise.get_noise_2d(x, y) * 0.5 + 0.5
```

```gdscript:title="res://world/stages/river_stage.gd"
## Reads: heights, biomes. Writes: rivers, biomes (carved tiles become WATER).
class_name RiverStage extends MapStage

@export_range(0, 64) var river_count: int = 12
@export var min_source_height: float = 0.7

func apply(map: MapData) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = map.seed ^ 0x5EED
	for i in river_count:
		var source := _pick_source(map, rng)
		if source == Vector2i(-1, -1):
			continue
		_carve_downhill(map, source)

func _pick_source(map: MapData, rng: RandomNumberGenerator) -> Vector2i:
	for attempt in 100:
		var p := Vector2i(rng.randi_range(0, map.width - 1), rng.randi_range(0, map.height - 1))
		if map.height_at(p.x, p.y) >= min_source_height:
			return p
	return Vector2i(-1, -1)

func _carve_downhill(map: MapData, from: Vector2i) -> void:
	var p := from
	while map.biomes[map.index(p.x, p.y)] != MapData.Biome.OCEAN:
		map.rivers.append(p)
		map.biomes[map.index(p.x, p.y)] = MapData.Biome.WATER
		var next := _lowest_neighbour(map, p)
		if next == p:
			break
		p = next
```

The pipeline is itself a Resource holding an ordered array of stages. That is the part designers see: a `world_pipeline.tres` with four sub-resources they can reorder, disable, or retune:

```gdscript:title="res://world/map_pipeline.gd"
class_name MapPipeline extends Resource

@export var stages: Array[MapStage] = []

func run(width: int, height: int, seed: int) -> MapData:
	var map := MapData.new(width, height, seed)
	for stage in stages:
		stage.apply(map)
	return map
```

```gdscript:title="res://world/world.gd"
extends Node2D

@export var pipeline: MapPipeline

func _ready() -> void:
	var map := pipeline.run(256, 256, randi())
	%TerrainRenderer.present(map)
```

Because `MapData` is plain data and no stage touches a node, `pipeline.run` can go to a worker thread untouched — `WorkerThreadPool.add_task(pipeline.run.bind(256, 256, seed))` — with only `present` on the main thread. That was impossible with the original function, not because of anything it computed but because it lived on a node and nobody could see what it reached for.

### Testing one stage

A stage takes a `MapData` and returns nothing. A test builds the smallest map that exercises it:

```gdscript:title="res://test/unit/test_river_stage.gd"
extends GutTest

func test_river_flows_downhill_to_ocean() -> void:
	var map := MapData.new(4, 1, 1)
	map.heights = PackedFloat32Array([0.9, 0.6, 0.3, 0.1])
	map.biomes = PackedByteArray([MapData.Biome.MOUNTAIN, MapData.Biome.GRASS,
		MapData.Biome.BEACH, MapData.Biome.OCEAN])
	var stage := RiverStage.new()
	stage.river_count = 1
	stage.min_source_height = 0.8
	stage.apply(map)
	assert_eq(map.rivers, [Vector2i(0, 0), Vector2i(1, 0), Vector2i(2, 0)])
	assert_eq(map.biomes[1], MapData.Biome.WATER)
```

No noise, no placement, no scene tree. A four-tile map and a known answer.

## The damage pipeline

The same shape at a different scale. The data is a context, the stages are Callables, and the whole thing runs in microseconds:

```gdscript:title="res://combat/damage_context.gd"
class_name DamageContext extends RefCounted

var attacker: CombatStats
var defender: CombatStats
var base: float
var multiplier: float = 1.0
var flat_bonus: float = 0.0
var is_crit: bool = false
var final: int = 0
```

```gdscript:title="res://combat/damage_pipeline.gd"
class_name DamagePipeline extends RefCounted

var _stages: Array[Callable] = []

func add(stage: Callable) -> DamagePipeline:
	_stages.append(stage)
	return self

func run(ctx: DamageContext) -> int:
	for stage in _stages:
		stage.call(ctx)
	return ctx.final

static func crit(ctx: DamageContext) -> void:
	if ctx.attacker.rng.randf() < ctx.attacker.crit_chance:
		ctx.is_crit = true
		ctx.multiplier *= 2.0

static func armour(ctx: DamageContext) -> void:
	ctx.multiplier *= 100.0 / (100.0 + ctx.defender.armour)

static func buffs(ctx: DamageContext) -> void:
	for buff in ctx.attacker.buffs:
		ctx.flat_bonus += buff.flat_damage
		ctx.multiplier *= buff.damage_multiplier

static func finalise(ctx: DamageContext) -> void:
	ctx.final = maxi(int(round((ctx.base + ctx.flat_bonus) * ctx.multiplier)), 1)
```

```gdscript:title="res://combat/combat.gd"
var _pipeline := DamagePipeline.new() \
	.add(DamagePipeline.buffs) \
	.add(DamagePipeline.crit) \
	.add(DamagePipeline.armour) \
	.add(DamagePipeline.finalise)
```

Here the reorderability is real *and* dangerous. Move `armour` before `crit` and, because both are multiplicative, nothing changes. Move `buffs` after `finalise` and flat bonuses are silently ignored. Move `finalise` first and every stage after it does nothing. The pipeline lets a designer express "in this game, crits are calculated on post-armour damage" as a reorder rather than a code change; it does not stop them expressing nonsense. Assert the invariants in `run` — `finalise` last, `final` unset before it — or accept that some orders are wrong and document which.

## When to Use

- A process has three or more steps that each read and write a shared data object: generation, damage, loot rolls, save-file upgrades, asset import.
- A step needs testing on its own, with hand-built input and a known answer.
- The order or the set of steps varies — per biome, per game mode, per difficulty — and a Resource of stages is the cleanest way to express that.
- The work should leave the main thread. A pipeline over plain data is threadable by construction.

## When Not to Use

- Two steps. A pipeline of two functions is two function calls with a class in between.
- Steps need to talk *back*: rivers that ask the biome stage to recompute. Filters do not have a return channel; when they need one you have a graph or a solver, not a pipeline.
- Each stage produces a fresh copy of large data and memory is the constraint. Either mutate in place, as above, or accept the allocations knowingly.
- The order is fixed and obvious and will never change. A `Template Method` with four steps reads better than a pipeline of four Resources.

## The Decision

The trade is isolation for coordination. Each stage becomes small, testable, and ignorant, and the knowledge of how they fit — which layers exist, which stage must precede which — moves into the pipeline definition and the docs on each stage. When that knowledge is simple ("every stage after `NoiseStage`"), the pipeline is a win. When it is a lattice of constraints, the pipeline has hidden a dependency graph inside an ordered array, and the array will be reordered wrongly by someone reasonable.

Allocation is the Godot-specific cost. The map version mutates one `MapData` because copying `PackedFloat32Array`s per stage is the difference between generating a world in 80 ms and 300 ms. The damage version mutates one `DamageContext` because it runs on every hit. Both give up the purity that makes stages trivially parallel — you cannot run `BiomeStage` and `RiverStage` at once on the same object — in exchange for not allocating. If a stage *can* run in parallel with another, split the data so each stage owns its layer, and then the [Fan-out / Fan-in](/patterns/concurrency/fan-out-fan-in) page applies.

Determinism is the other one. Every stage that rolls dice seeds its own `RandomNumberGenerator` from `map.seed`, with a per-stage salt, so inserting a stage does not change the rivers. A stage that calls the global `randf()` breaks reproducible worlds for everyone downstream.

This is [tenet #7 — hard to test is the design talking](/philosophy/listen-to-the-tests): "I cannot test rivers without generating noise" was the design asking for the split.

## Related Patterns

- **[Pipeline](/patterns/concurrency/pipeline)**: The concurrent cousin, where stages run on different threads with queues between them. Pipe and Filter is the shape; Pipeline is that shape overlapped in time.
- **[Chain of Responsibility](/patterns/behavioral/chain-of-responsibility)**: Handlers that can *stop* the chain. A filter always passes data on; a chain link may decide it is done. Damage immunity ("this stage says zero and nobody after it runs") is a chain, not a filter.
- **[Decorator](/patterns/structural/decorator)**: Stacked modifiers around one object. Damage buffs as Decorators wrap the calculation; as filters they are stages in it. Filters are easier to reorder; decorators are easier to add at runtime.
- **[Strategy](/patterns/behavioral/strategy)**: Each stage is a Strategy for one step. A pipeline is an ordered list of Strategies sharing a data contract.
- **[Data-Driven Design](/patterns/architectural/data-driven)**: The stages-as-Resources trick is data-driven design applied to process instead of content, with the same shared-Resource caveat: stages must not keep state between runs.
- **[Worker Thread Pool](/patterns/concurrency/worker-thread-pool)**: Where a pipeline over plain data goes to run. The main thread calls `present` when it is done.
- **[Template Method](/patterns/behavioral/template-method)**: The alternative for a fixed sequence. When the order never changes and the steps are few, a base class with four virtual methods is less machinery.
