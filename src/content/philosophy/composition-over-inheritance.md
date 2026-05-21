---
title: Composition over Inheritance
description: Build behaviour by combining small, focused pieces — not by building tall hierarchies of shared ancestry.
---

# Composition over Inheritance

*"Favour object composition over class inheritance."* — Gang of Four, 1994

Go made this decision for you: the language has no inheritance. There are no subclasses, no `extends`, no override. What Go has instead is embedding and interfaces — two mechanisms that let you compose behaviour from small, focused pieces without coupling types together through ancestry.

This isn't a limitation. It's the right call. Inheritance hierarchies couple types through shared state and implementation in ways that are hard to reason about and harder to change. Composition keeps types independent: each piece does one thing, and you assemble them at the point of use.

---

## Embedding: selective reuse without coupling

Go's struct embedding lets one type reuse another's methods without claiming to *be* that type. The embedded type's methods appear on the outer type, but the relationship is has-a, not is-a.

```go
// A reusable logging capability.
type Logger struct {
    prefix string
}

func (l *Logger) Log(msg string) {
    fmt.Printf("[%s] %s\n", l.prefix, msg)
}

// A reusable metrics capability.
type Metrics struct {
    requests int64
}

func (m *Metrics) RecordRequest() {
    atomic.AddInt64(&m.requests, 1)
}

func (m *Metrics) RequestCount() int64 {
    return atomic.LoadInt64(&m.requests)
}

// Composed from two independent pieces.
type APIServer struct {
    *Logger
    *Metrics
    mux *http.ServeMux
}

func NewAPIServer() *APIServer {
    return &APIServer{
        Logger:  &Logger{prefix: "api"},
        Metrics: &Metrics{},
        mux:     http.NewServeMux(),
    }
}

// APIServer.Log and APIServer.RecordRequest are available directly.
// Neither Logger nor Metrics know anything about APIServer.
```

If this were inheritance-based, `APIServer` would subclass some `LoggingServer`, which might subclass some `MetricServer`. Changing the logging implementation would risk breaking every subclass. With composition, `Logger` is independent — swap it without touching `APIServer`.

---

## Interfaces: compose behaviour at the call site

In inheritance hierarchies, types are grouped by what they *are*. In Go, types are grouped by what they *do* — and you define the grouping at the call site with an interface.

```go
// BAD (hypothetical inheritance) — types are coupled through ancestry.
// Animal → Swimmer → Duck
// Animal → Runner → Duck  (impossible — can't inherit from two things)

// GOOD — compose behaviour through interfaces.

type Swimmer interface {
    Swim() string
}

type Runner interface {
    Run() string
}

// Duck composes both.
type Duck struct{}

func (d Duck) Swim() string { return "swimming" }
func (d Duck) Run() string  { return "waddling" }

// Functions declare exactly the behaviour they need.
func Race(r Runner) {
    fmt.Println(r.Run())
}

func WaterTest(s Swimmer) {
    fmt.Println(s.Swim())
}
```

A `Duck` works in both contexts without any shared base class. New types that implement either interface require no changes to `Race` or `WaterTest`.

---

## The diamond problem: why Go skipped inheritance

Classical inheritance has a fundamental problem: when a type inherits from two types that share a common ancestor, method resolution is ambiguous. Languages deal with this through complex rules (C++ virtual inheritance) or by prohibiting it (Java single inheritance). Go sidesteps it entirely.

```go
// In a language with multiple inheritance (not Go):
// Base defines a method. Left inherits Base. Right inherits Base.
// Both override the method. Child inherits Left and Right.
// Which method does Child use? This is undefined or language-specific.

// In Go — no problem. Each embedded type is a distinct field.
type Left struct{}
func (Left) Act() { fmt.Println("left") }

type Right struct{}
func (Right) Act() { fmt.Println("right") }

type Child struct {
    Left
    Right
}

// Ambiguous — Go will not compile a direct call to child.Act().
// You must be explicit:
c := Child{}
c.Left.Act()  // "left"
c.Right.Act() // "right"
```

The compiler forces you to resolve the ambiguity explicitly. There's no hidden dispatch.

---

## Functional composition: building pipelines

Composition applies to functions too. Go's first-class functions let you compose small operations into larger ones without inheritance or subclassing.

```go
type Transform func(string) string

func Chain(transforms ...Transform) Transform {
    return func(s string) string {
        for _, t := range transforms {
            s = t(s)
        }
        return s
    }
}

var normalize = Chain(
    strings.TrimSpace,
    strings.ToLower,
    func(s string) string { return strings.ReplaceAll(s, " ", "-") },
)

fmt.Println(normalize("  Hello World  ")) // "hello-world"
```

Each `Transform` is independent and testable. The pipeline is assembled at the call site. No base class needed.

> **Smell:** A type embeds another type but overrides most of its methods, effectively replacing rather than extending it. A hierarchy is more than two levels deep. You're embedding a large type to get access to one method.

See also: [Strategy](/go/patterns/behavioral/strategy), [Decorator](/go/patterns/structural/decorator), [SOLID](/go/philosophy/solid).
