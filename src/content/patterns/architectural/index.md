---
title: Architectural Patterns
lede: Patterns for structuring entire applications and services, layering, boundaries, and cross-cutting concerns.
---

The question architectural patterns answer: **how should the whole system be organised?**

Software architecture is a series of choices you keep paying for. It isn't about having the "right" framework or the cleanest diagram. It's about deciding what needs to stay easy to change, then protecting that code from the churn around it. Split business rules from database details, for example, and future you has a much better chance.

## What Is Software Architecture?

Software architecture is the set of structures needed to reason about a software system: its components, their relationships, and the principles governing their design and evolution.

**Architecture is the shape of decisions.**

Every codebase has an architecture, whether intentional or accidental. The real question is whether that architecture helps the team move, or quietly makes every change harder than it should be.

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
- **The domain is complex:** Business rules are involved and interrelated

Skip architecture when:

- **It's a prototype or experiment:** Ship fast, learn, throw away
- **You're the only developer forever:** Cognitive overhead helps nobody
- **Requirements are stable and simple:** Some problems stay solved
- **The project has a clear expiration date:** Scripts, one-time migrations, throwaway tools
- **You don't understand the problem yet:** Premature architecture is waste

The skill isn't knowing patterns. It's knowing when to apply them.

## Essential Complexity vs Accidental Complexity

Not all complexity is equal. Some is inherent to the problem. Some you inflict on yourself.

### Essential complexity

This is the difficulty built into the problem you're solving. Tax law is complex because taxes are complex. Flight scheduling across time zones with crew availability constraints is genuinely hard. Multi-currency accounting with historical exchange rates has intrinsic difficulty.

Essential complexity can't be eliminated. It's the problem itself. Your job isn't to remove it; it's to organise it clearly so other people can reason about it without getting lost.

### Accidental complexity

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

**Version B: Organised by features, but no clear boundaries**
- Week 1: A bit slower. More files to create.
- Month 3: Better. Features are isolated, mostly.
- Year 1: Frustrating. Features leak into each other. Shared code is a tangled mess. Changes ripple unpredictably.

**Version C: Clear layers, explicit dependencies, defined boundaries**
- Week 1: Slowest. More setup, more indirection.
- Month 3: Slightly slower. You have to understand the structure.
- Year 1: Fastest. Changes are localised. Tests catch breaks. Refactors are safe.

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

These constraints aren't restrictions. They're guidance. They remove whole categories of bad decisions and leave you with the choices that actually matter.

Think of it like a chess board. The rules limit where pieces can move, but those limits create the game. Without constraints, there's no strategy, just chaos.

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

## The Spectrum: Quick Script to Well-Architected System

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

**Organised Codebase (days to weeks):**
- Multiple modules
- Clear file organisation
- Separation of concerns
- Basic testing

**Well-Architected System (weeks to ongoing):**
- Clear layers
- Explicit dependencies
- Domain modelling
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

The original system had reasons: specific constraints and specific goals. Your system doesn't share those constraints. What worked there might be catastrophic here.

**Patterns are solutions to specific problems.** If you don't have the problem, you don't need the solution.

Good architects know the patterns. Great architects know when not to use them.

## Where the Catalog Goes Next

Architecture matters once code stops being a solo sketch and starts carrying real load. That's when boundaries, dependencies, and naming decisions stop feeling academic.

You won't need every pattern in this section. Some are too heavy for a small CRUD service. Some only start paying off when the domain gets messy or the number of moving parts goes up. That's fine. The point is to recognise the pressure you're under, then pick the structure that relieves it.

The rest of the catalog gets more concrete from here: layering, persistence boundaries, event flow, and failure handling. Use the parts that match your system; ignore the ones that don't.

Architectural patterns operate at a different scale than creational, structural, and behavioral patterns. They don't describe a single type or a single collaboration. They describe the shape of an entire service or application, and the rules for where each piece of code belongs.

**Start with [Layered Architecture](/go/patterns/architectural/layered)** for a new service when you mainly need order. Four tiers (Handler, Service, Repository, Infrastructure) with each depending only on the one below. It's a sensible default.

