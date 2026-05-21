// Decision tree for the Pattern Finder.
// Each node is either a branch (question + options) or the options carry
// a `patterns` array directly (terminal).
//
// Option shape:
//   { label, hint, next }      → navigate deeper (next is another node)
//   { label, hint, patterns }  → show results ({ slug, reason }[])

const terminal = (entries) => ({ patterns: entries });

// ─── Concurrency ────────────────────────────────────────────────────────────

const CONCURRENCY = {
  question: "What's the goroutine challenge?",
  options: [
    {
      label: "Stopping goroutines cleanly when work is done",
      hint: "Signal goroutines to exit without leaking them",
      patterns: terminal([{
        slug: "done-channel",
        reason: "A closed done channel broadcasts a stop signal to every goroutine listening on it — the zero-cost broadcast idiom in Go.",
      }]),
    },
    {
      label: "Setting a time limit or cancelling a blocked call",
      hint: "A select with a timeout case or a context deadline",
      patterns: terminal([{
        slug: "timeout-select",
        reason: "select on both the result channel and a time.After (or context.Done) lets you bound how long you wait without blocking forever.",
      }]),
    },
    {
      label: "Limiting how many goroutines run at once",
      hint: "A bounded pool of workers consuming a shared job queue",
      patterns: terminal([{
        slug: "worker-pool",
        reason: "A fixed number of worker goroutines read from a jobs channel — concurrency is bounded by the pool size, not the number of inputs.",
      }]),
    },
    {
      label: "Limiting concurrent access to a shared resource",
      hint: "N goroutines allowed in at a time, not just one",
      patterns: terminal([{
        slug: "semaphore",
        reason: "A buffered channel of capacity N acts as a counting semaphore — acquire by sending, release by receiving.",
      }]),
    },
    {
      label: "Processing data through concurrent stages",
      hint: "Each stage runs in its own goroutine; channels connect them",
      patterns: terminal([{
        slug: "pipeline",
        reason: "Each stage receives from an inbound channel and sends to an outbound channel. Stages run concurrently and back-pressure flows naturally through channel blocking.",
      }]),
    },
    {
      label: "Distributing work across many goroutines and collecting results",
      hint: "Fan out to workers; merge their outputs into one stream",
      patterns: terminal([{
        slug: "fan-out-fan-in",
        reason: "Fan-out: send each job to a separate goroutine. Fan-in: merge all result channels into one with a multiplexing goroutine.",
      }]),
    },
    {
      label: "Running goroutines concurrently and collecting their errors",
      hint: "Wait for all to finish; if any fails, capture the error",
      patterns: terminal([{
        slug: "errgroup",
        reason: "errgroup.Group launches goroutines and collects the first non-nil error. It also carries a derived context that cancels when any goroutine fails.",
      }]),
    },
  ],
};

// ─── Creational ─────────────────────────────────────────────────────────────

const CREATIONAL = {
  question: "What's the creation challenge?",
  options: [
    {
      label: "Callers shouldn't need to know which concrete type they get",
      hint: "Return an interface; the factory decides the implementation",
      patterns: terminal([{
        slug: "factory-method",
        reason: "Define a constructor function that returns an interface. Callers depend on the interface — they never import or instantiate the concrete struct.",
      }]),
    },
    {
      label: "I need to create coordinated families of related objects",
      hint: "e.g. a full theme, a driver set, or a platform-specific suite",
      patterns: terminal([{
        slug: "abstract-factory",
        reason: "One factory interface creates a consistent family of objects. Swap the factory implementation to switch the whole suite at once.",
      }]),
    },
    {
      label: "Construction is complex with many optional parts",
      hint: "Too many constructor arguments, optional fields, or multi-step assembly",
      patterns: terminal([{
        slug: "builder",
        reason: "A step-by-step builder with method chaining avoids an exploding constructor and makes invalid states unrepresentable during construction.",
      }]),
    },
    {
      label: "I need to copy an existing configured object",
      hint: "Clone with modifications rather than constructing from scratch",
      patterns: terminal([{
        slug: "prototype",
        reason: "Implement a Clone() method that deep-copies the object. Callers start from a fully configured prototype and tweak only what differs.",
      }]),
    },
    {
      label: "I need exactly one instance shared across the whole program",
      hint: "A global service, connection pool, or registry",
      patterns: terminal([{
        slug: "singleton",
        reason: "A package-level var initialised with sync.Once guarantees one instance. Read the pattern — it also argues when dependency injection is a better choice.",
      }]),
    },
  ],
};

// ─── Structural ─────────────────────────────────────────────────────────────

