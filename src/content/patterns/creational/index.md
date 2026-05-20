---
title: Creational Patterns
lede: Object-creation mechanisms that increase flexibility and reuse of existing code.
---

The question creational patterns answer: **how should this object come into existence?**

In Go, that question has a surprising amount of depth. The language has no `new` keyword with arguments, no constructor overloading, and no default parameter values. Every constructor is a function — which is both a constraint and a freedom. The patterns in this category fill in the gaps that this simplicity creates.

**Start with [Factory Method](/go/patterns/creational/factory-method)** if you find yourself extending a switch statement every time you add a new type. It's the simplest creational pattern — often just a function returning an interface — and it solves the most common construction problem in Go.

**Reach for [Builder](/go/patterns/creational/builder)** when your constructor has more than four or five parameters, especially optional ones. Go's zero values make unset fields ambiguous; Builder and the functional options idiom make intent explicit.

**Use [Abstract Factory](/go/patterns/creational/abstract-factory)** when you have a *family* of related objects that must be created together — UI components that share a theme, infrastructure adapters that share a backend. If you're only creating one kind of thing, Factory Method is enough.

**[Prototype](/go/patterns/creational/prototype)** is for copying existing objects when construction from scratch is expensive or complex. Go's struct assignment does a shallow copy automatically; Prototype makes the deep-copy contract explicit and safe.

**[Singleton](/go/patterns/creational/singleton)** is the most controversial pattern in this category — in most Go codebases it's an anti-pattern that hides dependencies. The exception: `sync.Once` gives you a thread-safe lazy initializer that's useful for things that genuinely must be shared and initialised exactly once, like a parsed config or a connection pool.

---

The [SOLID Principles](/go/philosophy/solid), especially Dependency Inversion, explain why creational patterns matter: the goal is always to decouple the *construction* of an object from its *use*, so the business logic never imports the concrete type directly.
