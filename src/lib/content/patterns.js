// Canonical pattern data — every catalog, sidebar, and category page reads from here.
// No one-liner is written twice.

export const CATEGORIES = {
  creational: {
    slug: "creational",
    title: "Creational Patterns",
    lede: "Object-creation mechanisms that increase flexibility and reuse of existing code.",
  },
  structural: {
    slug: "structural",
    title: "Structural Patterns",
    lede: "How to assemble types into larger structures while keeping them flexible and efficient.",
  },
  behavioral: {
    slug: "behavioral",
    title: "Behavioral Patterns",
    lede: "Algorithms and the assignment of responsibilities between objects.",
  },
  architectural: {
    slug: "architectural",
    title: "Architectural Patterns",
    lede: "Patterns for structuring entire applications and services — layering, boundaries, and cross-cutting concerns.",
  },
};

export const CATEGORY_ORDER = ["creational", "structural", "behavioral", "architectural"];

export const PATTERNS = [
  // ── Creational ──
  {
    slug: "factory-method",
    title: "Factory Method",
    category: "creational",
    intent: "Define an interface for creating an object, but let the calling code decide which concrete type to instantiate via constructor functions returning an interface.",
    goIdiomSummary: "Constructor functions returning an interface; selection via map of constructors, not a class hierarchy.",
    relatedSlugs: ["abstract-factory", "builder", "prototype"],
  },
  {
    slug: "abstract-factory",
    title: "Abstract Factory",
    category: "creational",
    intent: "Provide an interface whose methods each return related product interfaces, so families of related objects can be created without specifying their concrete types.",
    goIdiomSummary: "An interface whose methods each return related product interfaces; one struct per family.",
    relatedSlugs: ["factory-method", "builder"],
  },
  {
    slug: "builder",
    title: "Builder",
    category: "creational",
    intent: "Construct complex objects step by step, separating construction from representation so the same process can create different results.",
    goIdiomSummary: "Prefer the functional options pattern (func WithTimeout(d) Option); also show classic chained builder.",
    relatedSlugs: ["factory-method", "abstract-factory"],
  },
  {
    slug: "prototype",
    title: "Prototype",
    category: "creational",
    intent: "Create new objects by cloning an existing instance, avoiding the cost of building from scratch and decoupling code from concrete types.",
    goIdiomSummary: "A Clone() method; be explicit about shallow vs deep copy with pointers, slices, maps.",
    relatedSlugs: ["factory-method", "memento"],
  },
  {
    slug: "singleton",
    title: "Singleton",
    category: "creational",
    intent: "Ensure a type has only one instance and provide a global point of access to it.",
    goIdiomSummary: "Package-level value + sync.Once; then argue against it (testability) and show dependency injection.",
    relatedSlugs: ["factory-method", "builder"],
  },
  // ── Structural ──
  {
    slug: "adapter",
    title: "Adapter",
    category: "structural",
    intent: "Convert the interface of an existing type into another interface clients expect, letting incompatible types work together.",
    goIdiomSummary: "A wrapper struct that satisfies the target interface by delegating to the adaptee.",
    relatedSlugs: ["bridge", "decorator", "facade", "proxy"],
  },
  {
    slug: "bridge",
    title: "Bridge",
    category: "structural",
    intent: "Split a large type into two separate hierarchies — abstraction and implementation — that can vary independently.",
    goIdiomSummary: "Split abstraction and implementation into two interfaces composed by struct fields.",
    relatedSlugs: ["adapter", "strategy"],
  },
  {
    slug: "composite",
    title: "Composite",
    category: "structural",
    intent: "Compose objects into tree structures so clients can treat individual objects and compositions uniformly through a single interface.",
    goIdiomSummary: "One interface implemented by both leaf and composite types; tree of nodes; recursion.",
    relatedSlugs: ["decorator", "iterator", "visitor"],
  },
  {
    slug: "decorator",
    title: "Decorator",
    category: "structural",
    intent: "Attach additional behavior to an object dynamically by wrapping it in another object that implements the same interface.",
    goIdiomSummary: "Wrap an interface to add behavior; canonical Go example: http.Handler / RoundTripper middleware.",
    relatedSlugs: ["adapter", "composite", "proxy", "chain-of-responsibility"],
  },
  {
    slug: "facade",
    title: "Facade",
    category: "structural",
    intent: "Provide a simple, unified interface to a complex subsystem, shielding clients from internal complexity.",
    goIdiomSummary: "A struct exposing a small API over several subsystem packages.",
    relatedSlugs: ["adapter", "mediator"],
  },
  {
    slug: "flyweight",
    title: "Flyweight",
    category: "structural",
    intent: "Minimize memory usage by sharing as much data as possible between similar objects, separating intrinsic from extrinsic state.",
    goIdiomSummary: "Share immutable intrinsic state via interning and lookup map; mention sync.Pool as a related but different reuse tool.",
    relatedSlugs: ["composite", "singleton"],
  },
  {
    slug: "proxy",
    title: "Proxy",
    category: "structural",
    intent: "Provide a surrogate or placeholder for another object to control access, add lazy initialization, logging, or caching.",
    goIdiomSummary: "Same-interface wrapper for lazy init, access control, logging, caching; contrast with Decorator.",
    relatedSlugs: ["adapter", "decorator"],
  },
  // ── Behavioral ──
  {
    slug: "chain-of-responsibility",
    title: "Chain of Responsibility",
    category: "behavioral",
    intent: "Pass a request along a chain of handlers, where each handler decides whether to process it or pass it to the next handler.",
    goIdiomSummary: "A slice or linked list of handlers, or composed middleware that may pass to next.",
    relatedSlugs: ["decorator", "command"],
  },
  {
    slug: "command",
    title: "Command",
    category: "behavioral",
    intent: "Encapsulate a request as an object (or function value), letting you parameterize clients, queue requests, and support undo operations.",
    goIdiomSummary: "A function value, or a struct with Execute(); queue/undo via a stack of commands.",
    relatedSlugs: ["chain-of-responsibility", "memento", "strategy"],
  },
  {
    slug: "iterator",
    title: "Iterator",
    category: "behavioral",
    intent: "Provide a way to access elements of a collection sequentially without exposing its underlying representation.",
    goIdiomSummary: "Go 1.23 range-over-func (iter.Seq[T]) as primary form; also channel-based and explicit iterator struct.",
    relatedSlugs: ["composite", "visitor"],
  },
  {
    slug: "mediator",
    title: "Mediator",
    category: "behavioral",
    intent: "Define an object that encapsulates how a set of objects interact, promoting loose coupling by keeping objects from referring to each other directly.",
    goIdiomSummary: "A coordinator struct that colleagues call instead of each other.",
    relatedSlugs: ["facade", "observer"],
  },
  {
    slug: "memento",
    title: "Memento",
    category: "behavioral",
    intent: "Capture and externalize an object's internal state so it can be restored later, without violating encapsulation.",
    goIdiomSummary: "Capture/restore via an opaque type with unexported fields; originator owns save/restore.",
    relatedSlugs: ["command", "prototype"],
  },
  {
    slug: "observer",
    title: "Observer",
    category: "behavioral",
    intent: "Define a one-to-many dependency between objects so that when one changes state, all dependents are notified automatically.",
    goIdiomSummary: "Subscriber interface slice or channels; cover unsubscribe and goroutine/lifecycle concerns.",
    relatedSlugs: ["mediator", "command"],
  },
  {
    slug: "state",
    title: "State",
    category: "behavioral",
    intent: "Let an object alter its behavior when its internal state changes, appearing to change its type.",
    goIdiomSummary: "A State interface; context holds current state and delegates, transitions return the next state.",
    relatedSlugs: ["strategy", "command"],
  },
  {
    slug: "strategy",
    title: "Strategy",
    category: "behavioral",
    intent: "Define a family of algorithms, encapsulate each one, and make them interchangeable at runtime.",
    goIdiomSummary: "A function type is the idiomatic form; show interface-based too and say when each fits.",
    relatedSlugs: ["bridge", "state", "template-method", "command"],
  },
  {
    slug: "template-method",
    title: "Template Method",
    category: "behavioral",
    intent: "Define the skeleton of an algorithm in a base operation, deferring some steps to subclasses — but in Go, use composition and injected hook functions instead.",
    goIdiomSummary: "Fights Go (no inheritance); implement via composition + injected hook funcs or an interface.",
    relatedSlugs: ["strategy", "factory-method"],
  },
  {
    slug: "visitor",
    title: "Visitor",
    category: "behavioral",
    intent: "Separate an algorithm from the object structure it operates on by using double dispatch.",
    goIdiomSummary: "Double dispatch via Accept(Visitor); be honest about verbosity and present type-switch as the Go alternative.",
    relatedSlugs: ["composite", "iterator"],
  },

  // ── Architectural ──
  {
    slug: "repository",
    title: "Repository",
    category: "architectural",
    intent: "Isolate domain logic from data persistence by defining an interface for storage operations and providing concrete implementations for each backend.",
    goIdiomSummary: "A small interface per aggregate (Save, FindByID, etc.); in-memory implementation for tests, sql.DB implementation for production.",
    relatedSlugs: ["hexagonal", "layered", "domain-driven-design", "clean-architecture"],
  },
  {
    slug: "layered",
    title: "Layered Architecture",
    category: "architectural",
    intent: "Organise code into horizontal layers — Handler, Service, Repository, Infrastructure — where each layer depends only on the layer below it.",
    goIdiomSummary: "Separate packages per layer; interfaces at each boundary so layers can be tested and swapped independently.",
    relatedSlugs: ["repository", "clean-architecture", "hexagonal"],
  },
  {
    slug: "clean-architecture",
    title: "Clean Architecture",
    category: "architectural",
    intent: "Structure code in concentric rings — Entities, Use Cases, Interface Adapters, Frameworks — enforcing a strict inward dependency rule so the domain never imports infrastructure.",
    goIdiomSummary: "Domain types and use-case interfaces in an inner package; HTTP handlers and DB adapters in outer packages that import inward, never the reverse.",
    relatedSlugs: ["hexagonal", "layered", "repository", "domain-driven-design"],
  },
  {
    slug: "hexagonal",
    title: "Hexagonal Architecture",
    category: "architectural",
    intent: "Place business logic at the centre, define ports (interfaces) for everything the application drives or is driven by, and provide adapters that connect the outside world to those ports.",
    goIdiomSummary: "Driving ports as use-case interfaces called by HTTP handlers; driven ports as repository and notifier interfaces implemented by DB and queue adapters.",
    relatedSlugs: ["clean-architecture", "layered", "repository"],
  },
  {
    slug: "domain-driven-design",
    title: "Domain-Driven Design",
    category: "architectural",
    intent: "Model software around the business domain using Entities, Value Objects, Aggregates, Repositories, and Domain Events, keeping the ubiquitous language consistent across code and conversation.",
    goIdiomSummary: "Structs for entities and value objects; aggregate roots as the only entry point for mutations; domain events as plain structs dispatched after state changes.",
    relatedSlugs: ["repository", "event-driven", "clean-architecture", "cqrs"],
  },
  {
    slug: "cqrs",
    title: "CQRS",
    category: "architectural",
    intent: "Separate the model used for writing state (Commands) from the model used for reading it (Queries), allowing each side to be optimised independently.",
    goIdiomSummary: "Command handler functions that accept a command struct and return an error; query functions that accept filter params and return read-model DTOs.",
    relatedSlugs: ["event-driven", "domain-driven-design", "repository"],
  },
  {
    slug: "event-driven",
    title: "Event-Driven Architecture",
    category: "architectural",
    intent: "Decouple services by having producers emit domain events and consumers react to them asynchronously, without either knowing about the other.",
    goIdiomSummary: "In-process: Go channels or a simple event bus struct. Cross-service: publish to Kafka/NATS/SQS; consumers implement an idempotent handler interface.",
    relatedSlugs: ["cqrs", "domain-driven-design", "observer"],
  },
  {
    slug: "circuit-breaker",
    title: "Circuit Breaker",
    category: "architectural",
    intent: "Prevent cascading failures by wrapping remote calls in a state machine that fails fast when a downstream service is unhealthy and probes for recovery.",
    goIdiomSummary: "A CircuitBreaker struct with Closed/Open/HalfOpen states; wraps any func() error call; uses sync/atomic or a mutex for thread-safe state transitions.",
    relatedSlugs: ["proxy", "decorator"],
  },
];

