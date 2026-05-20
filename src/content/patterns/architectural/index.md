---
title: Architectural Patterns
lede: Patterns for structuring entire applications and services — layering, boundaries, and cross-cutting concerns.
---

The question architectural patterns answer: **how should the whole system be organised?**

Software architecture is a discipline of intentional decisions. It's not about preferences of patterns, frameworks, or methodologies. It's about understanding which parts of your system need to change easily and protecting them from the parts that don't. When you separate business logic from database details  you're making a deliberate choice about what matters most to your system's longevity.

## What Is Software Architecture?

Software architecture is the set of structures needed to reason about a software system. It's the components, their relationships, and the principles governing their design and evolution.

**Architecture is the shape of decisions.**

Every codebase has an architecture, whether intentional or accidental. The question isn't "should we have architecture?" The question is "should our architecture serve us or trap us?"

Architecture manifests as:
- **File and folder structure:** Where code lives
- **Dependencies:** What depends on what
- **Boundaries:** What can and cannot interact
- **Abstractions:** What's hidden and what's exposed
- **Contracts:** What's promised between components

These decisions accumulate. They compound. A small choice made in week one becomes the foundation for month six. That foundation becomes the constraint for year two.

Good architecture makes change easy. Bad architecture makes change expensive.

## When to Apply Architecture (And When Not To)

Architecture has a cost. It adds layers, indirection, and cognitive overhead. Not every project needs it.

You need architecture when:

- **The system will live longer than you thought:** What started as a prototype is now in production
- **Multiple people maintain it:** Communication overhead demands clear boundaries
- **Requirements change frequently:** Today's feature becomes tomorrow's legacy
- **Technical details are volatile:** Databases get migrated, APIs get deprecated, frameworks evolve
- **Correctness matters:** Financial systems, healthcare, critical infrastructure
- **The domain is complex:** Business rules are intricate and interrelated


Skip architecture when:

- **It's a prototype or experiment:** Ship fast, learn, throw away
- **You're the only developer forever:** Cognitive overhead helps nobody
- **Requirements are stable and simple:** Some problems stay solved
- **The project has a clear expiration date:** Scripts, one-time migrations, throwaway tools
- **You don't understand the problem yet:** Premature architecture is waste

The skill isn't knowing patterns. It's knowing when to apply them.

## Essential Complexity vs Accidental Complexity

Not all complexity is equal. Some is inherent to the problem. Some you inflict on yourself.

### Essential Complexity

This is the difficulty built into the problem you're solving. Tax law is complex because taxes are complex. Flight scheduling across time zones with crew availability constraints is genuinely hard. Multi-currency accounting with historical exchange rates has intrinsic difficulty.

Essential complexity can't be eliminated. It's the problem itself. Your job isn't to remove it—it's to organize it clearly so others can reason about it.

### Accidental Complexity

This is everything else. It's the friction you introduce through:

- **Poor boundaries:** Business logic mixed with database queries
- **Tangled dependencies:** Circular imports, global state, hidden coupling
- **Unclear ownership:** Who's responsible for what?
- **Inconsistent patterns:** Every module solved the same problem differently
- **Technical debt:** The shortcuts that became foundations

Accidental complexity multiplies. A small shortcut becomes a pattern. The pattern becomes "how we do things." Before long, you spend more time navigating the mess than solving real problems.

**Good architecture doesn't eliminate complexity. It separates essential from accidental, keeps essential visible, and removes accidental wherever possible.**

## The Cost of Change Over Time

Code doesn't get harder to change because it's old. It gets harder because early decisions created constraints that compound.

Imagine three versions of the same system:

**Version A: Everything in one file**
- Week 1: Easy. You know where everything is.
- Month 3: Annoying. The file is huge, but you can still find things.
- Year 1: Painful. 3,000 lines. Nobody understands it all. Changes break things unexpectedly.

**Version B: Organized by features, but no clear boundaries**
- Week 1: A bit slower. More files to create.
- Month 3: Better. Features are isolated, mostly.
- Year 1: Frustrating. Features leak into each other. Shared code is a tangled mess. Changes ripple unpredictably.

**Version C: Clear layers, explicit dependencies, defined boundaries**
- Week 1: Slowest. More setup, more indirection.
- Month 3: Slightly slower. You have to understand the structure.
- Year 1: Fastest. Changes are localized. Tests catch breaks. Refactors are safe.