**Add [Repository](/go/patterns/architectural/repository)** when database calls start leaking into business code. Define the interface in the domain package, implement it in infrastructure, and your service logic becomes testable without a running database.

**Graduate to [Hexagonal Architecture](/go/patterns/architectural/hexagonal)** when you need multiple delivery mechanisms (HTTP and gRPC and maybe a CLI too) against the same business logic, or when you want to test the application core without any infrastructure. Hexagonal formalises what Layered hints at: ports are the interfaces, adapters are the implementations, and the application imports none of them directly.

**[Clean Architecture](/go/patterns/architectural/clean-architecture)** covers much of the same ground as Hexagonal, just with "concentric rings" language. Use whichever model helps your team enforce the inward dependency rule. In practice, plenty of teams mix the terms.

**Use [Domain-Driven Design](/go/patterns/architectural/domain-driven-design)** when the business rules are genuinely complex: multiple interacting aggregates, invariants that have to hold everywhere, and domain experts you can actually talk to. DDD's tactical patterns (Entities, Value Objects, Aggregates, Domain Events) usually live inside the inner rings of Hexagonal or Clean Architecture.

**Add [CQRS](/go/patterns/architectural/cqrs)** when reads and writes want different shapes. Maybe the write side needs a rich domain model with invariants, while the read side just wants flat denormalised projections. CQRS lets those two paths evolve without tripping over each other.

**[Event-Driven Architecture](/go/patterns/architectural/event-driven)** decouples producers from consumers at the event boundary. A failed notification service stops blocking order placement. Start with an in-process event bus; move to Kafka or NATS when the workload actually demands it.

**[Circuit Breaker](/go/patterns/architectural/circuit-breaker)** is the resilience pattern for external dependencies. When a downstream service slows or fails, the breaker opens and fails fast instead of letting goroutines pile up behind timeouts that are obviously going nowhere.

**[MVC / MVP / MVVM](/go/patterns/architectural/mvc)** are three variations on the same idea: business logic should not live inside rendering code. In a Go HTTP service this becomes: handlers coordinate (Controller), domain packages decide (Model), templates or JSON serialisers render (View). Each variant differs in how tightly the view and the mediating layer are coupled.

**[Event Sourcing](/go/patterns/architectural/event-sourcing)** stores state as an append-only log of domain events instead of a current-state row. Current state is derived by replaying the log. The audit trail is a structural consequence, not an add-on. Pairs naturally with [CQRS](/go/patterns/architectural/cqrs): the command side appends events; the query side subscribes and builds projections.

**[Saga](/go/patterns/architectural/saga)** coordinates multi-step operations across service boundaries without a distributed transaction. Each step succeeds locally and publishes an event or message; failures trigger compensating transactions that undo completed steps. Two coordination styles: choreography (services react to each other's events) and orchestration (a coordinator drives the workflow explicitly).

**[Strangler Fig](/go/patterns/architectural/strangler-fig)** incrementally replaces a legacy system by routing some traffic to a new implementation while unimplemented paths fall through to the old one. Coverage expands until the legacy system handles nothing and can be deleted. It's the practical alternative to a big-bang rewrite.

**[Microservices](/go/patterns/architectural/microservices)** structures an application as independently deployable services, each owning its own domain and data store. Teams can release and scale their service without coordinating with others. Start with a well-structured monolith; extract services when independent deployment or scaling becomes a genuine constraint, not a hypothetical one.

**[Pipe and Filter](/go/patterns/architectural/pipe-and-filter)** processes data through a sequence of independent transformation steps. Each filter reads input, applies one transformation, and writes output. Filters share no state and have no knowledge of each other. In Go: a chain of functions, a goroutine pipeline over channels, or a stack of `io.Reader` wrappers. Each filter is independently testable and reorderable.

---

The [SOLID Principles](/go/philosophy/solid), especially the Dependency Inversion Principle, underpin all of these patterns. The Dependency Rule in Clean Architecture *is* DIP applied architecturally.
