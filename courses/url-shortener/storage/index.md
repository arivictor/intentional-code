---
title: "Storage"
description: "Fill the Store hole three times: an in-memory Repository, a durable SQLite store, and a caching Decorator that wraps either — all behind one interface."
---

## The Hole We've Been Ignoring

Two chapters in, every link still lives in a `Store` interface with no implementation. The toy used a `map`; we kept the boundary but never built behind it. Now we do — three times.

That repetition is the point. We'll write a `MemoryStore` (fast, forgettable), a `SQLiteStore` (durable, survives restarts), and a `CachedStore` (fast *and* durable). Each satisfies the exact same `Store` interface from Chapter 1, which means the `Service` and the handlers we write later accept all three without a single change.

The first two are the [Repository pattern](/go/patterns/architectural/repository): storage hidden behind a domain-shaped interface. The third is the [Decorator pattern](/go/patterns/structural/decorator): a `Store` that wraps another `Store`, adding caching while *being* a `Store` itself. Watching the same interface support both "here's another implementation" and "here's a wrapper around an implementation" is the clearest lesson in why small interfaces are worth the discipline.
