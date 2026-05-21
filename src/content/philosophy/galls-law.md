---
title: Gall's Law
description: Complex systems that work evolved from simple systems that worked. Design for simplicity first — complexity that emerges is manageable; complexity that is designed in is not.
---

# Gall's Law

*"A complex system that works is invariably found to have evolved from a simple system that worked. A complex system designed from scratch never works and cannot be made to work. You have to start over with a working simple system."* — John Gall, *Systemantics*, 1975

Gall's Law is an observation, not a prescription: complex systems that actually work didn't start complex. They started simple, proved themselves, and accumulated complexity only where the real world demanded it. Attempts to design a complex system from scratch — to anticipate every requirement, every failure mode, every integration — consistently fail.

The reason is fundamental: a complex system has so many interacting parts that you cannot predict the emergent behaviour without actually running it. Assumptions that seemed reasonable during design turn out to be wrong. Interactions that looked orthogonal turn out to be coupled. The only way to discover these problems is through operation, and the only way to survive them is to have a simple, working foundation to reason from.

---

## The failure mode: designing complexity upfront

```go
// A system designed to handle every future requirement on day one.
// This is never finished, never tested end-to-end, and never shipped.

type EventBus struct {
    handlers    map[string][]HandlerFunc
    middleware  []MiddlewareFunc
    deadLetter  Queue
    retryPolicy RetryPolicy
    tracing     TracingProvider
    metrics     MetricsCollector
    serializer  Serializer
    transport   Transport
    router      Router
    schema      SchemaRegistry
    auth        AuthProvider
}
```

This system is difficult to build, difficult to test, and impossible to debug when something goes wrong. The designer has made dozens of architectural decisions — retry policies, transport layers, schema registries — before a single message has been sent in production. Most of those decisions are wrong, or at least suboptimal for the real workload that emerges.

---

## The working alternative: evolve from something simple

```go
// Day one: a simple in-process event dispatcher.
// It works. It's in production. It handles real load.

type EventBus struct {
    mu       sync.RWMutex
    handlers map[string][]func(Event)
}

func (b *EventBus) Subscribe(topic string, fn func(Event)) {
    b.mu.Lock()
    defer b.mu.Unlock()
    b.handlers[topic] = append(b.handlers[topic], fn)
}

func (b *EventBus) Publish(e Event) {
    b.mu.RLock()
    defer b.mu.RUnlock()
    for _, fn := range b.handlers[e.Topic] {
        fn(e)
    }
}
```

This ships in a day, works reliably, and gives you real data. You learn:

- Which topics are high-volume (now you know where to optimise)
- Which handlers fail and how often (now you know whether you need retries)
- Whether you actually need cross-process messaging (now you know whether to add a transport layer)

```go
// Six months later: production data reveals that one handler
// is failing intermittently. Add retries — but only for that case.

func (b *EventBus) PublishWithRetry(e Event, maxAttempts int) {
    fns := b.handlersFor(e.Topic)
    for _, fn := range fns {
        for attempt := range maxAttempts {
            if err := callHandler(fn, e); err == nil {
                break
            }
            if attempt < maxAttempts-1 {
                time.Sleep(time.Duration(attempt+1) * 100 * time.Millisecond)
            }
        }
    }
}
```

The complexity that was added is motivated by real operational evidence. It solves a problem you actually observed.

---

## Gall's Law in architecture decisions

The principle applies at every scale:

**Microservices:** Don't start with a microservices architecture. Start with a monolith. When specific services have scaling requirements that the monolith can't meet, extract them. The [Strangler Fig pattern](https://martinfowler.com/bliki/StranglerFigApplication.html) applies Gall's Law to migration — keep the working system running while incrementally replacing parts.

**Databases:** Don't shard on day one. A single Postgres instance handles enormous load. Add read replicas when you have measured read latency. Shard when you have a partition key that matches real access patterns — which you can only identify through operation.

**Abstractions:** Don't design the plugin system before you have three plugins. The right abstraction emerges from real usage. The Rule of Three (see [DRY](/go/philosophy/dry)) is Gall's Law applied to code.

---

## What this is not

Gall's Law is not an argument against thinking ahead. It's an argument against *designing* ahead:

- Think about how the system will need to scale: yes
- Choose a data model that supports future access patterns: yes
- Design a distributed event bus before you have two services: no
- Build a plugin architecture for extensions that don't exist: no

The distinction is: structural decisions that are genuinely hard to reverse (data models, wire formats, public APIs) deserve upfront thought. Operational concerns (scaling, distribution, redundancy) should be added in response to real evidence.

---

## The working simple system as foundation

Gall's Law explains why rewrites fail. A rewrite discards the working simple system — all the edge cases it handles, all the implicit knowledge baked into its behaviour, all the operational experience that shaped it. The rewrite starts from scratch with a complex design and no operational baseline.

The alternative is iterative evolution: keep the system running, add complexity in the places where evidence demands it, and retire old approaches incrementally. The system remains understandable because each addition was motivated by a real problem.

> **Smell:** A system that was never fully deployed. A design document that is more detailed than the code. An architecture that handles ten hypothetical failure modes but hasn't shipped to handle the most basic real one. A migration plan that requires moving everything at once.

See also: [YAGNI](/go/philosophy/yagni), [KISS](/go/philosophy/kiss), [Event-Driven Architecture](/go/patterns/architectural/event-driven).
