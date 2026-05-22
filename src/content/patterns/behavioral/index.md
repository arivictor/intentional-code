---
title: Behavioral Patterns
lede: Algorithms and the assignment of responsibilities between objects.
---

The question behavioral patterns answer: **how should these objects communicate and distribute responsibility?**

Where structural patterns are about composition (fitting types together), behavioral patterns are about runtime flow: who calls whom, how algorithms are selected, how state changes are tracked.

**Start with [Strategy](/go/patterns/behavioral/strategy)** if you have a switch statement that selects an algorithm. Strategy is the simplest behavioral pattern in Go, often just a function type or a single-method interface, and it's the pattern [TDD](/go/philosophy/tdd) most reliably drives you toward.

**[Observer](/go/patterns/behavioral/observer)** is for one-to-many notification: one thing changes, many things need to know. Go gives you three subscriber mechanisms (interface values, function values, and channels), each with different lifecycle and concurrency tradeoffs. Pick wrong and you get goroutine leaks.

**[Command](/go/patterns/behavioral/command)** wraps an operation as a value: a function in a queue, a struct with an `Execute()` method, a task with undo support. If you need to queue, log, or reverse operations, Command is the right frame.

**[State](/go/patterns/behavioral/state)** replaces a type with switch statements in every method with a set of state objects, each implementing the shared interface. Use it when the number of states is stable but the behaviour per state is complex and growing.

**[Chain of Responsibility](/go/patterns/behavioral/chain-of-responsibility)** passes a request along a chain of handlers until one handles it. Go HTTP middleware is the canonical example. Use it when multiple objects might handle a request and the sender shouldn't care which one does.

**[Iterator](/go/patterns/behavioral/iterator)** provides a standard way to traverse a collection. Since Go 1.23, `iter.Seq[T]` is the first-class form: a function that takes a `yield` callback and is consumed with `range`. Prefer the standard form over custom `Next()`/`Value()` pairs.

**[Mediator](/go/patterns/behavioral/mediator)** routes messages between objects that shouldn't know about each other directly. Use it when direct peer-to-peer connections would create O(n²) coupling. If only one thing reacts to each event, [Observer](/go/patterns/behavioral/observer) is simpler.

**[Template Method](/go/patterns/behavioral/template-method)** defines a skeleton algorithm with steps that subclasses override. In Go, this is done with function values or interfaces, not inheritance; the "template" is a function that accepts the variable steps as parameters.

**[Memento](/go/patterns/behavioral/memento)** saves and restores an object's state. Go's package visibility rules give Memento a clean implementation: the unexported fields are captured as a snapshot type defined in the same package, inaccessible from outside.

**[Visitor](/go/patterns/behavioral/visitor)** separates operations from the types they operate on, letting you add new operations without modifying the type hierarchy. Go's lack of method overloading means Visitor uses explicit type switches or double-dispatch, which is more verbose than in languages with overloading, but still useful for stable type hierarchies with evolving operations.

**[Interpreter](/go/patterns/behavioral/interpreter)** defines a grammar as a set of types (one per grammar rule) and evaluates a sentence by walking the resulting tree. Each node implements a shared `Interpret` interface. Use it for small DSLs and rule engines; for large or performance-critical grammars, reach for a parser generator or bytecode VM instead.

---

Behavioral patterns are closely related to the [SOLID Principles](/go/philosophy/solid): Open/Closed drives Strategy and Observer; Single Responsibility drives Command and Mediator.
