---
title: Design for the change you can see, not the change you imagine
nav_title: Change you can see
description: There are two futures — the one in your backlog and the one in your head. Build for the first; the second is speculation you pay for now.
order: 6
---

# Design for the change you can see, not the change you imagine

There are two kinds of future. There's the change you can *see*, the requirement that's already been asked for, the load you've actually measured, the second use case sitting in the backlog. And there's the change you *imagine*, which is  the "what if we someday," the "this might need to," the extensibility that exists only in your head. Both feel like the same prudent instinct. They are not. The first is information; the second is a guess you start paying for the moment you build to it.

Design for the change you can see. When the change you imagined finally shows up wearing real requirements, it almost never looks like what you guessed, and the scaffolding you built for the guess is now in the way.

This is  an argument against *designing* ahead. Decisions that are genuinely hard to reverse, data formats, wire protocols, public APIs, all deserve real upfront thought, because changing them later is disproportionately expensive. Operational concerns such as scaling, sharding, distribution, and retries should be added in response to evidence, because you can only learn their real shape by running the system.

## Good enough first, better over time

Perfect architecture stays out of reach, and that's fine. Ship something stable enough to be real, then listen for evidence that the shape is wrong:

- changes take longer than they should
- regressions keep appearing in the same place
- a feature ripples through modules that shouldn't care
- people can't confidently decide where new code goes

When those signals keep showing up, adjust the boundaries, one seam at a time, kept close to the pain. That's letting the system tell you what it needs instead of guessing in advance.

## Gall's Law

This tenet has an older, sharper statement, and it's an observation rather than a slogan:

*"A complex system that works is invariably found to have evolved from a simple system that worked. A complex system designed from scratch never works and cannot be made to work. You have to start over with a working simple system."* (John Gall, *Systemantics*, 1975)

A complex system has too many interacting parts to predict before you run it: assumptions made while designing turn out wrong, and interactions that looked independent turn out coupled. Compare a system designed for every future requirement on day one with the simple one that actually ships:

```go
// BAD — designed to handle every future requirement on day one.
// Never finished, never tested end-to-end, never shipped.

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

```go
// GOOD — day one: a simple in-process dispatcher.
// It works, it's in production, it handles real load.

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

The first made a dozen architectural bets — retry policy, transport, schema registry — before a single message was sent, and most are wrong for the workload that actually emerges. The second ships, and then *tells* you what to add: which topics are hot, which handlers fail, whether you ever truly need cross-process transport. Complexity added on that evidence is earned. This is the Rule of Three from [DRY](/philosophy/wrong-abstraction#dry) at system scale, and it's why rewrites that throw away the working simple system tend to fail.

> **Smell:** A system that was never fully deployed. A design document more detailed than the code. An architecture that handles ten hypothetical failure modes but hasn't shipped to handle the first real one. A migration that requires moving everything at once.

See also: [YAGNI](/philosophy/no-pattern#yagni), [KISS](/philosophy/no-pattern#kiss), [Event-Driven Architecture](/patterns/architectural/event-driven).
