---
title: Architectural Patterns
lede: Patterns for structuring entire applications and services, layering, boundaries, and cross-cutting concerns.
---

The core question architectural patterns answer is: **how should the whole system be organised?**

Software architecture is about decisions you keep living with. You decide what must stay easy to change, then protect that code from fast-changing details around it. For example, if you keep business rules separate from database code, future changes are usually safer and cheaper.

Architecture must be intentional. It must not be based on preferences, cargo culting, or "best practices" without context. The right architecture depends on your domain, your team, and your future plans.

## What Is Software Architecture?

Software architecture is the structure you need to reason about a system: its parts, how those parts connect, and the rules for how the system can grow.

**Architecture is the shape of your decisions over time.**

Every codebase has architecture, even if nobody planned it. The real question is whether it helps the team move faster, or quietly slows every change down.

In practice, architecture shows up as:
- **File and folder structure:** where code lives
- **Dependencies:** what depends on what
- **Boundaries:** what can and cannot talk to each other
- **Abstractions:** what you hide and what you expose
- **Contracts:** what each part promises to other parts

These choices compound. A small shortcut in week one can become a hard constraint in year two.

Good architecture makes change easier. Bad architecture makes change expensive.

## When to Apply Architecture (And When Not To)

Architecture has a cost. It adds layers, interfaces, and mental overhead. Not every project needs a heavy structure.

You usually need stronger architecture when:

- **The system lives longer than expected:** the prototype is now production
- **Many people maintain it:** clear boundaries reduce coordination pain
- **Requirements change often:** today's feature becomes tomorrow's legacy path
- **Technical choices are likely to change:** databases, APIs, frameworks
- **Correctness is critical:** finance, healthcare, safety-sensitive systems
- **The domain is complex:** many interacting business rules

You can usually keep it lighter when:

- **It is a prototype or experiment:** ship, learn, discard
- **You are the only maintainer:** extra layers may not pay off
- **Requirements are simple and stable:** no need to over-structure
- **The project has a short life:** scripts, one-off tools, migrations
- **You do not understand the domain yet:** architecture too early is guesswork

Knowing patterns is useful. Knowing when to apply them is the harder skill.

## Essential Complexity vs Accidental Complexity

Not all complexity is the same.

### Essential complexity

This is complexity from the problem itself. Tax systems are complex because tax rules are complex. Airline scheduling is hard because time zones and crew constraints are real. Multi-currency accounting is hard because exchange rates and timing matter.

You cannot remove essential complexity. You can only organize it so people can understand it.

### Accidental complexity

This is complexity created by implementation choices:

- **Poor boundaries:** business logic mixed with SQL and transport code
- **Tangled dependencies:** circular imports, hidden global state, tight coupling
- **Unclear ownership:** nobody knows who owns what
- **Inconsistent patterns:** each module solves the same problem differently
- **Technical debt:** temporary shortcuts that became permanent

Accidental complexity grows fast. A one-time shortcut becomes a pattern. Then the pattern becomes team habit. Soon, most effort goes into working around the system instead of improving it.

**Good architecture does not remove all complexity. It keeps essential complexity visible and reduces accidental complexity.**

## The Cost of Change Over Time

Code does not become hard to change just because it is old. It becomes hard because constraints stack up.

Think about three versions of the same system:

**Version A: one huge file**
- Week 1: fast and simple
- Month 3: still workable, but annoying
- Year 1: painful, risky changes, no clear ownership

**Version B: split by features, weak boundaries**
- Week 1: slower setup
- Month 3: better than one file
- Year 1: features bleed into each other, changes ripple everywhere

**Version C: clear layers and dependency direction**
- Week 1: slowest setup
- Month 3: moderate overhead
- Year 1: fastest to change, safer refactors, better test confidence

Early architecture can feel like overhead. Later, it often pays for itself.

Better question than "is this fastest today?": "what will this cost in six months?"

## Architecture as Communication

Code is read far more than written. Architecture is one of your main communication tools for future teammates and future you.

When architecture is unclear:
- developers debate where new code should go
- pull requests become design arguments
- onboarding takes too long
- ownership is fuzzy

When architecture is clear:
- structure guides decisions
- patterns stay consistent
- bad coupling is easier to spot
- onboarding gets faster

**Architecture is shared language for the team.**

Consistency usually matters more than perfection. A decent architecture used consistently beats a brilliant one used randomly.

## Architecture Is About Removing Options, Not Adding Them

Unlimited freedom sounds nice, but it creates confusion.

Good architecture sets limits:
- business logic belongs in specific places
- dependencies flow in specific directions
- some layers can call others, but not the reverse

These constraints remove many bad decisions before they happen.

Like game rules in chess: limits create clarity and strategy.

Architecture does the same for code.

## When "Good Enough" Beats "Perfect"

Perfectionism can block delivery.

