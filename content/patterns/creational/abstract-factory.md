---
title: "Abstract Factory"
description: "Provide an interface whose methods each return related product interfaces, so families of related objects can be created without specifying their concrete types."
---

# Abstract Factory

**Buys a compiler-enforced guarantee that product families never mix; pays heavy ceremony — a new product type touches the interface and every family.**

Abstract Factory solves a specific problem: your system needs families of related objects that must be used together. A JSON encoder paired with a JSON decoder, not a JSON encoder with a CSV decoder. The entire family should be swappable as a unit.

In Go, first-class functions mean you often don't need the full pattern. When you have one family and no plans to add more, a plain constructor function achieves the same guarantee with far less ceremony:

```go
// This is already "Abstract Factory" in spirit — one function, one matched pair.
func newJSONPipeline() (Reader, Writer) {
    return &jsonReader{}, &jsonWriter{}
}
```

Reach for the full factory interface only when you have **two or more families** that must be swappable as units. That's when the interface pays off: the compiler enforces that `run(f FormatFactory)` can never accidentally receive a JSON reader with a CSV writer, regardless of which family `f` belongs to. With just one family, a function is simpler and equally correct.

In Go, the pattern is an interface whose methods each return a product interface. One struct per family satisfies the factory interface, and the compiler enforces that code written against that interface can never accidentally mix families. This is the critical advantage over individual [Factory Methods](/go/patterns/creational/factory-method): a factory method prevents you from picking the wrong *type*, but it can't prevent you from picking types from different families.

## Scenario

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

Define product interfaces (`Reader`, `Writer`) and a factory interface whose methods return them. Each format gets one factory struct that produces a consistent, matched pair. Run the example to see each family produce its own matched reader and writer:

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

```go:title="main.go":run=true:editable=true
package main

import "fmt"

type Reader interface {
	Read() (string, error)
}

type Writer interface {
	Write(record string) error
}

type FormatFactory interface {
	NewReader() Reader
	NewWriter() Writer
}

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

func run(factory FormatFactory) {
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
	run(&JSONFactory{})

	fmt.Println("--- CSV ---")
	run(&CSVFactory{})
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

- You only have one product type. Use [Factory Method](/go/patterns/creational/factory-method) instead.
- The products in each family are trivially different. The abstraction overhead isn't justified.
- You don't actually need family consistency. If mixing is fine, individual factory functions are simpler.

## The Decision

Abstract Factory provides the strongest consistency guarantee in Go's creational toolkit: the compiler makes it impossible to pair a JSON reader with a CSV writer. That guarantee comes at a real cost. Adding a new product type (say, a `Compressor`) requires changing the factory interface and every implementation that satisfies it. Three families plus one new method means touching four files. In Go, where implicit interfaces already give you most of the decoupling benefit, this can feel like a lot of ceremony for small programs. The pattern pays off when you have two or more product types that genuinely must stay in sync across multiple families. If you only ever need to swap one object type, [Factory Method](/go/patterns/creational/factory-method) is simpler.

You've already used one in the standard library: `database/sql/driver` is an Abstract Factory — a `Driver` produces a matched family of `Conn`, `Stmt`, and `Rows` implementations that are always used together and never mixed across drivers.

## Related Patterns

- **Factory Method**: Use Factory Method when you only need to select one type; reach for Abstract Factory when you need to guarantee that multiple types come from the same family and must be used together correctly.
- **Builder**: Use Builder when constructing one complex object with many optional parts; Abstract Factory is for selecting a consistent set of simpler objects across multiple product types.