const STRUCTURAL = {
  question: "What's the structural challenge?",
  options: [
    {
      label: "Two incompatible interfaces need to work together",
      hint: "Wrap one to satisfy the other's contract — neither side changes",
      patterns: terminal([{
        slug: "adapter",
        reason: "A wrapper struct implements the target interface by delegating to the adaptee. Neither the adaptee nor the caller needs to change.",
      }]),
    },
    {
      label: "Add behaviour to an object without modifying or subclassing it",
      hint: "Layer responsibilities at runtime, composably",
      patterns: terminal([{
        slug: "decorator",
        reason: "The decorator and the original both implement the same interface. Wrap the original in a new struct and add behaviour before or after delegating.",
      }]),
    },
    {
      label: "Simplify a complex subsystem behind a single clean API",
      hint: "Callers shouldn't need to know the subsystem's internals",
      patterns: terminal([{
        slug: "facade",
        reason: "One struct exposes only the operations callers need. It coordinates the subsystem internally; callers never import the subsystem packages directly.",
      }]),
    },
    {
      label: "Control or intercept access to an object",
      hint: "Lazy loading, access control, caching, logging, or remote access",
      patterns: terminal([{
        slug: "proxy",
        reason: "The proxy and subject implement the same interface. Callers can't tell them apart, but the proxy adds cross-cutting behaviour transparently.",
      }]),
    },
    {
      label: "Treat individual items and groups the same way",
      hint: "Tree structures, nested components, recursive operations",
      patterns: terminal([{
        slug: "composite",
        reason: "Leaf and composite both implement the same interface. Callers recurse without type-switching; the composite delegates to its children.",
      }]),
    },
    {
      label: "Decouple an abstraction from its implementation",
      hint: "Both should be able to vary and grow independently",
      patterns: terminal([{
        slug: "bridge",
        reason: "Separate what an object does (abstraction) from how it does it (implementation) so each side can be extended without touching the other.",
      }]),
    },
    {
      label: "Share many fine-grained objects cheaply",
      hint: "Large numbers of similar objects with shared immutable state",
      patterns: terminal([{
        slug: "flyweight",
        reason: "Extract the shared (intrinsic) state into an immutable object shared across all instances. Only the variable (extrinsic) state is stored per instance.",
      }]),
    },
  ],
};

// ─── Behavioral ─────────────────────────────────────────────────────────────

const BEHAVIORAL_SWITCH = {
  question: "What drives the branching?",
  options: [
    {
      label: "Different algorithms for the same task",
      hint: "Sorting strategies, payment processors, formatters — the caller picks the variant",
      patterns: terminal([{
        slug: "strategy",
        reason: "Replace the switch with an interface. Each case becomes a struct that satisfies it. New strategies are additive — the host code doesn't change.",
      }]),
    },
    {
      label: "A request that should pass through handlers until one deals with it",
      hint: "The first handler that can process it does; the rest pass it on",
      patterns: terminal([{
        slug: "chain-of-responsibility",
        reason: "Chain handlers; each decides to handle the request or call next. Go's HTTP middleware is this pattern — handler wraps handler.",
      }]),
    },
    {
      label: "Rules or expressions evaluated at runtime",
      hint: "Filter DSL, rule engine, arithmetic or boolean expressions",
      patterns: terminal([{
        slug: "interpreter",
        reason: "Map each grammar rule to a type implementing Interpret(). Build the expression tree from input; walk it to evaluate. Each rule is independently testable.",
      }]),
    },
  ],
};

const BEHAVIORAL_REACTIONS = {
  question: "How do the things that react relate to each other?",
  options: [
    {
      label: "One broadcaster, many independent listeners",
      hint: "Listeners don't talk to each other — they just react to the source",
      patterns: terminal([{
        slug: "observer",
        reason: "The subject holds a slice of observer interfaces and calls them on state change. New listeners are additive — the subject imports nothing from them.",
      }]),
    },
    {
      label: "Peers coordinate through a central hub",
      hint: "Many-to-many; peers would otherwise call each other directly",
      patterns: terminal([{
        slug: "mediator",
        reason: "Route messages through a Mediator. Peers import only the mediator — not each other. O(n) coupling instead of O(n²).",
      }]),
    },
  ],
};

const BEHAVIORAL_OPERATIONS = {
  question: "What do you need to do with the operations?",
  options: [
    {
      label: "Queue, log, replay, or audit operations",
      hint: "Operations as values that can be stored and re-executed",
      patterns: terminal([{
        slug: "command",
        reason: "Wrap each operation in a struct with Execute(). Enqueue it, log it, replay it — the caller just invokes Execute() without knowing the implementation.",
      }]),
    },
    {
      label: "Undo or restore to a previous snapshot",
      hint: "Save the state before a change; restore it on undo",
      patterns: terminal([{
        slug: "memento",
        reason: "Capture unexported state in a snapshot type defined in the same package. Callers save and restore without accessing internals — Go's visibility rules enforce encapsulation.",
      }]),
    },
  ],
};

