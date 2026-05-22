---
title: "Memento"
category: behavioral
intent: "Capture and externalize an object's internal state so it can be restored later, without violating encapsulation."
idiomSummary: "Capture/restore via an opaque type with unexported fields; originator owns save/restore."
relatedSlugs: ["command", "prototype"]
tags: [state]
---

# Memento

Go's package system gives Memento a clean implementation that many languages struggle with: a type's unexported fields are accessible only within its own package. This lets the originator (same package as the memento) save and restore state through a `*Memento` that external code can hold and pass around but cannot read or modify - encapsulation enforced by the compiler, not convention.

The pattern is the encapsulated complement to [Prototype](/go/patterns/creational/prototype): Prototype clones state for independent use; Memento snapshots state for guarded restoration.

## Problem

You're building a text editor with an undo history. The editor's state - the text content and the cursor position - needs to be snapshotted and restored. But exposing that state publicly means any code in the program can tamper with a saved snapshot.

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

With public fields, nothing prevents external code from modifying a saved state. The caretaker (whoever stores snapshots) can accidentally - or intentionally - corrupt them.

## Solution

Create a memento type with unexported fields in the same package as the originator. External packages can hold a `*Memento` but can't read or modify its contents.

```
┌──────────────┐  Save()  ┌──────────────┐
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
package main

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

- The state is simple and public anyway - just copy the struct.
- Snapshots would consume too much memory (large or frequent states).
- You only need undo for individual operations - Command with `Undo()` is lighter.

## Tradeoffs

Go's unexported fields make the opaqueness genuinely compile-time-enforced - the caretaker literally cannot read or modify the snapshot contents, which is a stronger guarantee than most patterns achieve. The cost is memory: each snapshot is a full copy of the state, so a deep undo history for a large document becomes expensive quickly. Reference types (slices, maps, pointers) must be deep-copied in `Save()` - forgetting this means the snapshot and the live object share underlying memory, and the "snapshot" mutates silently when you edit. The other common trap is that the opaque memento makes debugging hard: if a restore produces the wrong state, you can't inspect the memento without adding a debug method in its package.

## Related Patterns

- **Command** - Command records operations for undo; Memento records state for restore - combine them when reversing an operation mathematically is too complex and you'd rather restore the full snapshot.
- **Prototype** - Both copy object state; Prototype creates an independent new instance to build on, Memento creates an opaque snapshot to roll back to - different purposes, same underlying deep-copy discipline for reference types.
