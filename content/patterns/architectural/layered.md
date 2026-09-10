---
title: "Layered"
description: "Organise a game into Presentation (scenes and Controls), Game logic (plain classes), and Data (Resources and saves), where each layer depends only on the one below it."
---

# Layered

**Buys testable game rules and a swappable presentation or storage layer; pays in lasagne code and heavy changes when one stat touches every layer.**

Layered architecture stacks a game into horizontal tiers and lets each tier depend only on the one beneath it. For Godot the natural three are **Presentation** — scenes, `Control`s, `AnimationPlayer`s, everything that draws or reads input; **Game logic** — the rules, in `RefCounted` classes that know nothing about nodes; and **Data** — `Resource` definitions designers edit as `.tres` files, plus whatever reads and writes the save. Presentation calls down into logic; logic reads and writes data; nothing calls up. Anything that must travel upward travels as a signal.

That is the same "call down, signal up" rule Godot recommends for parent and child nodes, applied to the whole project instead of one scene. It is less strict than [Clean Architecture](/patterns/architectural/clean-architecture) — the logic layer is allowed to know that a `Resource` exists, and nobody is forbidding a `Node2D` type-hint in the middle tier if it is honestly convenient — which makes it the right first structure for a team that has never split a project at all.

## Scenario

A shop. Prices, discounts, gold, and saving all live in the panel that displays them, because the button's `pressed` signal arrives there:

```gdscript:title="res://ui/shop_panel.gd"
extends PanelContainer

@onready var _gold_label: Label = %GoldLabel
var _selected: Dictionary = {}   # {"name": "Sword", "price": 120}

func _on_buy_pressed() -> void:
	var price: int = _selected["price"]
	if Global.reputation >= 50:
		price = int(price * 0.9)          # discount rule
	if Global.gold < price:
		%ErrorLabel.text = "Not enough gold"
		return
	Global.gold -= price
	Global.inventory.append(_selected["name"])
	_gold_label.text = str(Global.gold)
	var file := FileAccess.open("user://save.json", FileAccess.WRITE)
	file.store_string(JSON.stringify({"gold": Global.gold, "inventory": Global.inventory}))
```

The discount rule is only reachable by pressing a button in a running scene. The save format is defined by whichever script last wrote it. When the crafting screen also needs to spend gold, it copies the "not enough gold" check and forgets the discount. And the dialogue system, which needs to check whether the player can afford a bribe, has to instantiate a `PanelContainer` to ask.

> **Smell:** a `Control` script that contains a number the designer would want to tune (`0.9`, `50`) and a file path. Three layers in one file.

## Solution

Cut horizontally. Each tier has one job, one folder, and one direction of dependency.

```
┌─────────────────────────────────────────────┐
│           Presentation                      │  ShopPanel (Control), HUD,
│   scenes, Controls, input, animation        │  reads input, shows state
└──────────────────┬──────────────────────────┘
                   │ calls down          ▲ signals up
┌──────────────────▼──────────────────────────┐
│           Game logic                        │  ShopService, Wallet,
│   RefCounted classes; the rules             │  PriceRules  (no Node)
└──────────────────┬──────────────────────────┘
                   │ reads / writes
┌──────────────────▼──────────────────────────┐
│           Data                              │  ItemData (.tres), SaveGame,
│   Resources, save serialisation             │  FileAccess / JSON
└─────────────────────────────────────────────┘
```

### Data layer

Definitions are `Resource`s so they can be `.tres` files edited in the inspector. Live player state is a separate `Resource` that knows how to become a `Dictionary` and back.

```gdscript:title="res://data/item_data.gd"
class_name ItemData extends Resource

@export var id: StringName
@export var display_name: String
@export_range(0, 100_000) var base_price: int = 10
```

```gdscript:title="res://data/player_save.gd"
class_name PlayerSave extends Resource

@export var gold: int = 0
@export var reputation: int = 0
@export var owned_item_ids: Array[StringName] = []

func to_dict() -> Dictionary:
	return {"gold": gold, "reputation": reputation, "owned": owned_item_ids.duplicate()}

static func from_dict(d: Dictionary) -> PlayerSave:
	var save := PlayerSave.new()
	save.gold = int(d.get("gold", 0))
	save.reputation = int(d.get("reputation", 0))
	save.owned_item_ids.assign(d.get("owned", []))
	return save
```

