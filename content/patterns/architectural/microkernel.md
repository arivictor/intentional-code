---
title: "Microkernel"
description: "Keep a small core that exposes a versioned ModAPI, and grow the game by loading .pck mods whose mod.gd registers weapons, recipes, and hooks against it — the same shape EditorPlugin addons use inside the editor."
---

# Microkernel

**Buys a core that grows by loading plugins and mods instead of edits; pays in a load-bearing contract you must version and behaviour that's harder to trace.**

A microkernel splits the game into a small, stable **core** and an open-ended set of **plugins** the core knows nothing about individually. The core provides mechanism — a registry of weapons, a recipe table, a hook that fires when a level starts — behind one contract, the `ModAPI`. A plugin is a folder (or a `.pck` file) with a `mod.gd` that receives the API and registers what it brings. Add a mod, the game gains content; the core's source is untouched.

Godot supports this out of the box in two directions. At runtime, `ProjectSettings.load_resource_pack()` overlays a `.pck` onto `res://`, after which its scripts and scenes load like anything shipped with the game. In the editor, `EditorPlugin` is exactly the same shape: the editor is the kernel, `plugin.gd` is the mod, and `add_custom_type`, `add_control_to_dock`, and friends are the versioned API. Learn one and you have learned the other.

## Scenario

Every new weapon touches the core:

```gdscript:title="res://weapons/weapon_factory.gd"
class_name WeaponFactory extends RefCounted

static func make(id: StringName) -> Weapon:
	match id:
		&"sword": return preload("res://weapons/sword.tscn").instantiate()
		&"bow": return preload("res://weapons/bow.tscn").instantiate()
		&"flail": return preload("res://weapons/flail.tscn").instantiate()
		# every new weapon: a line here, a line in loot_table.gd,
		# a line in shop_stock.gd, an entry in the codex …
	push_error("unknown weapon %s" % id)
	return null
```

A modder who wants to add a spear cannot: the ids are a `match` in a script inside the exported `.pck`. Your own content team is in the same position — every weapon is a pull request against `weapon_factory.gd`, `loot_table.gd`, and `codex.gd`, and the three fall out of sync the week someone forgets one. The core has become a list of everything that exists.

> **Smell:** a `match` on an id whose arms are all `preload`s. That is a registry pretending to be logic, and it has to be edited to grow.

## Solution

Make the registry an object the core owns and hands out. Move each piece of content into a plugin that registers itself.

```
             ┌────────────────────────────────────────┐
             │                Core                    │
   load ────►│  ModLoader  →  ModAPI (v2)             │────► registries the game reads
             │  weapons: {}  recipes: {}  hooks: []   │
             └───────────────────┬────────────────────┘
                                 │ api passed to each mod.gd
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
  res://mods/base/         user://mods/spears.pck   user://mods/hardcore.pck
  mod.gd registers         mod.gd registers         mod.gd registers
  sword, bow, flail        spear, pike              a hook that halves healing
```

### The contract

The API is a plain class. Its version is a constant. Every method that exists in version N still exists, with the same signature, in version N+1 — that is the only promise that makes third-party mods survive your updates.

```gdscript:title="res://core/mod_api.gd"
class_name ModAPI extends RefCounted

## Bump the minor number for additions, the major for removals or signature changes.
const VERSION := Vector2i(2, 1)

signal level_started(level_id: StringName)

var weapons: Dictionary[StringName, PackedScene] = {}
var recipes: Dictionary[StringName, RecipeData] = {}
var _registered_by: Dictionary[StringName, StringName] = {}   # id → mod id, for tracing

func register_weapon(mod_id: StringName, id: StringName, scene: PackedScene) -> void:
	if weapons.has(id):
		push_warning("mod '%s' replaces weapon '%s' from mod '%s'" % [mod_id, id, _registered_by[id]])
	weapons[id] = scene
	_registered_by[id] = mod_id

func register_recipe(mod_id: StringName, recipe: RecipeData) -> void:
	recipes[recipe.id] = recipe
	_registered_by[recipe.id] = mod_id

## v2.1: mods can react to the game without the game knowing them.
func on_level_started(callback: Callable) -> void:
	level_started.connect(callback)

func who_registered(id: StringName) -> StringName:
	return _registered_by.get(id, &"")
```

