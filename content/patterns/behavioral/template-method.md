---
title: "Template Method"
description: "Define the skeleton of an algorithm in a base operation, deferring some steps to subclasses — but in Go, use composition and injected hook functions instead."
---

# Template Method

Template Method defines the skeleton of an algorithm in a base class, letting subclasses override specific steps. In Go, this pattern fights the language: there's no inheritance, no abstract classes, no method overriding. But the problem it solves is real. You need a fixed algorithm structure with pluggable steps.

The Go solution: pass the variable steps as function values or interfaces via composition. Same result, without fighting the language.

## Scenario

You're generating reports in different formats: plain text, CSV, and JSON. The overall process is identical (write a header, write each row, write a footer) but the formatting step differs. The skeleton is duplicated for each format.

```go
// duplicated.go
package report

func RenderText(rows []string) string {
    out := "=== Report ===\n"
    for _, r := range rows {
        out += "  " + r + "\n"
    }
    out += "==============\n"
    return out
}

func RenderCSV(rows []string) string {
    out := "row\n"
    for _, r := range rows {
        out += r + "\n"
    }
    return out
}

// The skeleton (header → rows → footer) is duplicated.
// Only the formatting differs. Adding Markdown means copying again.
```

The algorithm skeleton is copy-pasted for every format. Adding a new format means duplicating the whole function and changing a few lines.

## Solution

In Go, inject the variable step as a function parameter. The skeleton is written once; the formatting functions are passed in.

```
Render(rows, formatter)
  │
  ├── header()           ← from formatter
  ├── formatRow(row)     ← from formatter
  └── footer()           ← from formatter

formatter = TextFormatter │ CSVFormatter │ JSONFormatter
```

Define a `Formatter` struct carrying the three hook functions. Run it to render the same rows through three formatters that share one skeleton:

```go:title="main.go":run=true
package main

import (
	"fmt"
	"strings"
)

type Formatter struct {
	Header    func() string
	FormatRow func(row string) string
	Footer    func() string
}

func Render(rows []string, f Formatter) string {
	var b strings.Builder
	b.WriteString(f.Header())
	for _, row := range rows {
		b.WriteString(f.FormatRow(row))
	}
	b.WriteString(f.Footer())
	return b.String()
}

var TextFormatter = Formatter{
	Header:    func() string { return "=== Report ===\n" },
	FormatRow: func(row string) string { return "  " + row + "\n" },
	Footer:    func() string { return "==============\n" },
}

var CSVFormatter = Formatter{
	Header:    func() string { return "row\n" },
	FormatRow: func(row string) string { return row + "\n" },
	Footer:    func() string { return "" },
}

var MarkdownFormatter = Formatter{
	Header:    func() string { return "| row |\n|-----|\n" },
	FormatRow: func(row string) string { return "| " + row + " |\n" },
	Footer:    func() string { return "" },
}

func main() {
	rows := []string{"Alice", "Bob", "Charlie"}

	fmt.Print(Render(rows, TextFormatter))
	fmt.Print(Render(rows, CSVFormatter))
	fmt.Print(Render(rows, MarkdownFormatter))
}
```

Output:

```
=== Report ===
  Alice
  Bob
  Charlie
==============

row
Alice
Bob
Charlie

| row |
|-----|
| Alice |
| Bob |
| Charlie |
```

> In Go, Template Method as described in the GoF book (using inheritance and method overriding) is impossible and should not be attempted. The idiomatic Go solution, injecting hook functions or accepting an interface with the variable steps, achieves the same goal through composition.

## When to Use

- You have an algorithm with a fixed structure and one or two steps that vary.
- In Go: use this when you'd use Template Method in Java, but pass function values instead of overriding methods.

## When Not to Use

- Most or all steps vary. You don't have a fixed skeleton; you have a completely different algorithm. Use [Strategy](/go/patterns/behavioral/strategy) instead.
- The skeleton is trivial (2-3 lines). Just inline it.

## The Decision

Function injection is lightweight in Go. No new types required, and the variable steps are explicit in the function signature.

The cost appears when there are many hooks: a `Formatter` struct with five or six fields of type `func() string` becomes hard to initialize correctly, and callers must fill every field or get a nil panic at runtime. An interface enforces completeness at compile time, so prefer an interface over a struct-of-functions when the number of hooks grows beyond two or three. The fixed steps in the skeleton are deliberately non-overridable (that's the whole point), but this can feel limiting when a caller needs a slightly different skeleton. At that point, reach for Strategy, which replaces the whole algorithm rather than plugging in pieces.

## Related Patterns

- **Strategy**: Strategy replaces the entire algorithm; Template Method holds the skeleton fixed and replaces one or two steps. Prefer Strategy when the overall structure varies, Template Method when only the details do.
- **Factory Method**: Factory Method is commonly used as one pluggable step inside a Template Method skeleton, where the "how to create the object" step varies while the overall process stays fixed.
