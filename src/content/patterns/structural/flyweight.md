---
title: "Flyweight"
category: structural
intent: "Minimize memory usage by sharing as much data as possible between similar objects, separating intrinsic from extrinsic state."
goIdiomSummary: "Share immutable intrinsic state via interning and lookup map; mention sync.Pool as a related but different reuse tool."
relatedSlugs: ["composite", "singleton"]
tags: [state, performance, concurrency]
---

# Flyweight

Flyweight is a memory optimization: when you have thousands of similar objects, most of their data is identical. Instead of each object storing its own copy of that shared data, they all point to one shared instance. In Go this is usually a cache keyed on the shared value — the first time you need a particular entry you create it and store it; every subsequent request returns the same pointer. The data that never changes (a colour, a font, a timezone) lives in the shared instance; the data that varies per object (a position, a quantity) stays on each individual instance.

`sync.Pool` is a related but different tool — it recycles mutable temporary objects to reduce GC pressure, whereas Flyweight shares immutable permanent state.

## Problem

You're building a game with thousands of tree objects in a forest. Each tree has a species (name, texture, color — large, repeated data) and a position (small, unique data). Storing the full species data on every tree wastes hundreds of megabytes.

```go
// bloated.go
package forest

type Tree struct {
    X, Y    float64
    Species string  // "Oak", "Pine", "Birch" — same across thousands
    Texture []byte  // Large texture data — identical for same species
    Color   [3]byte // RGB — identical for same species
    Height  float64 // Unique per tree
}

// 10,000 oak trees each store the same 2MB texture.
// That's 20GB of duplicated data.
```

The species name, texture, and color are the same for all oaks. Storing them on every tree instance is wasteful. With 10,000 trees, you're storing 10,000 copies of data that could be stored once.

## Solution

Extract the shared intrinsic state (species data) into a separate type. Use a factory that interns these types — returning the existing instance if one with the same key already exists.

```
┌────────────────┐
│ TreeType (shared)│ ◄── interned, one per species
│ Name, Texture,  │
│ Color           │
└───────┬────────┘
        │ many trees reference same TreeType
┌───────▼────────┐
│ Tree (unique)  │
│ X, Y, Height   │
│ Type *TreeType  │
└────────────────┘
```

```go
// forest.go
package forest

import "fmt"

// TreeType holds shared intrinsic state — one per species.
type TreeType struct {
    Name    string
    Texture string
    Color   [3]byte
}

// Tree holds unique extrinsic state + a reference to shared data.
type Tree struct {
    X, Y   float64
    Height float64
    Type   *TreeType
}

func (t *Tree) Render() string {
    return fmt.Sprintf("%s at (%.0f,%.0f) h=%.1f color=#%02x%02x%02x",
        t.Type.Name, t.X, t.Y, t.Height,
        t.Type.Color[0], t.Type.Color[1], t.Type.Color[2])
}

// Factory interns TreeType instances.
var typeCache = map[string]*TreeType{}

func GetTreeType(name, texture string, color [3]byte) *TreeType {
    key := name
    if tt, ok := typeCache[key]; ok {
        return tt
    }
    tt := &TreeType{Name: name, Texture: texture, Color: color}
    typeCache[key] = tt
    return tt
}
```

```go
// main.go
package main

import (
    "fmt"
    "forest"
)

func main() {
    oak := forest.GetTreeType("Oak", "oak_bark.png", [3]byte{34, 120, 15})
    pine := forest.GetTreeType("Pine", "pine_bark.png", [3]byte{10, 80, 30})

    trees := []*forest.Tree{
        {X: 10, Y: 20, Height: 15.5, Type: oak},
        {X: 30, Y: 40, Height: 12.0, Type: oak},
        {X: 50, Y: 60, Height: 20.0, Type: pine},
        {X: 70, Y: 80, Height: 18.3, Type: pine},
    }

    for _, t := range trees {
        fmt.Println(t.Render())
    }
    fmt.Printf("\nUnique tree types: %d (shared across %d trees)\n", 2, len(trees))
}
```

Output:

```
Oak at (10,20) h=15.5 color=#22780f
Oak at (30,40) h=12.0 color=#22780f
Pine at (50,60) h=20.0 color=#0a501e
Pine at (70,80) h=18.3 color=#0a501e

Unique tree types: 2 (shared across 4 trees)
```

## When to Use

- You have a large number of objects that share significant amounts of identical data.
- Memory usage is a measurable problem — profile before optimizing.
- The shared state is immutable (or can be made immutable).
- You can clearly separate intrinsic (shared) from extrinsic (unique) state.

## When Not to Use

- You don't have enough objects for the sharing to matter. Profile first.
- The shared state is mutable — concurrent mutation of shared state creates race conditions.
- The distinction between intrinsic and extrinsic state is unclear or unstable.

## Advantages

- Dramatic memory reduction when many objects share the same data.
- The interning map provides deduplication automatically.

## Disadvantages

- Adds complexity — two types instead of one, plus the interning factory.
- The intern map is package-level mutable state (use `sync.Mutex` in concurrent code).
- Trading CPU (hash lookups) for memory — measure both.
- Shared state must be immutable. If you accidentally mutate it, all referencing objects break.

## Related Patterns

- **Composite** — Flyweight types often appear as leaves in a Composite tree: the shared Flyweight instance holds common data (species, texture) while each Composite node holds unique data (position, quantity, parent).
- **Singleton** — Singleton means one instance of one type; Flyweight means one instance per distinct key — the interning map is effectively a keyed singleton registry; use Singleton when there's genuinely only one, Flyweight when there are several distinct shared values.