Passing `mod_id` on every call is deliberate. When the spear has the wrong damage, `who_registered(&"spear")` says which mod to blame.

### A mod

A mod is a folder under `res://mods/<id>/` — inside the main project for your own content, or inside a `.pck` for a third party's. The `.pck` overlays `res://`, so the convention that each mod keeps its files under its own subfolder is what stops two mods clobbering each other.

```gdscript:title="res://mods/spears/mod.gd"
extends RefCounted

const MOD_ID := &"spears"
const REQUIRES_API := Vector2i(2, 0)   # needs register_weapon; does not need hooks

func register(api: ModAPI) -> void:
	api.register_weapon(MOD_ID, &"spear", load("res://mods/spears/spear.tscn"))
	api.register_weapon(MOD_ID, &"pike", load("res://mods/spears/pike.tscn"))
	api.register_recipe(MOD_ID, load("res://mods/spears/recipes/spear.tres"))
```

`load`, not `preload`: the scene paths only exist after the pack is mounted, and `preload` resolves at parse time.

### The loader

```gdscript:title="res://core/mod_loader.gd"
class_name ModLoader extends RefCounted

const MODS_DIR := "user://mods"
const BUILTIN := ["res://mods/base/mod.gd"]

var api := ModAPI.new()
var loaded: Array[StringName] = []

func load_all() -> void:
	for path in BUILTIN:
		_load_mod_script(path)
	DirAccess.make_dir_recursive_absolute(MODS_DIR)
	var files := DirAccess.get_files_at(MODS_DIR)
	files.sort()                                     # deterministic order
	for file in files:
		if not file.ends_with(".pck"):
			continue
		var pack_path := "%s/%s" % [MODS_DIR, file]
		if not ProjectSettings.load_resource_pack(pack_path):
			push_error("could not mount %s" % pack_path)
			continue
		var mod_id := file.get_basename()
		_load_mod_script("res://mods/%s/mod.gd" % mod_id)

func _load_mod_script(path: String) -> void:
	var script := load(path) as GDScript
	if script == null:
		push_error("no mod.gd at %s" % path)
		return
	var mod: Object = script.new()
	if not _compatible(mod, path):
		return
	if not mod.has_method("register"):
		push_error("%s has no register(api)" % path)
		return
	mod.register(api)
	loaded.append(mod.MOD_ID)
	print("loaded mod '%s' from %s" % [mod.MOD_ID, path])

func _compatible(mod: Object, path: String) -> bool:
	var required: Vector2i = mod.get("REQUIRES_API")
	if required == null:
		push_error("%s declares no REQUIRES_API" % path)
		return false
	var ok := required.x == ModAPI.VERSION.x and required.y <= ModAPI.VERSION.y
	if not ok:
		push_error("%s needs API %s, core provides %s" % [path, required, ModAPI.VERSION])
	return ok
```

Same major, minor at most ours: that is the rule. A mod built against 2.0 runs on a 2.1 core; a mod that needs 2.1 refuses to load on 2.0 instead of crashing on a missing method; a 3.0 core rejects every 2.x mod and says why.

### The core reads registries, never ids

```gdscript:title="res://weapons/weapon_factory.gd"
class_name WeaponFactory extends RefCounted

var _api: ModAPI

func _init(api: ModAPI) -> void:
	_api = api

func make(id: StringName) -> Weapon:
	var scene: PackedScene = _api.weapons.get(id)
	if scene == null:
		push_error("unknown weapon '%s' (loaded mods: %s)" % [id, _api.weapons.keys()])
		return null
	return scene.instantiate() as Weapon
```

The loot table, the shop, and the codex read `api.weapons` too. Adding a spear now touches zero core files.

```text
loaded mod 'base' from res://mods/base/mod.gd
loaded mod 'spears' from res://mods/spears/mod.gd
WARNING: mod 'hardcore' replaces weapon 'sword' from mod 'base'
loaded mod 'hardcore' from res://mods/hardcore/mod.gd
```

That warning is the tracing tax paid up front: when swords behave strangely, the log already told you who touched them.

### Trust

`load_resource_pack` mounts scripts, and `script.new()` runs them. A `.pck` from the internet is arbitrary code with your game's permissions — the same as any mod system in any engine, but say it out loud in the UI: "Mods can run any code. Only install mods you trust." There is no sandbox to offer. What you *can* do is keep the API narrow: a mod that can only call `register_weapon` cannot, through the API, delete saves. It can through `DirAccess`; that is the trust boundary, and it belongs to the player.

