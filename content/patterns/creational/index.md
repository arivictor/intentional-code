---
title: Creational Patterns
description: Object-creation mechanisms that increase flexibility and reuse of existing code.
---

## What Are Creational Patterns?

Creational patterns are about construction. They answer the question: **how should these objects be created?** Go has no `new` keyword with arguments, no constructor overloading, and no default parameter values. Every constructor is a function, which is both a constraint and a freedom. The patterns in this category fill in the gaps that this simplicity creates.

The [SOLID Principles](/philosophy/keep-changes-local#solid), especially Dependency Inversion, explain why creational patterns matter: the goal is always to decouple the *construction* of an object from its *use*, so the business logic never imports the concrete type directly.

## The Building Blocks

**Start with [Factory Method](/patterns/creational/factory-method)** if you find yourself extending a switch statement every time you add a new type. It's the simplest creational pattern, often just a function returning an interface, and it solves the most common construction problem in Go.

**Reach for [Builder](/patterns/creational/builder)** when your constructor has more than four or five parameters, especially optional ones. Go's zero values make unset fields ambiguous; Builder and the functional options idiom make intent explicit.

**Use [Abstract Factory](/patterns/creational/abstract-factory)** when you have a *family* of related objects that must be created together (UI components that share a theme, infrastructure adapters that share a backend). If you're only creating one kind of thing, Factory Method is enough.

**[Prototype](/patterns/creational/prototype)** is for copying existing objects when construction from scratch is expensive or complex. Go's struct assignment does a shallow copy automatically; Prototype makes the deep-copy contract explicit and safe.

**[Singleton](/patterns/creational/singleton)** is the one I'd argue with most in this category. In most Go code it's an anti-pattern that hides dependencies. The exception: `sync.Once` gives you a thread-safe lazy initialiser that's useful for things that genuinely must be shared and initialised exactly once, like a parsed config or a connection pool.

