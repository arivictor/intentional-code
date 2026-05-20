---
title: "Abstract Factory"
category: creational
intent: "Provide an interface whose methods each return related product interfaces, so families of related objects can be created without specifying their concrete types."
idiomSummary: "An interface whose methods each return related product interfaces; one struct per family."
relatedSlugs: ["factory-method", "builder"]
tags: [interfaces, composition, dependency-inversion, testability]
---

# Abstract Factory

Abstract Factory solves a specific problem: your system needs families of related objects that must be used together — a JSON encoder paired with a JSON decoder, not a JSON encoder with a CSV decoder — and the entire family should be swappable as a unit.

In Go, the pattern is an interface whose methods each return a product interface. One struct per family satisfies the factory interface, and the compiler enforces that code written against that interface can never accidentally mix families. This is the critical advantage over individual [Factory Methods](/go/patterns/creational/factory-method): a factory method prevents you from picking the wrong *type*, but it can't prevent you from picking types from different families.

## Problem

You're building a data pipeline that reads records and writes them out in some format. You need to support both JSON and CSV. The naive approach instantiates readers and writers separately, with nothing stopping a caller from pairing a JSON reader with a CSV writer.

```go
// pipeline_naive.go
package pipeline

import "fmt"

func NewReader(format string) {
    switch format {
    case "json":
        fmt.Println("creating JSON reader")
    case "csv":
        fmt.Println("creating CSV reader")
    }
}

func NewWriter(format string) {
    switch format {
    case "json":
        fmt.Println("creating JSON writer")
    case "csv":
        fmt.Println("creating CSV writer")
    }
}

// Nothing prevents: NewReader("json") + NewWriter("csv")
// Every new format × every new component = more switch cases.
```

Two problems: the switch statements grow with every format and component, and there's no guarantee that reader and writer come from the same format family. A mismatched pair silently produces corrupted output.

## Solution

Define product interfaces (`Reader`, `Writer`) and a factory interface whose methods return them. Each format gets one factory struct that produces a consistent, matched pair.

```
┌─────────────────────┐
│   <<interface>>     │
│   FormatFactory     │
│─────────────────────│
│ + NewReader() Reader│──► Reader interface
│ + NewWriter() Writer│──► Writer interface
└─────────┬───────────┘
          │ implements
    ┌─────┼──────┐
    │            │
┌───▼────┐ ┌────▼───┐
│  JSON  │ │  CSV   │
│Factory │ │Factory │
└────────┘ └────────┘
```

Define the product interfaces:

```go
// products.go
package pipeline

// Reader reads records from an input source.
type Reader interface {
    Read() (string, error)
}

// Writer writes records to an output sink.
type Writer interface {
    Write(record string) error
}
```

Define the abstract factory interface:

```go
// factory.go
package pipeline

// FormatFactory creates a matched reader/writer pair for one format.
type FormatFactory interface {
    NewReader() Reader
    NewWriter() Writer
}
```

Implement a JSON family:

```go
// json.go
package pipeline

import "fmt"

type jsonReader struct{}

func (r *jsonReader) Read() (string, error) { return `{"status":"ok"}`, nil }

type jsonWriter struct{}

func (w *jsonWriter) Write(record string) error {
    fmt.Println("[json]", record)
    return nil
}

type JSONFactory struct{}

func (f *JSONFactory) NewReader() Reader { return &jsonReader{} }
func (f *JSONFactory) NewWriter() Writer { return &jsonWriter{} }
```

And a CSV family:

```go
// csv.go
package pipeline

import "fmt"

type csvReader struct{}

func (r *csvReader) Read() (string, error) { return "status,ok", nil }

type csvWriter struct{}

func (w *csvWriter) Write(record string) error {
    fmt.Println("[csv]", record)
    return nil
}

type CSVFactory struct{}

func (f *CSVFactory) NewReader() Reader { return &csvReader{} }
func (f *CSVFactory) NewWriter() Writer { return &csvWriter{} }
```

Application code works with the factory interface and never touches concrete types:

```go
// main.go
package main

import (
    "fmt"
    "pipeline"
)

func run(factory pipeline.FormatFactory) {
    r := factory.NewReader()
    w := factory.NewWriter()

    record, err := r.Read()
    if err != nil {
        fmt.Println("read error:", err)
        return
    }
    w.Write(record)
}

func main() {
    fmt.Println("--- JSON ---")
    run(&pipeline.JSONFactory{})

    fmt.Println("--- CSV ---")
    run(&pipeline.CSVFactory{})
}
```

Output:

```
--- JSON ---
[json] {"status":"ok"}
--- CSV ---
[csv] status,ok
```

## When to Use

- You need families of related objects that must be used together consistently.
- The system should be configurable to work with one of several product families.
- You want to enforce that products from different families aren't accidentally mixed.

## When Not to Use

- You only have one product type — use [Factory Method](/go/patterns/creational/factory-method) instead.
- The products in each family are trivially different — the abstraction overhead isn't justified.
- You don't actually need family consistency. If mixing is fine, individual factory functions are simpler.

## Tradeoffs

Abstract Factory provides the strongest consistency guarantee in Go's creational toolkit — the compiler makes it impossible to pair a JSON reader with a CSV writer. That guarantee comes at a real cost: adding a new product type (say, a `Compressor`) requires changing the factory interface and every implementation that satisfies it. If you have three families and add one method, you touch four files. In Go, where implicit interfaces already give you most of the decoupling benefit, this can feel like a lot of ceremony for small programs. The pattern pays off when you have two or more product types that genuinely must stay in sync across multiple families — if you only ever need to swap one object type, [Factory Method](/go/patterns/creational/factory-method) is simpler.

## Related Patterns

- **Factory Method** — Use Factory Method when you only need to select one type; reach for Abstract Factory when you need to guarantee that multiple types come from the same family and must be used together correctly.
- **Builder** — Use Builder when constructing one complex object with many optional parts; Abstract Factory is for selecting a consistent set of simpler objects across multiple product types.