```gdscript:title="res://data/save_store.gd"
class_name SaveStore extends RefCounted

const PATH := "user://save.json"

func write(save: PlayerSave) -> Error:
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(save.to_dict()))
	return OK

func read() -> PlayerSave:
	if not FileAccess.file_exists(PATH):
		return PlayerSave.new()
	var file := FileAccess.open(PATH, FileAccess.READ)
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	return PlayerSave.from_dict(parsed) if parsed is Dictionary else PlayerSave.new()
```

### Game logic layer

The rules. `RefCounted`, no nodes, signals for anything presentation should react to.

```gdscript:title="res://logic/price_rules.gd"
class_name PriceRules extends RefCounted

const LOYALTY_THRESHOLD := 50
const LOYALTY_DISCOUNT := 0.9

static func quote(item: ItemData, reputation: int) -> int:
	if reputation >= LOYALTY_THRESHOLD:
		return int(item.base_price * LOYALTY_DISCOUNT)
	return item.base_price
```

```gdscript:title="res://logic/shop_service.gd"
class_name ShopService extends RefCounted

signal gold_changed(gold: int)
signal item_bought(item: ItemData)

enum BuyResult { OK, NOT_ENOUGH_GOLD, ALREADY_OWNED }

var _save: PlayerSave
var _store: SaveStore

func _init(save: PlayerSave, store: SaveStore) -> void:
	_save = save
	_store = store

func quote(item: ItemData) -> int:
	return PriceRules.quote(item, _save.reputation)

func buy(item: ItemData) -> BuyResult:
	if item.id in _save.owned_item_ids:
		return BuyResult.ALREADY_OWNED
	var price := quote(item)
	if _save.gold < price:
		return BuyResult.NOT_ENOUGH_GOLD
	_save.gold -= price
	_save.owned_item_ids.append(item.id)
	_store.write(_save)
	gold_changed.emit(_save.gold)
	item_bought.emit(item)
	return BuyResult.OK
```

The crafting screen and the dialogue bribe now call the same `ShopService` (or share `PriceRules`) instead of copying the check. There is exactly one place the discount lives.

### Presentation layer

The panel is now a thin mapping between widgets and the service. It formats and it forwards; it decides nothing.

```gdscript:title="res://ui/shop_panel.gd"
extends PanelContainer

var _shop: ShopService
var _selected: ItemData

func setup(shop: ShopService) -> void:
	_shop = shop
	_shop.gold_changed.connect(_on_gold_changed)
	%BuyButton.pressed.connect(_on_buy_pressed)

func select_item(item: ItemData) -> void:
	_selected = item
	%PriceLabel.text = "%d gold" % _shop.quote(item)

func _on_buy_pressed() -> void:
	match _shop.buy(_selected):
		ShopService.BuyResult.OK:
			%ErrorLabel.text = ""
		ShopService.BuyResult.NOT_ENOUGH_GOLD:
			%ErrorLabel.text = "Not enough gold"
		ShopService.BuyResult.ALREADY_OWNED:
			%ErrorLabel.text = "You already own that"

func _on_gold_changed(gold: int) -> void:
	%GoldLabel.text = str(gold)
```

Somewhere above all three — the main scene or a small autoload — one script builds the stack and hands it down:

```gdscript:title="res://main.gd"
extends Node

func _ready() -> void:
	var store := SaveStore.new()
	var shop := ShopService.new(store.read(), store)
	%ShopPanel.setup(shop)
```

That is the only script allowed to know about all three layers.

### The test

```gdscript:title="res://test/unit/test_shop_service.gd"
extends GutTest

class MemoryStore extends SaveStore:
	var written: PlayerSave
	func write(save: PlayerSave) -> Error:
		written = save
		return OK

func _sword() -> ItemData:
	var item := ItemData.new()
	item.id = &"sword"
	item.base_price = 100
	return item

func test_loyal_customers_pay_ninety_percent() -> void:
	var save := PlayerSave.new()
	save.gold = 90
	save.reputation = 50
	var store := MemoryStore.new()
	var shop := ShopService.new(save, store)
	assert_eq(shop.buy(_sword()), ShopService.BuyResult.OK)
	assert_eq(save.gold, 0)
	assert_eq(store.written.owned_item_ids, [&"sword"])

func test_cannot_buy_twice() -> void:
	var save := PlayerSave.new()
	save.gold = 1000
	var shop := ShopService.new(save, MemoryStore.new())
	shop.buy(_sword())
	assert_eq(shop.buy(_sword()), ShopService.BuyResult.ALREADY_OWNED)
```

