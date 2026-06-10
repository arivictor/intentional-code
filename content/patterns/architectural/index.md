---
title: Architectural Patterns
description: How to organise a whole system — the boundaries and dependency rules that keep it easy to change as it grows.
---

## What Are Architectural Patterns?

Architectural patterns are about system shape. They answer the question: **how should the whole system be organised?** Software architecture is about decisions you keep living with. You decide what must stay easy to change, then protect that code from fast-changing details around it. For example, if you keep business rules separate from database code, future changes are usually safer and cheaper.

Architecture must be intentional. It must not be based on preferences, cargo culting, or "best practices" without context. The right architecture depends on your domain, your team, and your future plans.

## The Building Blocks

Architecture becomes important when software stops being a personal sketch and starts carrying real load.

You will not need every pattern in this section. Some are too heavy for simple CRUD. Some only pay off when domain complexity or operational scale grows. That is normal. Pick what matches your pressure points.

From here, the catalogue gets concrete: layering, persistence boundaries, event flow, and failure handling.

Architectural patterns work at service/application scale. They describe system shape and dependency rules, not just one class or one small collaboration.

**Start with [Layered Architecture](/patterns/architectural/layered)** when you need order in a new service. A common default is four tiers (Handler, Service, Repository, Infrastructure) with downward dependency flow.

**Add [Repository](/patterns/architectural/repository)** when SQL starts leaking into business logic. Put the interface near domain/application logic, and keep implementations in infrastructure.

**Move to [Hexagonal Architecture](/patterns/architectural/hexagonal)** when you need multiple delivery mechanisms (HTTP, gRPC, CLI) on the same use cases, or when you want fast core tests with no infrastructure.

**[Clean Architecture](/patterns/architectural/clean-architecture)** overlaps heavily with Hexagonal. The main difference is mental model (rings vs ports/adapters). Use the one your team can enforce clearly.

**Use [Domain-Driven Design](/patterns/architectural/domain-driven-design)** when business rules are truly complex and domain language matters. Tactical DDD patterns usually live in the inner application/core layers.

**Add [CQRS](/patterns/architectural/cqrs)** when read and write paths need different models. This avoids forcing one model to do both jobs poorly.

**[Event-Driven Architecture](/patterns/architectural/event-driven)** decouples producers from consumers using events. Start in-process when small; move to Kafka/NATS when needed.

**[Publish/Subscribe](/patterns/architectural/pub-sub)** is the topic-based messaging mechanism event-driven systems run on: publishers send to a named topic, and every subscriber gets its own copy.

**[Transactional Outbox](/patterns/architectural/outbox)** publishes events reliably by writing them to an outbox table in the same transaction as your state change, closing the dual-write gap between database and broker.

**[Circuit Breaker](/patterns/architectural/circuit-breaker)** protects you from slow or failing dependencies by failing fast instead of letting requests pile up.

**[Rate Limiting](/patterns/architectural/rate-limiting)** caps how often operations run using a token bucket, protecting you and your dependencies from overload before anything breaks.

**[Retry](/patterns/architectural/retry)** recovers from transient failures with bounded, backed-off, context-aware re-attempts, while leaving permanent errors alone.

**[MVC / MVP / MVVM](/patterns/architectural/mvc)** keep business decisions out of rendering code. They differ in how the UI and mediator/presenter/view-model interact.

**[Event Sourcing](/patterns/architectural/event-sourcing)** stores events as the source of truth and derives current state by replaying. Auditability becomes structural, not optional.

**[Saga](/patterns/architectural/saga)** coordinates multi-step workflows across services without distributed transactions, using local commits plus compensating actions.

**[Strangler Fig](/patterns/architectural/strangler-fig)** replaces legacy systems incrementally by routing some traffic to new code and expanding coverage over time.

**[Microservices](/patterns/architectural/microservices)** split a system into independently deployable services with clear ownership boundaries. Start from a good monolith first, then extract when justified.

**[Modular Monolith](/patterns/architectural/modular-monolith)** is that good monolith: one deployable, but internally split into modules with compiler-enforced boundaries (`internal/`, interfaces). The best starting point before any extraction.

**[Microkernel / Plugin](/patterns/architectural/microkernel)** keeps a minimal core and pushes every feature into plugins that register against a stable contract, so the system grows by adding plugins, not editing the core.

**[Backends for Frontends](/patterns/architectural/bff)** give each frontend its own backend that aggregates and shapes downstream data to that client's exact needs, instead of one general-purpose API serving everyone badly.

**[Pipe and Filter](/patterns/architectural/pipe-and-filter)** processes data as ordered transformation steps. In Go this can be function chains, channel pipelines, or layered `io.Reader` wrappers.