const BEHAVIORAL = {
  question: "What's the core symptom?",
  options: [
    {
      label: "Too many if/switch statements selecting behaviour",
      hint: "Adding a new case means modifying core code; branching keeps growing",
      next: BEHAVIORAL_SWITCH,
    },
    {
      label: "Multiple things need to react when something changes",
      hint: "One change; several components need to know about it",
      next: BEHAVIORAL_REACTIONS,
    },
    {
      label: "I need to queue, log, or undo operations",
      hint: "Operations should be storable, replayable, or reversible",
      next: BEHAVIORAL_OPERATIONS,
    },
    {
      label: "Behaviour changes depending on the object's current state",
      hint: "Every method has a switch on the same state field",
      patterns: terminal([{
        slug: "state",
        reason: "Replace each method's switch with a State interface. Each concrete state implements the behaviour for that state — adding a new state is a new struct, not a new case.",
      }]),
    },
    {
      label: "An algorithm has a fixed structure but variable steps",
      hint: "The skeleton is stable; certain details need to be supplied by the caller",
      patterns: terminal([{
        slug: "template-method",
        reason: "Pass the variable steps as function values or interface methods. The skeleton function calls them in the fixed order — no inheritance required in Go.",
      }]),
    },
    {
      label: "I want to add operations to a stable type hierarchy without modifying it",
      hint: "Types are fixed; operations keep growing",
      patterns: terminal([{
        slug: "visitor",
        reason: "Each element implements Accept(Visitor). Each new operation is a new visitor struct — the element types never change. Use a type switch when the visitor ceremony isn't worth it.",
      }]),
    },
    {
      label: "I need to walk a collection step by step",
      hint: "Consistent iteration regardless of the collection's internal structure",
      patterns: terminal([{
        slug: "iterator",
        reason: "Since Go 1.23, iter.Seq[T] is the standard form — a function that calls yield for each element and is consumed with range. Prefer this over custom Next()/Value() pairs.",
      }]),
    },
  ],
};

// ─── Architectural ───────────────────────────────────────────────────────────

const ARCH_LAYERING = {
  question: "How much isolation do you need?",
  options: [
    {
      label: "Basic layers: handler → service → repository",
      hint: "Each layer depends only on the one below; enough for most services",
      patterns: terminal([{
        slug: "layered",
        reason: "Four tiers — handler, service, repository, infrastructure — with dependencies flowing downward. A sensible default that's easy to explain and enforce.",
      }]),
    },
    {
      label: "Swappable infrastructure — multiple delivery mechanisms or drivers",
      hint: "The same business logic should work behind HTTP, gRPC, a CLI, or a fake",
      patterns: terminal([
        {
          slug: "hexagonal",
          reason: "Ports are interfaces defined by the application core; adapters implement them. The core imports nothing from the outside world.",
        },
        {
          slug: "clean-architecture",
          reason: "Concentric rings with the Dependency Rule: inner layers never import outer ones. Business logic has zero imports of framework, database, or HTTP packages.",
        },
      ]),
    },
    {
      label: "The business domain itself is complex with rich rules",
      hint: "Multiple interacting aggregates, invariants that must hold everywhere",
      patterns: terminal([{
        slug: "domain-driven-design",
        reason: "Model the domain with Entities, Value Objects, and Aggregates. Invariants live inside the aggregate; domain events capture what happened. Usually lives inside hexagonal/clean rings.",
      }]),
    },
  ],
};

const ARCH_DATA = {
  question: "What's the data or persistence pressure?",
  options: [
    {
      label: "Database calls are leaking into business logic",
      hint: "SQL queries appear in service methods; services import the DB driver",
      patterns: terminal([{
        slug: "repository",
        reason: "Define the repository interface in the domain package; implement it in infrastructure. The service imports the interface — never the database driver.",
      }]),
    },
    {
      label: "Read and write shapes are very different",
      hint: "Queries need flat projections; writes need rich domain validation",
      patterns: terminal([{
        slug: "cqrs",
        reason: "Command handlers mutate state and return an error. Query functions return read-model DTOs shaped for the view. Each side evolves without tripping over the other.",
      }]),
    },
    {
      label: "I need a full audit trail and the ability to replay history",
      hint: "What happened, when, and in what order — not just current state",
      patterns: terminal([{
        slug: "event-sourcing",
        reason: "Store domain events instead of current state. Replay the log to rebuild the aggregate. The audit trail is the storage strategy, not an add-on.",
      }]),
    },
  ],
};

