---
title: "Bridge"
category: structural
intent: "Split a large type into two separate hierarchies — abstraction and implementation — that can vary independently."
idiomSummary: "Split abstraction and implementation into two interfaces composed by struct fields."
relatedSlugs: ["adapter", "strategy"]
tags: [interfaces, composition, dependency-inversion]
---

# Bridge

Bridge's identifying signal is a type hierarchy growing in two independent directions at once. Left unchecked, this produces a cartesian explosion: 3 formats × 3 outputs = 9 types; add a format and you add 3 types; add an output and you add 3 more. Bridge collapses this to 3 + 3 = 6 by splitting the two dimensions into two interfaces that compose via struct field, not inheritance.

The key question before reaching for Bridge: are these two dimensions truly independent? If they always change together, Bridge adds interfaces for no gain. If adding to one dimension never requires touching the other, Bridge is the right structure.

## Problem

You're building a report generator that produces reports in different formats (plain text, JSON) and writes them to different outputs (console, file). Without Bridge, you'd need `PlainTextConsoleReport`, `PlainTextFileReport`, `JSONConsoleReport`, `JSONFileReport` — four types, growing quadratically.

```go
// explosion.go
package report

// Without Bridge: one type per (format × output) combination.
// Adding a new output means adding one type per format.
// Adding a new format means adding one type per output.

type PlainTextConsoleReport struct{}
func (r *PlainTextConsoleReport) Generate(data string) { /* format as text, write to console */ }

type PlainTextFileReport struct{}
func (r *PlainTextFileReport) Generate(data string) { /* format as text, write to file */ }

type JSONConsoleReport struct{}
func (r *JSONConsoleReport) Generate(data string) { /* format as JSON, write to console */ }

type JSONFileReport struct{}
func (r *JSONFileReport) Generate(data string) { /* format as JSON, write to file */ }

// Adding "CSV" format means 2 more types.
// Adding "network" output means 2 more types.
```

The formatting logic (how to shape the data) is duplicated across output-specific types, and the output logic is duplicated across format-specific types. Two independent axes, one tangled mess.

## Solution

Separate the two dimensions into two interfaces. The abstraction (formatter) holds a reference to the implementation (writer). They vary independently.

```
┌────────────────────┐         ┌──────────────────┐
│   <<interface>>    │         │  <<interface>>   │
│   Formatter        │         │   Writer         │
│────────────────────│         │──────────────────│
│ Format(data) string│────────►│ Write(s string)  │
└────────┬───────────┘  uses   └────────┬─────────┘
         │                              │
   ┌─────┼──────┐               ┌───────┼──────┐
   │            │               │              │
 Plain        JSON          Console          File
 Text         Fmt            Writer          Writer
```

```go
package main

import (
	"fmt"
	"os"
)

type Writer interface {
	Write(s string)
}

type ConsoleWriter struct{}

func (w *ConsoleWriter) Write(s string) { fmt.Println(s) }

type FileWriter struct {
	Path string
}

func (w *FileWriter) Write(s string) {
	f, err := os.OpenFile(w.Path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintln(f, s)
}

type Formatter struct {
	writer Writer
}

type PlainTextFormatter struct{ Formatter }

func NewPlainText(w Writer) *PlainTextFormatter {
	return &PlainTextFormatter{Formatter{writer: w}}
}

func (f *PlainTextFormatter) Generate(data string) {
	f.writer.Write("Report: " + data)
}

type JSONFormatter struct{ Formatter }

func NewJSON(w Writer) *JSONFormatter {
	return &JSONFormatter{Formatter{writer: w}}
}

func (f *JSONFormatter) Generate(data string) {
	f.writer.Write(fmt.Sprintf(`{"report": %q}`, data))
}

func main() {
	console := &ConsoleWriter{}
	file := &FileWriter{Path: "/tmp/report.log"}

	NewPlainText(console).Generate("sales up 12%")
	NewJSON(console).Generate("sales up 12%")
	NewPlainText(file).Generate("sales up 12%")
	NewJSON(file).Generate("sales up 12%")
}
```

Output (console):

```
Report: sales up 12%
{"report": "sales up 12%"}
```

## When to Use

- You have two or more independent dimensions of variation that would otherwise create a type explosion.
- You want to change the implementation at runtime (swap console for file).
- The abstraction and implementation should be able to evolve independently.

## When Not to Use

- You only have one dimension of variation. Use a simple interface instead.
- The two dimensions are tightly coupled and always change together — separation adds complexity without benefit.
- Your type hierarchy is small and unlikely to grow. Two or three concrete types are fine.

## Tradeoffs

Bridge prevents a N×M type explosion by decomposing it into N+M — a real win once you have three or more values on each axis. Before that point, the two interfaces and the composition struct feel like overhead for no reason. The abstraction/implementation split is also non-obvious: teams frequently argue about which side a new feature belongs on, and getting it wrong means refactoring later. In Go, Bridge can look identical to Strategy at a glance — the difference is that Strategy varies one algorithm while Bridge explicitly holds two dimensions in a stable, composed relationship. If you have one axis, use Strategy; if you have two, Bridge earns its structure.

## Related Patterns

- **Adapter** — Adapter fixes an existing mismatch between two interfaces after the fact; Bridge designs the separation upfront so two dimensions can evolve independently without ever creating the mismatch.
- **Strategy** — Strategy varies one algorithm pluggably via an interface; Bridge varies two dimensions simultaneously — if you only have one dimension of variation, Strategy is simpler and clearer.
