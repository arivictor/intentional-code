---
title: "Command"
category: behavioral
intent: "Encapsulate a request as an object (or function value), letting you parameterize clients, queue requests, and support undo operations."
goIdiomSummary: "A function value, or a struct with Execute(); queue/undo via a stack of commands."
relatedSlugs: ["chain-of-responsibility", "memento", "strategy"]
---

# Command

In Go, the simplest command is a function value: `queue := []func(){}`. You don't need a struct unless you need `Undo()` or command metadata. When you do, Command encapsulates each operation as a struct that captures everything required to reverse it — the target object, the position, the data that was there before.

The pattern earns its full weight for text editors, transaction systems, and task queues where operations must be reversible, loggable, or replayable.

## Problem

You're building a text editor with undo support. Operations like insert, delete, and replace need to be recorded so they can be reversed. Without Command, the undo logic is tangled with the editing logic.

```go
// editor_naive.go
package editor

type Editor struct {
    content string
}

func (e *Editor) Insert(pos int, text string) {
    e.content = e.content[:pos] + text + e.content[pos:]
    // How do you undo this? You'd need to track what was inserted, where.
    // That tracking logic gets tangled with every operation.
}

func (e *Editor) Delete(pos, length int) {
    e.content = e.content[:pos] + e.content[pos+length:]
    // To undo, you need to remember what was deleted.
    // This concern bleeds into every method.
}
```

Each operation knows how to do its work but not how to undo it. Adding undo means modifying every operation to also record inverse information. The editor becomes responsible for both editing and history management.

## Solution

Define a `Command` interface with `Execute()` and `Undo()` methods. Each operation is a struct that captures everything needed to reverse it. A history stack manages undo.

```
┌─────────────────┐     ┌─────────────────┐
│   <<interface>> │     │    Editor       │
│    Command      │     │                 │
│─────────────────│     │ content string  │
│ Execute()       │────►│                 │
│ Undo()          │     └─────────────────┘
└────────┬────────┘
         │ implements
   ┌─────┼──────┐
   │            │
InsertCmd   DeleteCmd

History: [cmd1, cmd2, cmd3] ← Undo pops and calls Undo()
```

```go
// editor.go
package editor

import "fmt"

type Editor struct {
    Content string
}

// Command is an undoable operation.
type Command interface {
    Execute()
    Undo()
}

// InsertCommand inserts text at a position.
type InsertCommand struct {
    editor *Editor
    pos    int
    text   string
}

func (c *InsertCommand) Execute() {
    c.editor.Content = c.editor.Content[:c.pos] + c.text + c.editor.Content[c.pos:]
}

func (c *InsertCommand) Undo() {
    c.editor.Content = c.editor.Content[:c.pos] + c.editor.Content[c.pos+len(c.text):]
}

// DeleteCommand deletes text at a position.
type DeleteCommand struct {
    editor  *Editor
    pos     int
    length  int
    deleted string // saved for undo
}

func (c *DeleteCommand) Execute() {
    c.deleted = c.editor.Content[c.pos : c.pos+c.length]
    c.editor.Content = c.editor.Content[:c.pos] + c.editor.Content[c.pos+c.length:]
}

func (c *DeleteCommand) Undo() {
    c.editor.Content = c.editor.Content[:c.pos] + c.deleted + c.editor.Content[c.pos:]
}

// History manages the undo stack.
type History struct {
    commands []Command
}

func (h *History) Run(cmd Command) {
    cmd.Execute()
    h.commands = append(h.commands, cmd)
}

func (h *History) Undo() bool {
    if len(h.commands) == 0 {
        return false
    }
    last := h.commands[len(h.commands)-1]
    last.Undo()
    h.commands = h.commands[:len(h.commands)-1]
    return true
}
```

```go
// main.go
package main

import (
    "editor"
    "fmt"
)

func main() {
    e := &editor.Editor{Content: "Hello World"}
    h := &editor.History{}

    fmt.Println("Start:", e.Content)

    h.Run(&editor.InsertCommand{Editor: e, Pos: 5, Text: " Beautiful"})
    fmt.Println("After insert:", e.Content)

    h.Run(&editor.DeleteCommand{Editor: e, Pos: 0, Length: 6})
    fmt.Println("After delete:", e.Content)

    h.Undo()
    fmt.Println("After undo:", e.Content)

    h.Undo()
    fmt.Println("After undo:", e.Content)
}
```

Output:

```
Start: Hello World
After insert: Hello Beautiful World
After delete: Beautiful World
After undo: Hello Beautiful World
After undo: Hello World
```

> When you don't need undo, a Go function value is the simplest command. `queue := []func(){}` — push functions onto it, pop and call. Only use the struct-based form when you need `Undo()` or command metadata.

## When to Use

- You need undo/redo functionality.
- You want to queue, schedule, or log operations.
- You need to parameterize objects with operations (callback-like patterns).
- For simple one-off commands without undo, a plain function value is sufficient.

## When Not to Use

- The operations are fire-and-forget with no need for undo, queuing, or logging. A function call is simpler.
- In Go, if your "command" has no state and no undo, a `func()` is the command. Don't wrap it in a struct.

## Advantages

- Decouples the invoker from the operation — the caller doesn't need to know what happens.
- Enables undo, redo, queuing, and logging of operations.
- Commands can be serialized, transmitted, and replayed.

## Disadvantages

- Each operation needs its own struct — boilerplate for simple actions.
- Undo logic can be complex and error-prone for operations with side effects.
- For simple cases, a function value is less ceremony.

## Related Patterns

- **Chain of Responsibility** — Commands can be the handlers in a chain, combining pipeline composability with Command's undo and queuing capabilities.
- **Memento** — Use Memento alongside Command when reversing an operation isn't enough and you need to restore a full state snapshot — Command records what happened, Memento records what was.
- **Strategy** — Both encapsulate behavior as a value; reach for Strategy when you need interchangeable algorithms, Command when you also need undo, queuing, or logging of the operations.
