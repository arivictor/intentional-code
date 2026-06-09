---
title: Structural Patterns
description: Composing types by wrapping, extending, and combining them without modifying the originals.
---

## What Are Structural Patterns?

Structural patterns are about composition. You wrap, extend, or combine existing types and leave the originals alone. In Go, embedding and implicit interfaces make this feel ordinary, so you see these shapes in code long before you hear their names.

Most structural patterns line up with [SOLID Principles](/go/philosophy/solid), especially Open/Closed and Dependency Inversion. You add behaviour without rewriting existing types, and you lean on interfaces instead of concrete implementations.

## The Building Blocks

**Start with [Adapter](/go/patterns/structural/adapter)** when a type almost fits the interface you need. A small wrapper can make one package speak another package's contract. You will see this often.

**[Decorator](/go/patterns/structural/decorator)** adds behaviour around a type without changing it. Go middleware does this every day, in HTTP, gRPC, and database layers. A function that accepts an interface and returns the same interface with logging, metrics, or retries attached is Decorator in plain clothes.

**[Proxy](/go/patterns/structural/proxy)** can look the same on the surface, a wrapper around an interface, but the job is different. A Proxy controls access. Lazy startup, permission checks, and connection pooling usually land here.

**[Facade](/go/patterns/structural/facade)** gives you one clean entry point to a subsystem with too many moving parts. When orchestration logic starts repeating across callers, pull it into a Facade. The `http.ListenAndServe` call is a familiar example, sitting over `net.Listener`, `http.Server`, and TLS setup.

**[Composite](/go/patterns/structural/composite)** fits tree structures where leaves and branches need the same interface. Filesystem paths, UI trees, and expression trees all lean this way.

**[Bridge](/go/patterns/structural/bridge)** keeps an abstraction and its implementation separate, so each can change without dragging the other. Use it when variation is happening in two directions at once.

**[Flyweight](/go/patterns/structural/flyweight)** is a memory move. When you hold large numbers of similar objects, share the immutable parts and keep only unique state per instance. It is a tool you reach for after profiling tells you memory is the pressure point.
