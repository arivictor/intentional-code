# Prototype

Go's struct assignment copies by value — clean for `string` and `int` fields, but silently dangerous for `[]string`, `map[string]string`, and pointer fields, which share the same underlying memory with the original. The value of Prototype in Go is not performance (avoiding expensive constructors) but correctness: a `Clone()` method makes deep-copy semantics explicit and localized, so reference types are never accidentally shared between what you thought were independent copies.

## Problem

You have a document template system. Users start from a template and customize it. The template has nested structures — paragraphs, metadata maps, style settings. You need independent copies, but Go's assignment operator only does a shallow copy. Modifying the "copy" mutates the original.

```go
// shallow_bug.go
package document

type Document struct {
    Title      string
    Author     string
    Tags       []string
    Metadata   map[string]string
    Paragraphs []*Paragraph
}

type Paragraph struct {
    Text  string
    Style string
}

func main() {
    original := &Document{
        Title:  "Template",
        Tags:   []string{"draft"},
        Metadata: map[string]string{"version": "1"},
        Paragraphs: []*Paragraph{{Text: "Hello", Style: "normal"}},
    }

    // WRONG: shallow copy — slices and maps share underlying memory
    copy := *original
    copy.Title = "My Document"     // safe — string is a value
    copy.Tags = append(copy.Tags, "mine") // DANGER: mutates original.Tags!
    copy.Metadata["author"] = "me"       // DANGER: mutates original.Metadata!
    copy.Paragraphs[0].Text = "Changed"  // DANGER: mutates original!
}
```

The struct assignment copies the struct's fields by value, but slices, maps, and pointers hold references. The "copy" and original share the same underlying arrays and maps. This is a common source of subtle bugs in Go, especially in concurrent code.

## Solution

Implement a `Clone()` method that explicitly deep-copies every reference type. This is tedious but necessary, and making it a method ensures the copy logic lives with the type rather than scattered across callers.

```
┌───────────────┐    Clone()    ┌───────────────┐
│   original    │──────────────►│     copy      │
│───────────────│               │───────────────│
│ Title: "Tmpl" │               │ Title: "Tmpl" │
│ Tags ──────►[draft]           │ Tags ──────►[draft]  ◄── new slice
│ Meta ──────►{v:1}             │ Meta ──────►{v:1}    ◄── new map
│ Paras ─────►[*P1]            │ Paras ─────►[*P2]    ◄── new slice
│              │                │              │           of new ptrs
└───────────────┘               └───────────────┘
```

The `Paragraph` type gets its own Clone method:

```go
// paragraph.go
package document

type Paragraph struct {
    Text  string
    Style string
}

func (p *Paragraph) Clone() *Paragraph {
    return &Paragraph{
        Text:  p.Text,
        Style: p.Style,
    }
}
```

The `Document`'s Clone method deep-copies every field:

```go
// document.go
package document

type Document struct {
    Title      string
    Author     string
    Tags       []string
    Metadata   map[string]string
    Paragraphs []*Paragraph
}

func (d *Document) Clone() *Document {
    clone := &Document{
        Title:  d.Title,
        Author: d.Author,
    }

    if d.Tags != nil {
        clone.Tags = make([]string, len(d.Tags))
        copy(clone.Tags, d.Tags)
    }

    if d.Metadata != nil {
        clone.Metadata = make(map[string]string, len(d.Metadata))
        for k, v := range d.Metadata {
            clone.Metadata[k] = v
        }
    }

    if d.Paragraphs != nil {
        clone.Paragraphs = make([]*Paragraph, len(d.Paragraphs))
        for i, p := range d.Paragraphs {
            clone.Paragraphs[i] = p.Clone()
        }
    }

    return clone
}
```

```go
// main.go
package main

import "fmt"

func main() {
    template := &Document{
        Title:    "Invoice Template",
        Tags:     []string{"template", "finance"},
        Metadata: map[string]string{"version": "1.0"},
        Paragraphs: []*Paragraph{
            {Text: "Dear Customer,", Style: "heading"},
            {Text: "Thank you for your purchase.", Style: "body"},
        },
    }

    invoice := template.Clone()
    invoice.Title = "Invoice #1042"
    invoice.Tags = append(invoice.Tags, "sent")
    invoice.Metadata["customer"] = "Acme Corp"
    invoice.Paragraphs[0].Text = "Dear Acme Corp,"

    fmt.Printf("Template: %s, tags=%v\n", template.Title, template.Tags)
    fmt.Printf("Invoice:  %s, tags=%v\n", invoice.Title, invoice.Tags)
    fmt.Printf("Template para[0]: %s\n", template.Paragraphs[0].Text)
    fmt.Printf("Invoice  para[0]: %s\n", invoice.Paragraphs[0].Text)
}
```

Output:

```
Template: Invoice Template, tags=[template finance]
Invoice:  Invoice #1042, tags=[template finance sent]
Template para[0]: Dear Customer,
Invoice  para[0]: Dear Acme Corp,
```

## When to Use

- You need to create objects that are variations of an existing instance, and construction from scratch is expensive or complex.
- You want to decouple code from the concrete types it copies — work with a `Cloneable` interface.
- Your types contain reference types (slices, maps, pointers) and you need truly independent copies.

## When Not to Use

- Your type is simple and has only value fields — plain struct assignment is the correct copy mechanism.
- Deep copying is too expensive for your use case — consider immutable shared state ([Flyweight](/go/patterns/structural/flyweight)) instead.
- You only need a few variations — a constructor with parameters is simpler than cloning and modifying.

## Advantages

- Makes copy semantics explicit — no hidden sharing of reference types.
- New objects without knowing their concrete type (via a `Cloneable` interface).
- Avoids complex construction when the prototype already has the right shape.

## Disadvantages

- Deep copy code is tedious and must be updated whenever fields are added.
- No compiler enforcement — if you add a slice field and forget to clone it, you get a subtle bug.
- Circular references make deep copying significantly harder.
- Performance cost of copying large object graphs.

## Related Patterns

- **Factory Method** — Use Factory Method when creating an object from scratch is straightforward and the choice of which concrete type matters; use Prototype when the existing state of an instance is the right starting point for a new independent copy.
- **Memento** — Memento also copies object state, but for undo/restore rather than creating new independent instances; the distinction is purpose — Memento saves a snapshot to roll back to, Prototype creates a new peer to build on separately.
