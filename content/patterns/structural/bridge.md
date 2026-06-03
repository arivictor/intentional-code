---
title: "Bridge"
description: "Split a large type into two separate hierarchies — abstraction and implementation — that can vary independently."
---

# Bridge

The Bridge pattern splits a large type into two separate hierarchies — abstraction and implementation — that can vary independently. In Go, this is typically implemented with two interfaces and a struct that composes them. The abstraction holds a reference to the implementation and delegates calls to it. The key value of Bridge is preventing a cartesian explosion of types when you have two or more independent dimensions of variation. By separating them into two hierarchies, you can add new values to one dimension without multiplying the number of types in the other.

The key question before reaching for Bridge: are these two dimensions truly independent? If they always change together, Bridge adds interfaces for no gain. If adding to one dimension never requires touching the other, Bridge is the right structure.

## Scenario

You're building a report generator that produces reports in different formats (plain text, JSON) and writes them to different outputs (console, file). Without Bridge, you'd need `PlainTextConsoleReport`, `PlainTextFileReport`, `JSONConsoleReport`, `JSONFileReport`: four types, growing quadratically.

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

The formatting logic is duplicated across output-specific types, and the output logic is duplicated across format-specific types. Two independent axes, one tangled mess.

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
package intentionalcode

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
- The two dimensions are tightly coupled and always change together: separation adds complexity without benefit.
- Your type hierarchy is small and unlikely to grow. Two or three concrete types are fine.

## The Decision

Bridge avoids the N×M type explosion by turning it into N+M. That becomes a clear win when each axis has three or more options. Before you reach that size, though, two interfaces plus a composition struct can feel like extra structure with little payoff. The abstraction-versus-implementation split is also not always obvious. Teams often debate where a new feature belongs, and a bad choice can force refactoring later.

In Go, Bridge can look very similar to Strategy at first. The key difference is scope: Strategy varies one algorithm, while Bridge models two independent axes that stay connected through composition. If your design has only one axis of variation, Strategy is usually the simpler choice. If it has two independent axes, Bridge usually justifies the extra structure.

## Related Patterns

- **Adapter**: Adapter fixes an existing mismatch between two interfaces after the fact; Bridge designs the separation upfront so two dimensions can evolve independently without ever creating the mismatch.
- **Strategy**: Strategy varies one algorithm pluggably via an interface; Bridge varies two dimensions simultaneously. If you only have one dimension of variation, Strategy is simpler and clearer.