const ARCH_SERVICES = {
  question: "What's the inter-service challenge?",
  options: [
    {
      label: "Services need to react to each other's events asynchronously",
      hint: "Producers emit facts; consumers subscribe independently without tight coupling",
      patterns: terminal([{
        slug: "event-driven",
        reason: "Producers publish facts. Consumers subscribe independently. A broken consumer can't roll back the producer's work. Start in-process; move to a broker when load demands it.",
      }]),
    },
    {
      label: "A downstream service failure is blocking or failing mine",
      hint: "A slow or unavailable dependency causes goroutines to pile up",
      patterns: terminal([{
        slug: "circuit-breaker",
        reason: "Track consecutive failures. When they exceed a threshold, open the circuit and fail fast. Probe occasionally to see if the downstream has recovered.",
      }]),
    },
    {
      label: "A business operation spans multiple services and needs rollback on failure",
      hint: "No distributed transactions; each service has its own database",
      patterns: terminal([{
        slug: "saga",
        reason: "A sequence of local transactions, each publishing a success event to trigger the next step. On failure, compensating transactions undo completed steps in reverse.",
      }]),
    },
  ],
};

const ARCH_EVOLUTION = {
  question: "What kind of change or evolution?",
  options: [
    {
      label: "Replacing a legacy system without a big-bang rewrite",
      hint: "Route some traffic to the new system; expand coverage incrementally",
      patterns: terminal([{
        slug: "strangler-fig",
        reason: "A routing layer sends covered paths to the new service; unimplemented paths fall through to the legacy. Remove the legacy once coverage is complete — no cutover day required.",
      }]),
    },
    {
      label: "Breaking a monolith into independently deployable services",
      hint: "Teams need to release and scale independently; deployment is the bottleneck",
      patterns: terminal([{
        slug: "microservices",
        reason: "Each service owns its domain and its database. Teams deploy independently. Start with a well-structured monolith; extract services when independent deployment is a real constraint.",
      }]),
    },
    {
      label: "Separating UI or presentation code from business logic",
      hint: "Handlers or views contain business rules; they're hard to test",
      patterns: terminal([{
        slug: "mvc",
        reason: "Handlers (Controllers) coordinate — they call the Model and format the result for the View. Business logic lives in the service layer; handlers never contain domain rules.",
      }]),
    },
    {
      label: "Data needs to flow through a sequence of transformation steps",
      hint: "ETL pipelines, log processing, request validation chains",
      patterns: terminal([{
        slug: "pipe-and-filter",
        reason: "Each filter reads input, applies one transformation, and passes output to the next. Filters share no state, are independently testable, and can be reordered freely.",
      }]),
    },
  ],
};

const ARCHITECTURAL = {
  question: "Where is the pressure?",
  options: [
    {
      label: "My service has no clear structure or layers",
      hint: "HTTP handlers, business logic, and database calls are mixed together",
      next: ARCH_LAYERING,
    },
    {
      label: "Data access is leaking into the wrong layer",
      hint: "Persistence concerns appear in the wrong place, or read and write needs have diverged",
      next: ARCH_DATA,
    },
    {
      label: "Multiple services need to communicate or coordinate",
      hint: "Services call each other, react to events, or share a distributed operation",
      next: ARCH_SERVICES,
    },
    {
      label: "I'm evolving or migrating an existing system",
      hint: "Replacing legacy code, splitting a monolith, or separating concerns",
      next: ARCH_EVOLUTION,
    },
  ],
};

// ─── Root ────────────────────────────────────────────────────────────────────

export const FINDER_TREE = {
  question: "What kind of problem are you trying to solve?",
  options: [
    {
      label: "Creating objects",
      hint: "Construction is getting complex, or you need to control what gets created and how",
      next: CREATIONAL,
    },
    {
      label: "Connecting types and adding behaviour",
      hint: "Incompatible interfaces, layering responsibilities, or controlling access to objects",
      next: STRUCTURAL,
    },
    {
      label: "How objects communicate at runtime",
      hint: "Reacting to changes, selecting algorithms, or managing state transitions",
      next: BEHAVIORAL,
    },
    {
      label: "System design and architecture",
      hint: "Layering a service, separating concerns, or coordinating multiple services",
      next: ARCHITECTURAL,
    },
    {
      label: "Goroutines and concurrency",
      hint: "Lifecycle management, work distribution, pipelines, or error collection",
      next: CONCURRENCY,
    },
  ],
};
