---
title: "Memento"
category: behavioral
intent: "Capture and externalize an object's internal state so it can be restored later, without violating encapsulation."
idiomSummary: "Capture and restore object state with snapshots that keep internals encapsulated."
relatedSlugs: ["command", "prototype"]
tags: [state]
---

# Memento

Go's package system gives Memento a clean implementation that many languages struggle with: a type's unexported fields are accessible only within its own package. This lets the originator (same package as the memento) save and restore state through a `*Memento` that external code can hold and pass around but cannot read or modify — encapsulation enforced by Python's object model, not convention.

The pattern is the encapsulated complement to [Prototype](/python/patterns/creational/prototype): Prototype clones state for independent use; Memento snapshots state for guarded restoration.

## Problem

You're building a game with save/load functionality. The game state includes player position, health, inventory, and level. You need to snapshot this state and restore it later, but you don't want external code to access or modify the internals of a save.

```python
# exposed.py

# Exposing all state publicly for save/restore
class GameState:
    player_x: int
    player_y: int
    health: int
    level: int
    items: []string

# Anyone can read and modify a "save" — no encapsulation
# Someone could cheat by editing save.Health = 9999
```

With public fields, nothing prevents external code from modifying a saved state. There's no encapsulation boundary between "the game engine that creates saves" and "external code that stores them."

## Solution

Create a memento type with unexported fields in the same package as the originator. External packages can hold a `*Memento` but can't read or modify its contents.

```
┌──────────────┐  Save()  ┌──────────────┐
│   Game       │────────►│   Memento    │
│ (originator) │         │ (opaque)     │
│              │◄────────│ unexported   │
│  Restore()   │         │ fields       │
└──────────────┘         └──────────────┘
                              │
                    Caretaker holds []Memento
                    but can't read contents
```

```python
# game.py


# Memento — unexported fields protect the snapshot.
class Memento:
    player_x: int
    player_y: int
    health: int
    level: int
    items: []string

# Game is the originator.
class Game:
    player_x: int
    player_y: int
    health: int
    level: int
    items: []string

def save(self):
    items = make([]string, len(g.Items))
    copy(items, g.Items)
    return &Memento{
    playerX: g.PlayerX
    playerY: g.PlayerY
    health:  g.Health
    level:   g.Level
    items:   items

def restore(self, m):
    g.PlayerX = m.playerX
    g.PlayerY = m.playerY
    g.Health = m.health
    g.Level = m.level
    g.Items = make(list[string, len(m.items))
    copy(g.Items, m.items)

def string(self):
    return fmt.Sprintf("Pos(%d,%d) HP=%d Lv=%d Items=%v",
    g.PlayerX, g.PlayerY, g.Health, g.Level, g.Items)
```

```python
# main.py

"fmt"
"game"

def main():
    g = game.Game{PlayerX: 0, PlayerY: 0, Health: 100, Level: 1, Items: []string{"sword"}}
    print("Start:", g)

    save1 = g.Save()

    g.PlayerX = 10
    g.Health = 50
    g.Items = append(g.Items, "shield")
    print("After playing:", g)

    g.Restore(save1)
    print("After restore:", g)
```

Output:

```
Start: Pos(0,0) HP=100 Lv=1 Items=[sword]
After playing: Pos(10,0) HP=50 Lv=1 Items=[sword shield]
After restore: Pos(0,0) HP=100 Lv=1 Items=[sword]
```

## When to Use

- You need save/restore or undo functionality with encapsulated state.
- External code should be able to hold snapshots but not inspect or modify them.
- The state to capture is complex (multiple fields, nested structures).

## When Not to Use

- The state is simple and public anyway — just copy the struct.
- Snapshots would consume too much memory (large or frequent states).
- You only need undo for individual operations — Command with `Undo()` is lighter.

## Advantages

- Preserves encapsulation — external code can't tamper with snapshots.
- Clean separation between the originator (creates/restores) and caretaker (stores).
- Go's unexported fields naturally enforce the opaqueness.

## Disadvantages

- Memory cost — each snapshot is a full copy of the state.
- The originator must deep-copy reference types (slices, maps) to prevent sharing.
- The opaque memento means debugging saved states requires the originator's help.

## Related Patterns

- **Command** — Command records operations for undo; Memento records state for restore — combine them when reversing an operation mathematically is too complex and you'd rather restore the full snapshot.
- **Prototype** — Both copy object state; Prototype creates an independent new instance to build on, Memento creates an opaque snapshot to roll back to — different purposes, same underlying deep-copy discipline for reference types.
