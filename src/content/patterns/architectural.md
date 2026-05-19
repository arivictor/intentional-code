# Architectural Patterns

The question architectural patterns answer: **how should the whole system be organised?**

Architectural patterns operate at a different scale than the creational, structural, and behavioral patterns. They don't describe a single type or a single collaboration — they describe the structure of an entire service or application and the rules that govern where each piece of code lives.

**Start with [Layered Architecture](/go/patterns/architectural/layered)** for any new service. Four tiers — Handler, Service, Repository, Infrastructure — with each depending only on the one below. It's the foundation everything else builds on.

**Add [Repository](/go/patterns/architectural/repository)** immediately. The Repository is the boundary between business logic and the database: define an interface in the domain package, implement it in the infrastructure package, and your service functions become testable without a running database.

**Graduate to [Hexagonal Architecture](/go/patterns/architectural/hexagonal)** when you need multiple delivery mechanisms (HTTP *and* gRPC *and* CLI) against the same business logic, or when you want to test the application core end-to-end with no infrastructure. Hexagonal formalises what Layered implies: ports are the interfaces, adapters are the implementations, and the application imports none of the adapters.

**[Clean Architecture](/go/patterns/architectural/clean-architecture)** covers the same ground as Hexagonal with "concentric rings" terminology. Use whichever model helps your team enforce the inward dependency rule. The practical difference is negligible — many projects use both vocabularies interchangeably.

**Use [Domain-Driven Design](/go/patterns/architectural/domain-driven-design)** when the business rules are genuinely complex: multiple interacting aggregates, invariants that must be enforced everywhere, and domain experts you can collaborate with. DDD's tactical patterns — Entities, Value Objects, Aggregates, Domain Events — sit inside the inner rings of Hexagonal or Clean Architecture.

**Add [CQRS](/go/patterns/architectural/cqrs)** when reads and writes have different shapes: the write side needs a rich domain model with invariants; the read side needs flat, denormalised projections. CQRS separates the command handler from the query handler, letting each evolve independently.

**[Event-Driven Architecture](/go/patterns/architectural/event-driven)** decouples producers from consumers at the event boundary. A failed notification service stops blocking order placement. Start with an in-process event bus; graduate to Kafka or NATS when the workload demands it.

**[Circuit Breaker](/go/patterns/architectural/circuit-breaker)** is the resilience pattern for external dependencies. When a downstream service slows or fails, the breaker opens and fast-fails callers rather than letting goroutines pile up waiting for timeouts that will never resolve.

---

The [SOLID Principles](/go/philosophy/solid), especially the Dependency Inversion Principle, underpin all of these patterns. The Dependency Rule in Clean Architecture *is* DIP applied architecturally.