Early on, architecture feels like overhead. Later, it's what saves you.

The question isn't "is this faster today?" The question is "what does this cost us in six months?"

## Architecture as Communication

Code is read far more than it's written. Architecture is how you communicate intent to your future self, your teammates, and everyone who comes after you.

When architecture is unclear:
- Developers argue about where new code belongs
- Pull requests turn into philosophical debates
- New team members take weeks to contribute
- "Where does this go?" has no clear answer

When architecture is clear:
- Structure guides decisions
- Patterns are consistent
- Violations are obvious
- Onboarding is faster

**Architecture is a shared language.** It lets the team reason about the system without needing to understand every detail.

This is why consistency matters more than perfection. A mediocre architecture consistently applied beats a brilliant architecture inconsistently applied.

## Architecture Is About Removing Options, Not Adding Them

Freedom feels good, but unbounded freedom is paralyzing. When everything is possible, nothing is clear.

Good architecture constrains. It says:
- "Business logic goes here, not there"
- "Dependencies flow this direction, not that one"
- "This layer can call that layer, but not the reverse"

These constraints aren't restrictions. They're guidance. They eliminate entire categories of bad decisions, leaving only the moves that matter.

Think of it like a chess board. The rules limit where pieces can move, but those limits create the game. Without constraints, there's no strategy—just chaos.

Architecture does the same for code. It removes the options that hurt you, leaving only the ones that serve you.

## When "Good Enough" Beats "Perfect"

Perfectionism is a trap.

You learn Clean Architecture and suddenly every line of code feels wrong. You see coupling everywhere. You want to fix it all. You spend hours refactoring working code just because it doesn't match the ideal in your head.

This is how good intentions paralyze progress.

**Perfect architecture doesn't exist.** Every decision is a tradeoff. Every pattern has a cost.

Sometimes messy code is exactly what the moment requires:
- A prototype doesn't need layers
- A proof of concept doesn't need tests
- A one-time script doesn't need abstractions

The skill isn't knowing the perfect pattern. The skill is knowing when to apply it and when to let it go.

**Start with good enough. Evolve toward better.**

You'll know when "good enough" stops being enough. The code will tell you:
- Refactors start taking longer
- Changes break things unexpectedly
- New features feel impossible
- The team slows down

Those are signals to improve. Not before. Not because a principle says you should. But because the system is asking for it.

## The Spectrum: Quick Script → Well-Architected System

Architecture isn't binary. It's a spectrum.

**Quick Script (minutes to hours):**
- Single file, maybe 50 lines
- No functions, just imperative code
- Hard-coded values
- Run once, throw away

**Functional Program (hours to days):**
- Multiple functions
- Some reusable logic
- Still one file or a handful
- Minimal structure

**Organized Codebase (days to weeks):**
- Multiple modules
- Clear file organization
- Separation of concerns
- Basic testing

**Well-Architected System (weeks to ongoing):**
- Clear layers
- Explicit dependencies
- Domain modeling
- Comprehensive tests
- Swappable infrastructure

Move right as the project demands it, not because a book said you should.

Architecture scales with need, not ambition.

## Why Patterns Become Cargo Cults

Cargo culting happens when teams copy structure without understanding tradeoffs.

The term comes from World War II, when islanders in the Pacific observed military planes bringing supplies. After the war ended, some communities built replica runways and control towers, believing the structures themselves would summon the planes back.

Software teams do this constantly:
- "We need layers because Clean Architecture says so"
- "We need microservices because Google uses them"
- "We need abstractions everywhere because dependency inversion"

The patterns go in, but the understanding doesn't.

The original system had reasons—specific constraints, specific goals. Your system doesn't share those constraints. What worked there might be catastrophic here.

**Patterns are solutions to specific problems.** If you don't have the problem, you don't need the solution.

Good architects know the patterns. Great architects know when not to use them.

## Summary

Software architecture matters because code changes. Good architecture makes change easy. Bad architecture makes change expensive.

Architecture isn't about perfection. It's about intention. It's about understanding your constraints, separating essential from accidental complexity, and making deliberate choices about what matters most.

You don't need architecture for every project. But when you need it, you need to understand why you need it—not just what patterns to apply.

Now that you understand the philosophy, the rest of this book shows you how to apply it.


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