No scene, no disk. `ItemData.new()` in a test is fine — a `Resource` does not need to be a file.

### Folder structure

```
res://
├── ui/           # Presentation: .tscn + scripts extending Control/Node2D
├── logic/        # Game logic: RefCounted only
├── data/         # Data: Resource classes, .tres files, SaveStore
│   └── items/    # sword.tres, potion.tres …
├── main.gd       # the one script that wires all three
└── test/unit/
```

`ui/` may `preload` from `logic/` and `data/`. `logic/` may reference `data/`. `data/` references nothing above it. Godot won't check this; a grep for `res://ui/` inside `logic/` and `data/` in CI will.

## The one-stat cost

Now add a rule: items have weight, the player has a carry limit, and the shop refuses a purchase that would exceed it. Count the files:

1. `item_data.gd` — new `@export var weight: float`. Every `.tres` needs a value.
2. `player_save.gd` — `carry_limit`, plus `to_dict` and `from_dict` lines, plus a migration for saves written before the field existed.
3. `shop_service.gd` — a new `BuyResult.TOO_HEAVY` and the check.
4. Somewhere in logic — an `Inventory` that can sum weights, because `owned_item_ids` cannot.
5. `shop_panel.gd` — display the weight, handle the new result.
6. The HUD — show current carry.
7. The test file.

Seven touches for one number. That is not a failure of the pattern; it is the pattern being honest about what a stat *is* — a thing that exists in data, in rules, and on screen. The unlayered version touches fewer files because it hides the same three concerns in one. But you feel it, and a team that adds a stat a week will feel it every week.

## When to Use

- A rule is being copied between screens (shop, crafting, dialogue) because it lives in one screen's script. Pull it down a layer and the copies collapse.
- You want designers editing `.tres` files while programmers change rules, without the two colliding in the same script.
- The save format is implicit — defined by whoever last wrote a `Dictionary` — and you need one place that owns it.
- A test for a rule would currently need a running scene.

## When Not to Use

- A jam or a prototype. Three folders for one screen is structure the work never uses; put it in one script and split when the second screen arrives.
- The logic layer would be pass-through: `ShopService.buy` that just decrements gold with no rule to protect. That is lasagne — layers with nothing between them.
- Physics-led gameplay where the "logic" *is* the node's `move_and_slide()` loop. Forcing that into a `RefCounted` fights the engine.

## The Decision

Layered is the cheapest boundary you can draw and the easiest to explain to a new team member: scenes on top, rules in the middle, data at the bottom, arrows point down. Its weakness is the same as its strength. Because it only demands direction, not purity, the middle layer drifts. A `ShopService` gains an `@onready`-shaped helper, then a `Node` parameter "just to get the position", and six months later it cannot be constructed in a test any more. Nobody broke the rule; they bent it three times.

The Godot-specific pull is toward the top. Nodes are where the signals arrive, the inspector lives, and the debugger shows you things, so logic wants to live on them. Resist by making the middle layer the place with the *interesting* code — the discount, the carry limit, the stacking rule — and the presentation the boring mapping. When the middle is dull and the top is clever, the layers are upside down.

Reach for layered when you feel the copy-paste of one rule across two screens, and stop adding layers when a change starts touching more files than it has ideas in it. That is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off): testable rules and a swappable save format, paid for in the seven-file stat.

## Related Patterns

- **[Clean Architecture](/patterns/architectural/clean-architecture)**: layered with the rule hardened — the inner rings may not mention a `Node` at all, and the dependency ban is enforced in review. Graduate to it when the middle layer keeps drifting upward.
- **[Hexagonal](/patterns/architectural/hexagonal)**: treats presentation, storage, and platform as equal swappable edges rather than a stack. Prefer it when input and platform services need faking, not just storage.
- **[Repository](/patterns/architectural/repository)**: the data layer done properly — `SaveStore` with slots, versioning, and an in-memory implementation for tests.
- **[MVC / MVP / MVVM](/patterns/architectural/mvc)**: how the presentation layer itself should be split so `ShopPanel` reacts to `gold_changed` instead of polling the service every frame.
- **[Data-Driven Design](/patterns/architectural/data-driven)**: the data layer as the thing designers own — everything that is a number in a rule becomes an `@export` on a `Resource`.
