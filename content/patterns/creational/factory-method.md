---
title: "Factory Method"
description: "Define an interface for creating an object, but let the calling code decide which concrete type to instantiate via constructor functions returning an interface."
---

# Factory Method

**Buys open/closed extension — add implementations without touching callers; pays in indirection and runtime-only failure on an unknown name.**

The Factory Method pattern defines an interface for creating an object, but lets the calling code decide which concrete type to instantiate. In Go, this is simply a constructor function that returns an interface. The "factory" is the constructor; the "method" is its return type. The pattern is useful when you have a growing switch statement that selects which type to create based on a runtime value. By moving that selection logic into a constructor function, you can add new implementations without modifying existing code, adhering to the Open/Closed Principle.

This is the [Open/Closed Principle](/go/philosophy/keep-changes-local#solid) in practice.

## Scenario

You're building a logging library. Initially you only write plain text logs, so you hardcode a text formatter. Then you need JSON for structured logging. Then logfmt for log aggregators. Every new format means editing the same function, retesting everything, and risking breakage in formats that were already working.

```go
// log_naive.go
package log

import "fmt"

func Format(format, level, msg string) string {
    switch format {
    case "text":
        return fmt.Sprintf("%s: %s", level, msg)
    case "json":
        return fmt.Sprintf(`{"level":%q,"msg":%q}`, level, msg)
    // Every new format: add a case, redeploy, re-test everything.
    default:
        return msg
    }
}
```

This switch is a magnet for change. Every new format requires modifying this function. You can't add formats from outside the package. Testing one format means loading the code for all of them.

## Solution

Define a `Formatter` interface with a single method. Each format implements it independently. A constructor function selects the right implementation and returns the interface. The caller never sees the concrete types. Run the example to see each registered formatter produce its own output:

```
┌─────────────────────────┐
│     <<interface>>       │
│       Formatter         │
│─────────────────────────│
│ + Format(level, msg)    │
│   string                │
└────────────┬────────────┘
             │ implements
     ┌───────┼────────┐
     │       │        │
┌────▼──┐ ┌──▼───┐ ┌──▼────┐
│ Text  │ │ JSON │ │Logfmt │
│       │ │      │ │       │
└───────┘ └──────┘ └───────┘

NewFormatter(name) ──► Formatter
```

```go:title="main.go":run=true:editable=true
package main

import "fmt"

type Formatter interface {
	Format(level, msg string) string
}

type textFormatter struct{}

func (f *textFormatter) Format(level, msg string) string {
	return fmt.Sprintf("%s: %s", level, msg)
}

type jsonFormatter struct{}

func (f *jsonFormatter) Format(level, msg string) string {
	return fmt.Sprintf(`{"level":%q,"msg":%q}`, level, msg)
}

type logfmtFormatter struct{}

func (f *logfmtFormatter) Format(level, msg string) string {
	return fmt.Sprintf("level=%s msg=%q", level, msg)
}

type constructor func() Formatter

var registry = map[string]constructor{
	"text":   func() Formatter { return &textFormatter{} },
	"json":   func() Formatter { return &jsonFormatter{} },
	"logfmt": func() Formatter { return &logfmtFormatter{} },
}

func Register(name string, c constructor) {
	registry[name] = c
}

func NewFormatter(name string) (Formatter, error) {
	ctor, ok := registry[name]
	if !ok {
		return nil, fmt.Errorf("unknown format: %s", name)
	}
	return ctor(), nil
}

func main() {
	for _, name := range []string{"text", "json", "logfmt"} {
		f, err := NewFormatter(name)
		if err != nil {
			fmt.Println(err)
			continue
		}
		fmt.Println(f.Format("info", "server started"))
	}
}
```

Output:

```
info: server started
{"level":"info","msg":"server started"}
level=info msg="server started"
```

## When to Use

- You see a growing switch or if/else chain selecting which type to create based on a runtime value.
- Different parts of your system need to create objects that share a common interface but differ in implementation.
- You want to let packages or plugins register new implementations without modifying core code.
- You need to decouple object creation from usage: the caller should work with the interface, not know the concrete type.

## When Not to Use

- You have only one or two implementations and no expectation of more. A plain constructor function (`NewJSONFormatter`) is simpler and more direct.
- The concrete type matters to the caller: they need access to type-specific methods beyond the interface. In that case, return the concrete type.
- The factory adds indirection without benefit. Don't add a factory "just in case"; add it when you feel the switch-statement pain.

## The Decision

The map-of-constructors style works well because adding a new format does not require changing existing code. Each formatter is also isolated, so a bug in JSON formatting does not directly break text formatting. The tradeoff is indirection. To understand what concrete type is created, you have to follow a registry lookup, and unknown format names fail at runtime instead of being caught at compile time. The registry is also mutable package-level state, which can make tests flaky when they register custom formats and forget to clean up. For a small and stable set of options, such as two formats that almost never change, a plain switch or direct constructor is easier to read. The factory approach is worth it when implementations are open-ended or must be extended from outside the package.

## Related Patterns

- **Abstract Factory**: Use Abstract Factory when you need to guarantee that multiple created types come from the same family and work together; Factory Method is simpler when you only need to select one type.
- **Builder**: Use Builder when construction requires many optional parameters or a meaningful sequence of steps; Factory Method is for selecting *which* type to create, not for configuring a complex one.
- **Prototype**: Use Prototype when cloning an existing instance is cheaper or more convenient than calling a constructor; Factory Method when you want to encapsulate the constructor selection logic.