// Helpers
export function getPattern(slug) {
  return PATTERNS.find((p) => p.slug === slug);
}

export function getPatternByTitle(title) {
  const normalized = title.toLowerCase().trim();
  return PATTERNS.find((p) => p.title.toLowerCase() === normalized);
}

export function getPatternsByCategory(cat) {
  return PATTERNS.filter((p) => p.category === cat);
}

export function getCategory(slug) {
  return CATEGORIES[slug];
}

export function getPatternIndex(slug) {
  return PATTERNS.findIndex((p) => p.slug === slug);
}

export function getPrevPattern(slug) {
  const idx = getPatternIndex(slug);
  return idx > 0 ? PATTERNS[idx - 1] : null;
}

export function getNextPattern(slug) {
  const idx = getPatternIndex(slug);
  return idx < PATTERNS.length - 1 ? PATTERNS[idx + 1] : null;
}

// Full navigation order for prev/next across all Go content pages
export const NAV_ORDER = [
  { path: "/go", title: "Home" },
  { path: "/go/philosophy", title: "Philosophy" },
  { path: "/go/philosophy/solid", title: "SOLID Principles" },
  { path: "/go/philosophy/tdd", title: "Test-Driven Development" },
  { path: "/go/patterns/creational", title: "Creational Patterns" },
  ...getPatternsByCategory("creational").map((p) => ({
    path: `/go/patterns/creational/${p.slug}`,
    title: p.title,
  })),
  { path: "/go/patterns/structural", title: "Structural Patterns" },
  ...getPatternsByCategory("structural").map((p) => ({
    path: `/go/patterns/structural/${p.slug}`,
    title: p.title,
  })),
  { path: "/go/patterns/behavioral", title: "Behavioral Patterns" },
  ...getPatternsByCategory("behavioral").map((p) => ({
    path: `/go/patterns/behavioral/${p.slug}`,
    title: p.title,
  })),
  { path: "/go/patterns/architectural", title: "Architectural Patterns" },
  ...getPatternsByCategory("architectural").map((p) => ({
    path: `/go/patterns/architectural/${p.slug}`,
    title: p.title,
  })),
];

export function getNavNeighbors(currentPath) {
  const idx = NAV_ORDER.findIndex((n) => n.path === currentPath);
  return {
    prev: idx > 0 ? NAV_ORDER[idx - 1] : null,
    next: idx < NAV_ORDER.length - 1 ? NAV_ORDER[idx + 1] : null,
  };
}