---
title: "Composite"
description: "Compose objects into tree structures so clients can treat individual objects and compositions uniformly through a single interface."
---

# Composite

The Composite pattern composes objects into tree structures so clients can treat individual objects and compositions uniformly through a single interface. In Go, this is one interface implemented by both leaf and composite types; the composite holds a `[]InterfaceType` and recursion falls out naturally from each node calling the same method on its children.

The canonical example is a file system: both files and directories satisfy the same interface, and a directory simply delegates its operations to its entries.

## Scenario

You're tracking disk usage. Files have a size. Directories contain files and other directories. You need to calculate the total size of any entry, but the code treats files and directories differently, with type checks everywhere.

```go
// naive.go
package fs

type File struct {
    Name string
    Size int64
}

type Directory struct {
    Name  string
    Files []File
    Dirs  []Directory
}

func TotalSize(d Directory) int64 {
    total := int64(0)
    for _, f := range d.Files {
        total += f.Size
    }
    for _, sub := range d.Dirs {
        total += TotalSize(sub) // manual recursion, type-aware
    }
    return total
}

// Adding a "SymLink" or "MountPoint" type requires
// modifying TotalSize and every function like it.
```

The code must know about every type in the hierarchy. Adding a new kind of entry means changing `TotalSize` and every similar traversal function.

## Solution

Define a single interface (`Entry`) that both leaf files and composite directories implement. The directory delegates to its children, and the tree structure emerges naturally.

```
┌─────────────────────────┐
│     <<interface>>       │
│         Entry           │
│─────────────────────────│
│ + Size() int64          │
│ + Name() string         │
└────────────┬────────────┘
             │ implements
     ┌───────┼────────┐
     │                │
┌────▼──────┐  ┌──────▼──────┐
│   File    │  │  Directory  │
│ (leaf)    │  │ (composite) │
│           │  │             │
│ Size()    │  │ children    │──► []Entry
│ Name()    │  │ Size()      │    (recursive)
└───────────┘  │ Name()      │
               └─────────────┘
```

```go
package gomark

import "fmt"

type Entry interface {
	Size() int64
	Name() string
}

type File struct {
	name string
	size int64
}

func NewFile(name string, size int64) *File { return &File{name: name, size: size} }
func (f *File) Size() int64                 { return f.size }
func (f *File) Name() string                { return f.name }

type Directory struct {
	name     string
	children []Entry
}

func NewDirectory(name string, children ...Entry) *Directory {
	return &Directory{name: name, children: children}
}

func (d *Directory) Size() int64 {
	total := int64(0)
	for _, c := range d.children {
		total += c.Size()
	}
	return total
}

func (d *Directory) Name() string { return d.name }

func main() {
	readme := NewFile("README.md", 4096)
	mainGo := NewFile("main.go", 8192)
	config := NewFile("config.yaml", 512)

	src := NewDirectory("src", mainGo)
	root := NewDirectory("project", readme, config, src)

	for _, e := range []Entry{readme, src, root} {
		fmt.Printf("%-20s %6d bytes\n", e.Name(), e.Size())
	}
}
```

Output:

```
README.md               4096 bytes
src                     8192 bytes
project                12800 bytes
```

## When to Use

- You have a tree structure where parts and wholes should be treated uniformly.
- Clients shouldn't need to know whether they're working with a single object or a group.
- New component types should be addable without modifying the tree-traversal logic.

## When Not to Use

- Your structure isn't a tree. Composite adds unnecessary complexity to flat collections.
- Leaf and composite types have very different operations. Forcing a common interface creates methods that don't make sense for one side.
- You don't need uniform treatment: it's fine to treat items and groups differently.

## Tradeoffs

The interface gives you clean recursive code and unlimited tree depth with no special cases, but it forces every type in the tree to implement every method on the interface. In practice this means adding a method that makes sense for files but not directories (or vice versa) either requires a no-op implementation or a redesign. The shared interface can become too coarse over time: once `Entry` has `Size()`, `Name()`, `Permissions()`, and `ModTime()`, new leaf types must stub out fields they don't have.

Debugging is the other pain point. An error buried six directories deep surfaces at the top with a stack trace that crosses many identical `Size()` calls; you need to add path context to find which node failed.

## Related Patterns

- **Decorator**: Decorator wraps exactly one object to add behavior; Composite holds a collection of the same interface type to aggregate behavior. If you're wrapping one, use Decorator; if you're aggregating many, use Composite.
- **Iterator**: Composite creates the tree structure; Iterator gives you a consistent way to traverse it without the caller needing to know the tree's shape.
- **Visitor**: Visitor lets you add new operations to a Composite tree without modifying the component types. Reach for it when you have a stable structure but frequently need new traversal operations.