After learning architecture patterns, it is easy to think every file is wrong and everything needs a refactor. That mindset can freeze progress.

**Perfect architecture does not exist.** Every decision is a tradeoff.

Sometimes "messy but useful" is the right call for now:
- prototypes usually do not need full layering
- proof-of-concepts may not need full tests
- one-time scripts rarely need abstractions

The key skill is judgment: when to apply structure, and when to keep moving.

**Start with good enough. Improve when the pain is real.**

Common signals that improvement is now needed:
- refactors keep taking longer
- changes break unrelated areas
- new features feel much harder than expected
- team throughput drops

Use those signals, not theory alone, to decide when to level up architecture.

## The Spectrum: Quick Script to Well-Architected System

Architecture is a spectrum, not an all-or-nothing choice.

**Quick script (minutes to hours):**
- single file
- direct, imperative code
- hard-coded values
- run once and discard

**Small functional program (hours to days):**
- multiple functions
- some reusable logic
- still only a few files

**Organized codebase (days to weeks):**
- multiple modules
- clear file layout
- basic separation of concerns
- basic tests

**Well-architected system (weeks to ongoing):**
- clear boundaries and layers
- explicit dependency direction
- stronger domain modeling
- comprehensive tests
- replaceable infrastructure

Move right only when the project needs it.

Architecture should scale with need, not with ego.

## Why Patterns Become Cargo Cults

Cargo culting happens when teams copy structure without understanding why it exists.

Common examples:
- "We need layers because Clean Architecture says so"
- "We need microservices because large companies use them"
- "We need abstraction everywhere"

The structure is copied, but the reasoning is missing.

Patterns work when they solve a real problem in your context. Without that context, the same pattern can hurt more than help.

**Patterns are tools for specific problems. If you do not have the problem, you probably do not need the pattern.**

Good architects know many patterns. Great architects know when not to use them.

## Where the Catalog Goes Next

Architecture becomes important when software stops being a personal sketch and starts carrying real load.

You will not need every pattern in this section. Some are too heavy for simple CRUD. Some only pay off when domain complexity or operational scale grows. That is normal. Pick what matches your pressure points.

From here, the catalog gets concrete: layering, persistence boundaries, event flow, and failure handling.

Architectural patterns work at service/application scale. They describe system shape and dependency rules, not just one class or one small collaboration.

**Start with [Layered Architecture](/go/patterns/architectural/layered)** when you need order in a new service. A common default is four tiers (Handler, Service, Repository, Infrastructure) with downward dependency flow.

**Add [Repository](/go/patterns/architectural/repository)** when SQL starts leaking into business logic. Put the interface near domain/application logic, and keep implementations in infrastructure.

**Move to [Hexagonal Architecture](/go/patterns/architectural/hexagonal)** when you need multiple delivery mechanisms (HTTP, gRPC, CLI) on the same use cases, or when you want fast core tests with no infrastructure.

**[Clean Architecture](/go/patterns/architectural/clean-architecture)** overlaps heavily with Hexagonal. The main difference is mental model (rings vs ports/adapters). Use the one your team can enforce clearly.

**Use [Domain-Driven Design](/go/patterns/architectural/domain-driven-design)** when business rules are truly complex and domain language matters. Tactical DDD patterns usually live in the inner application/core layers.

**Add [CQRS](/go/patterns/architectural/cqrs)** when read and write paths need different models. This avoids forcing one model to do both jobs poorly.

**[Event-Driven Architecture](/go/patterns/architectural/event-driven)** decouples producers from consumers using events. Start in-process when small; move to Kafka/NATS when needed.

**[Circuit Breaker](/go/patterns/architectural/circuit-breaker)** protects you from slow or failing dependencies by failing fast instead of letting requests pile up.

**[MVC / MVP / MVVM](/go/patterns/architectural/mvc)** keep business decisions out of rendering code. They differ in how the UI and mediator/presenter/view-model interact.

**[Event Sourcing](/go/patterns/architectural/event-sourcing)** stores events as the source of truth and derives current state by replaying. Auditability becomes structural, not optional.

**[Saga](/go/patterns/architectural/saga)** coordinates multi-step workflows across services without distributed transactions, using local commits plus compensating actions.

**[Strangler Fig](/go/patterns/architectural/strangler-fig)** replaces legacy systems incrementally by routing some traffic to new code and expanding coverage over time.

**[Microservices](/go/patterns/architectural/microservices)** split a system into independently deployable services with clear ownership boundaries. Start from a good monolith first, then extract when justified.

**[Pipe and Filter](/go/patterns/architectural/pipe-and-filter)** processes data as ordered transformation steps. In Go this can be function chains, channel pipelines, or layered `io.Reader` wrappers.

---

The [SOLID Principles](/go/philosophy/solid), especially Dependency Inversion, support all of these patterns. Clean Architecture's dependency rule is Dependency Inversion applied at system level.
