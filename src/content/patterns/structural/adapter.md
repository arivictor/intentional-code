---
title: "Adapter"
category: structural
intent: "Convert the interface of an existing type into another interface clients expect, letting incompatible types work together."
idiomSummary: "A wrapper struct that satisfies the target interface by delegating to the adaptee."
relatedSlugs: ["bridge", "decorator", "facade", "proxy"]
tags: [interfaces, composition, dependency-inversion]
---

# Adapter

Any wrapper struct in Go that makes one package's type compatible with another's interface is an Adapter: one of the most common patterns in the language, frequently written without being recognized as one. The formal structure is a struct that holds a reference to the incompatible type (the "adaptee") and implements the target interface by delegating calls with whatever translation is needed.

The pattern is especially common when integrating third-party packages. You can't modify the package, and you don't want to modify your domain interface everywhere it's used, so you build a thin wrapper that translates between them once, in one place.

## Problem

Your application writes log lines through a `Logger` interface. A third-party structured logging library is available, but it has a completely different method signature: it takes key-value pairs rather than a formatted string. You can't modify the library, and you don't want to change your `Logger` interface everywhere it's used.

```go
// mismatch.go
package log

// Your application's interface.
type Logger interface {
    Log(msg string)
}

// Third-party library — you can't change this.
type StructuredLogger struct{}

func (l *StructuredLogger) LogFields(fields map[string]string) {
    // Accepts a map, not a string.
    // These two signatures are incompatible.
}
```

The library's method takes a map. Your interface takes a string. Without an adapter, you'd scatter conversion code throughout the codebase: every call site would need to build the map before calling the library.

## Solution

Create a wrapper struct that holds the library client and implements your interface, translating between the two APIs in one place.

```
┌──────────────────────────┐
│    Logger                │
│    <<interface>>         │
│──────────────────────────│
│ Log(msg string)          │
└────────────┬─────────────┘
             │ implements
     ┌───────▼───────┐         ┌──────────────────────┐
     │StructuredAdap.│────────►│  StructuredLogger    │
     │               │ has-a   │  (third-party)       │
     │ Log(msg)      │         │  LogFields(map)      │
     └───────────────┘         └──────────────────────┘
```

```go
package main

import "fmt"

type Logger interface {
	Log(msg string)
}

// Third-party library — you can't change this.
type StructuredLogger struct{}

func (l *StructuredLogger) LogFields(fields map[string]string) {
	fmt.Println("[structured]", fields)
}

// Adapter makes StructuredLogger satisfy Logger.
type StructuredAdapter struct {
	logger *StructuredLogger
}

func NewStructuredAdapter() *StructuredAdapter {
	return &StructuredAdapter{logger: &StructuredLogger{}}
}

func (a *StructuredAdapter) Log(msg string) {
	a.logger.LogFields(map[string]string{"msg": msg})
}

// ConsoleLogger is a simple Logger for tests or development.
type ConsoleLogger struct{}

func (c *ConsoleLogger) Log(msg string) { fmt.Println(msg) }

func run(logger Logger) {
	logger.Log("server started")
	logger.Log("request received")
}

func main() {
	run(NewStructuredAdapter())
	run(&ConsoleLogger{})
}
```

## When to Use

- You need to use a type whose interface doesn't match what your code expects.
- You're integrating a third-party library and want to isolate its API from your domain.
- You're writing a compatibility layer between two subsystems with different conventions.

## When Not to Use

- You can change the target interface to match. Modifying the interface is simpler than wrapping.
- The adaptation is trivial (just renaming a method). Go's implicit interface satisfaction might mean you don't need a wrapper at all.
- You're adapting for hypothetical future flexibility. Only adapt when the mismatch is real.

## Tradeoffs

The benefit is concentrated: translation logic lives in one place, not scattered across every call site. Swapping the adapted library requires updating one struct rather than dozens of callers. The cost is a layer of indirection: one more file to open when tracing a call.

If the adapted API changes (new parameters, changed return types), the adapter must be updated. The compiler will catch this immediately, which is actually a feature. Adapters can also silently lose information: translating a rich structured log entry down to a plain string means callers can never get that structure back. Be deliberate about what the adapter discards.

## Related Patterns

- **Bridge**: Bridge designs two interfaces to vary independently from the start; Adapter is a retrofit that reconciles two existing interfaces that were never designed to work together.
- **Decorator**: Decorator preserves the same interface and adds behavior; Adapter changes the interface to resolve a mismatch. If your wrapper changes the API, it's an Adapter; if it adds to the same API, it's a Decorator.
- **Facade**: Facade simplifies a whole subsystem's API into fewer entry points; Adapter makes one specific type compatible with one specific interface.
- **Proxy**: Proxy preserves the same interface to control access to the real object; Adapter provides a different interface to bridge an incompatibility.