## The same shape in the editor

An addon under `res://addons/<name>/` is a microkernel plugin where the kernel is the editor:

```gdscript:title="res://addons/quest_editor/plugin.gd"
@tool
extends EditorPlugin

const DOCK := preload("res://addons/quest_editor/quest_dock.tscn")
var _dock: Control

func _enter_tree() -> void:
	# Registration against the editor's API.
	add_custom_type("QuestData", "Resource", preload("quest_data.gd"), preload("icon.svg"))
	_dock = DOCK.instantiate()
	add_control_to_dock(DOCK_SLOT_LEFT_UL, _dock)

func _exit_tree() -> void:
	# Every registration has an unregistration. Leave nothing behind.
	remove_custom_type("QuestData")
	remove_control_from_docks(_dock)
	_dock.queue_free()
```

`plugin.cfg` is the manifest, `_enter_tree` is `register`, `_exit_tree` is the part the runtime version above is missing — unloading. The editor's API is versioned by the engine release, which is why an addon written for 4.2 may need edits for 4.4: the same contract-drift problem, experienced from the plugin's side. Design your `ModAPI` the way you wish every engine API had been designed: additive, documented, and slow to break.

## When to Use

- The content set is open-ended and someone other than the core team will add to it: modders, a DLC pipeline, a content team that should not need a programmer per item.
- The `match`-on-id smell above is present in more than one file, and the files disagree.
- Features should be switchable per build — a hardcore mode, a platform-specific pack, a demo subset — by choosing which mods load.
- You are writing an editor addon. There is no choice; `EditorPlugin` *is* the pattern.

## When Not to Use

- The content is fixed and small. A `Dictionary[StringName, PackedScene]` constant in one file is the registry without the loader, the versioning, or the trust problem.
- Plugins would need to share deep state with each other. A mod that needs another mod's internals is not a plugin; it is a dependency graph the API cannot express.
- You cannot commit to the contract. A `ModAPI` that changes every sprint breaks every mod every sprint, and the modders leave.
- Modding would mean shipping scripts you consider secret. A `.pck` is trivially unpacked; the API is a public surface whether you document it or not.

## The Decision

The core gets smaller and stops changing; that is the whole benefit, and for a game meant to live for years on user content it is decisive. The cost is that the API becomes the most load-bearing code in the project. Every method on it is a promise to code you have not seen, written by people you cannot reach. Rename a parameter and a hundred mods break with a stack trace in someone else's Discord. Version it from the first release, add without removing, and treat a major bump as the event it is.

The second cost is tracing. In the `match` version, "what weapons exist?" is a read of one file. In the plugin version it is "whatever registered", which depends on which `.pck`s were in a folder on the player's machine, in what order, and which of them overrode which. The loader above logs every registration and records who did it; without that, the first bug report is undebuggable. Godot adds a specific wrinkle: a `.pck` overlays `res://`, so a mod that puts a file at `res://player/player.gd` *replaces yours* silently. The per-mod subfolder convention is your only defence, and it is a convention.

Reach for the microkernel when the third party is real — a modder, a content team, another studio — and stay with the dictionary constant when the only person adding weapons is you. That is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off): a core that never changes, paid for with a contract that never can.

## Related Patterns

- **[Factory Method](/patterns/creational/factory-method)**: `WeaponFactory.make(id)` is a factory; the microkernel is what fills its table from outside.
- **[Strategy](/patterns/behavioral/strategy)**: a mod's hook (`on_level_started`) is a strategy chosen at load time. Microkernel is strategy scaled to an open registry.
- **[Feature Modules](/patterns/architectural/feature-modules)**: the same folder-per-thing discipline without runtime loading or a versioned contract. Start there; graduate to a microkernel when the folders need to arrive as `.pck` files.
- **[Service Locator](/patterns/architectural/service-locator)**: the `ModAPI` handed to every mod is a locator for the core's registries. Same hidden-dependency cost, deliberately accepted at the mod boundary.
- **[Data-Driven Design](/patterns/architectural/data-driven)**: most of what a mod registers is `Resource` data. If mods only ever add `.tres` files, a folder scan may be all the kernel you need.
