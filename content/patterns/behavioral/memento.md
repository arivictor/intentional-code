---
title: "Memento"
description: "Capture and externalize an object's internal state so it can be restored later, without violating encapsulation."
---

# Memento

The Memento pattern lets an object save a snapshot of its internal state and restore it later, without exposing that internal state to the rest of the program.

In plain English: "save state now, restore it later, and do not let outside code peek inside the snapshot."

This is useful for undo, checkpoints, and rollback behavior.

The important rule is that the snapshot (the memento) is opaque. The originator, the object that created the snapshot, is the only code that can read or change it.

Go makes this pattern clean because of package visibility. If `Memento` has unexported fields and lives in the same package as the originator, outside packages can hold `*Memento` values and pass them around, but cannot read or modify snapshot contents. That means encapsulation is enforced by the compiler, not by team convention.

You can think of Memento as the encapsulated complement to [Prototype](/go/patterns/creational/prototype): Prototype copies state so you can branch and continue independently; Memento captures state so you can safely return to it later.

## Scenario

You're building a text editor with an undo history. The editor's state (text content and cursor position) needs to be snapshotted and restored. Exposing that state publicly means any code in the program can tamper with a saved snapshot.

```go
// exposed.go
package editor

// Exposing all state publicly for save/restore
type Snapshot struct {
    Content string
    Cursor  int
}

// Anyone can modify a "save":
//   snap.Content = "injected content"
//   snap.Cursor = -1
// There's no encapsulation boundary between creator and holder.
```

With public fields, nothing prevents external code from modifying saved state. The caretaker (whoever stores snapshots) can accidentally, or intentionally, corrupt them.

## Solution

Create a memento type with unexported fields in the same package as the originator. External packages can hold a `*Memento` but can't read or modify its contents.

```
┌──────────────┐  Save() ┌──────────────┐
│   Editor     │────────►│   Memento    │
│ (originator) │         │ (opaque)     │
│              │◄────────│ unexported   │
│  Restore()   │         │ fields       │
└──────────────┘         └──────────────┘
                              │
                    Caretaker holds []*Memento
                    but can't read contents
```

```go
package intentionalcode

import "fmt"

type Memento struct {
	content string
	cursor  int
}

type Editor struct {
	content string
	cursor  int
}

func NewEditor(content string) *Editor {
	return &Editor{content: content}
}

func (e *Editor) Type(text string) {
	e.content = e.content[:e.cursor] + text + e.content[e.cursor:]
	e.cursor += len(text)
}

func (e *Editor) Save() *Memento {
	return &Memento{content: e.content, cursor: e.cursor}
}

func (e *Editor) Restore(m *Memento) {
	e.content = m.content
	e.cursor = m.cursor
}

func (e *Editor) String() string {
	return fmt.Sprintf("%q (cursor=%d)", e.content, e.cursor)
}

func main() {
	e := NewEditor("Hello")
	fmt.Println("Start:     ", e)

	snap1 := e.Save()

	e.Type(" World")
	fmt.Println("After type:", e)

	snap2 := e.Save()

	e.Type("!!!")
	fmt.Println("After more:", e)

	e.Restore(snap2)
	fmt.Println("Undo:      ", e)

	e.Restore(snap1)
	fmt.Println("Undo again:", e)
}
```

Output:

```
Start:   "Hello" (cursor=5)
After type: "Hello World" (cursor=11)
After more: "Hello World!!!" (cursor=14)
Undo:       "Hello World" (cursor=11)
Undo again: "Hello" (cursor=5)
```

## When to Use

- You need save/restore or undo functionality with encapsulated state.
- External code should be able to hold snapshots but not inspect or modify them.
- The state to capture is complex (multiple fields, nested structures).

## When Not to Use

- The state is simple and public anyway. Just copy the struct.
- Snapshots would consume too much memory (large or frequent states).
- You only need undo for individual operations. Command with `Undo()` is lighter.

## The Decision

Go's unexported fields make the opaqueness genuinely compile-time-enforced. The caretaker literally cannot read or modify snapshot contents, which is a stronger guarantee than most patterns achieve.

The cost is memory: each snapshot is a full copy of state, so a deep undo history for a large document gets expensive fast. Reference types (slices, maps, pointers) must be deep-copied in `Save()`. Forget this and the snapshot shares underlying memory with the live object; your "saved state" mutates silently whenever you edit. The other common trap is that the opaque memento makes debugging hard: if a restore produces the wrong state, you can't inspect the memento without adding a debug method inside its package.

## Related Patterns

- **Command**: Command records operations for undo; Memento records state for restore. Combine them when reversing an operation mathematically is too complex and you'd rather restore the full snapshot.
- **Prototype**: Both copy object state. Prototype creates an independent new instance to build on; Memento creates an opaque snapshot to roll back to. Different purposes, same underlying deep-copy discipline for reference types.
