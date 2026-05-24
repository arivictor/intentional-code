---
title: "Factory Method"
category: creational
intent: "Define an interface for creating an object, but let the calling code decide which concrete type to instantiate via constructor functions returning an interface."
idiomSummary: "Constructor functions returning an interface; selection via map of constructors, not a class hierarchy."
relatedSlugs: ["abstract-factory", "builder", "prototype"]
tags: [interfaces, dependency-inversion, testability]
isFeatured: true
recognitionHook: "You have a switch statement that creates different concrete types based on a runtime value."
---

# Factory Method

In class-based languages, Factory Method is an abstract class with an overridable creation method. In Go, it's a function that returns an interface. The entire pattern reduces to that. The "factory" is the constructor; the "method" is its return type.

The pattern earns its keep when you find yourself extending a switch statement every time you add a new type. That switch is a signal: move the selection logic into one place, hide it behind a constructor, and let new implementations register without touching existing code. This is the [Open/Closed Principle](/go/philosophy/solid) in practice: open for extension, closed for modification.

## Problem

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

Define a `Formatter` interface with a single method. Each format implements it independently. A constructor function selects the right implementation and returns the interface. The caller never sees the concrete types.

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

```go
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

## Tradeoffs

The map-of-constructors approach pays for itself quickly: new formats require zero changes to existing code, and each formatter is isolated so a bug in JSON can't break text. The cost is indirection. You must look up the registry to find the concrete type, and unknown format names become runtime errors rather than compile-time ones. The registry is also package-level mutable state, which can cause test flakiness if tests register formats and don't clean up. For small, stable sets of types (say, two formats you're never changing), a plain switch or direct construction is clearer. The factory only earns its overhead when the set of implementations is open-ended or needs to be extended from outside the package.

## Related Patterns

- **Abstract Factory**: Use Abstract Factory when you need to guarantee that multiple created types come from the same family and work together; Factory Method is simpler when you only need to select one type.
- **Builder**: Use Builder when construction requires many optional parameters or a meaningful sequence of steps; Factory Method is for selecting *which* type to create, not for configuring a complex one.
- **Prototype**: Use Prototype when cloning an existing instance is cheaper or more convenient than calling a constructor; Factory Method when you want to encapsulate the constructor selection logic.
