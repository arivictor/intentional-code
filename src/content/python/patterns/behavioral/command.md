---
title: "Command"
category: behavioral
intent: "Encapsulate a request as an object (or function value), letting you parameterize clients, queue requests, and support undo operations."
idiomSummary: "Represent actions as callables or objects with a single execute-style method."
relatedSlugs: ["chain-of-responsibility", "memento", "strategy"]
tags: [closures, state, events]
---

# Command

In Python, the simplest command is a function value: `queue := []func(){}`. You don't need a struct unless you need `Undo()` or command metadata. When you do, Command encapsulates each operation as a struct that captures everything required to reverse it — the target object, the position, the data that was there before.

The pattern earns its full weight for text editors, transaction systems, and task queues where operations must be reversible, loggable, or replayable.

## Problem

You're building a text editor with undo support. Operations like insert, delete, and replace need to be recorded so they can be reversed. Without Command, the undo logic is tangled with the editing logic.

```python
# editor_naive.py

class Editor:
    content: string

def insert(self, pos, text):
    e.content = e.content[:pos] + text + e.content[pos:]
    # How do you undo this? You'd need to track what was inserted, where.
    # That tracking logic gets tangled with every operation.

def delete(self, pos, length):
    e.content = e.content[:pos] + e.content[pos+length:]
    # To undo, you need to remember what was deleted.
    # This concern bleeds into every method.
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

```python
from typing import Protocol

# editor.py


class Editor:
    content: string

# Command is an undoable operation.
class Command(Protocol):
    def execute(self): ...
    def undo(self): ...

# InsertCommand inserts text at a position.
class InsertCommand:
    editor: Editor
    pos: int
    text: string

def execute(self):
    c.editor.Content = c.editor.Content[:c.pos] + c.text + c.editor.Content[c.pos:]

def undo(self):
    c.editor.Content = c.editor.Content[:c.pos] + c.editor.Content[c.pos+len(c.text):]

# DeleteCommand deletes text at a position.
class DeleteCommand:
    editor: Editor
    pos: int
    length: int
    deleted string // saved for undo

def execute(self):
    c.deleted = c.editor.Content[c.pos : c.pos+c.length]
    c.editor.Content = c.editor.Content[:c.pos] + c.editor.Content[c.pos+c.length:]

def undo(self):
    c.editor.Content = c.editor.Content[:c.pos] + c.deleted + c.editor.Content[c.pos:]

# History manages the undo stack.
class History:
    commands: []Command

def run(self, cmd):
    cmd.Execute()
    h.commands = append(h.commands, cmd)

def undo(self):
    if len(h.commands) == 0 :
        return False
    last = h.commands[len(h.commands)-1]
    last.Undo()
    h.commands = h.commands[:len(h.commands)-1]
    return True
```

```python
# main.py

"editor"
"fmt"

def main():
    e = editor.Editor{Content: "Hello World"}
    h = editor.History{}

    print("Start:", e.Content)

    h.Run(&editor.InsertCommand:Editor: e, Pos: 5, Text: " Beautiful")
    print("After insert:", e.Content)

    h.Run(&editor.DeleteCommand:Editor: e, Pos: 0, Length: 6)
    print("After delete:", e.Content)

    h.Undo()
    print("After undo:", e.Content)

    h.Undo()
    print("After undo:", e.Content)
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
- In Python, if your "command" has no state and no undo, a `func()` is the command. Don't wrap it in a struct.

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
