---
title: "Command"
category: behavioral
intent: "Encapsulate a request as an object (or function value), letting you parameterize clients, queue requests, and support undo operations."
idiomSummary: "A function value, or a struct with Execute(); queue/undo via a stack of commands."
relatedSlugs: ["chain-of-responsibility", "memento", "strategy"]
tags: [closures, state, events]
---

# Command

In Go, the simplest command is a function value: `queue := []func(){}`. You don't need a struct unless you need `Undo()` or command metadata. When you do, Command encapsulates each operation as a struct that captures everything required to reverse it - the target object, the position, the data that was there before.

The pattern earns its full weight for text editors, transaction systems, and task queues where operations must be reversible, loggable, or replayable.

## Problem

You're building a text editor with undo support. Operations like insert and delete need to be recorded so they can be reversed. Without Command, the undo logic is tangled with the editing logic.

```go
// editor_naive.go
package editor

type Editor struct {
    content string
}

func (e *Editor) Insert(pos int, text string) {
    e.content = e.content[:pos] + text + e.content[pos:]
    // To undo this you need to track what was inserted and where.
    // That tracking leaks into every operation.
}

func (e *Editor) Delete(pos, length int) {
    e.content = e.content[:pos] + e.content[pos+length:]
    // To undo, you need to remember what was deleted.
    // This concern bleeds into every method.
}
```

Each operation knows how to do its work but not how to undo it. The editor becomes responsible for both editing and history management, and those concerns tangle together.

## Solution

Define a `Command` interface with `Execute()` and `Undo()`. Each operation is a struct that captures everything needed to reverse it. A history stack manages undo.

```
Command interface          Editor
├── InsertCmd ─────────► content string
└── DeleteCmd

History: [cmd1, cmd2, cmd3] ← Undo pops and calls Undo()
```

```go
package main

import "fmt"

type Command interface {
	Execute()
	Undo()
}

type Editor struct {
	Content string
}

type InsertCommand struct {
	Editor *Editor
	Pos    int
	Text   string
}

func (c *InsertCommand) Execute() {
	c.Editor.Content = c.Editor.Content[:c.Pos] + c.Text + c.Editor.Content[c.Pos:]
}

func (c *InsertCommand) Undo() {
	c.Editor.Content = c.Editor.Content[:c.Pos] + c.Editor.Content[c.Pos+len(c.Text):]
}

type DeleteCommand struct {
	Editor  *Editor
	Pos     int
	Length  int
	deleted string
}

func (c *DeleteCommand) Execute() {
	c.deleted = c.Editor.Content[c.Pos : c.Pos+c.Length]
	c.Editor.Content = c.Editor.Content[:c.Pos] + c.Editor.Content[c.Pos+c.Length:]
}

func (c *DeleteCommand) Undo() {
	c.Editor.Content = c.Editor.Content[:c.Pos] + c.deleted + c.Editor.Content[c.Pos:]
}

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

func main() {
	e := &Editor{Content: "Hello World"}
	h := &History{}

	fmt.Println("Start:       ", e.Content)

	h.Run(&InsertCommand{Editor: e, Pos: 5, Text: " Beautiful"})
	fmt.Println("After insert:", e.Content)

	h.Run(&DeleteCommand{Editor: e, Pos: 0, Length: 6})
	fmt.Println("After delete:", e.Content)

	h.Undo()
	fmt.Println("After undo:  ", e.Content)

	h.Undo()
	fmt.Println("After undo:  ", e.Content)
}
```

Output:

```
Start:        Hello World
After insert: Hello Beautiful World
After delete: Beautiful World
After undo:   Hello Beautiful World
After undo:   Hello World
```

> When you don't need undo, a Go function value is the simplest command. `queue := []func(){}` - push functions onto it, pop and call. Only use the struct-based form when you need `Undo()` or command metadata.

## When to Use

- You need undo/redo functionality.
- You want to queue, schedule, or log operations.
- You need to parameterize objects with operations (callback-like patterns).
- For simple one-off commands without undo, a plain function value is sufficient.

## When Not to Use

- The operations are fire-and-forget with no need for undo, queuing, or logging. A function call is simpler.
- In Go, if your "command" has no state and no undo, a `func()` is the command. Don't wrap it in a struct.

## Tradeoffs

The function-value form costs nothing and is completely idiomatic - if you just need to queue work, use `[]func()`. The struct form earns its weight only when you need undo: each command must capture a complete snapshot of what it changed, which is easy for simple mutations (a position and a string) but gets expensive fast for operations on large data structures. Undo logic is also where bugs hide - the `Execute` path gets tested constantly, but `Undo` only runs when the user hits ctrl-Z, so subtle state corruption can go unnoticed for a long time. The history stack has no built-in redo: if you undo and then run a new command, the redo branch is silently discarded unless you explicitly track it.

## Related Patterns

- **Chain of Responsibility** - Commands can be the handlers in a chain, combining pipeline composability with Command's undo and queuing capabilities.
- **Memento** - Use Memento alongside Command when reversing an operation isn't enough and you need to restore a full state snapshot - Command records what happened, Memento records what was.
- **Strategy** - Both encapsulate behavior as a value; reach for Strategy when you need interchangeable algorithms, Command when you also need undo, queuing, or logging of the operations.
