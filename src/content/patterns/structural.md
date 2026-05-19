# Structural Patterns

The question structural patterns answer: **how should these types fit together?**

Structural patterns are about composition — wrapping, extending, or combining existing types without modifying them. In Go, where embedding and implicit interfaces make composition the primary tool, these patterns appear in idiomatic code constantly, often without the names.

**Start with [Adapter](/go/patterns/structural/adapter)** when you have a type that doesn't quite satisfy an interface you need. Any wrapper struct that makes one package's type compatible with another's interface is an Adapter — it's one of the most common patterns in Go codebases.

**[Decorator](/go/patterns/structural/decorator)** is for adding behaviour to an existing type without changing it. Go middleware (HTTP, gRPC, database) is Decorator. Any function that takes an interface and returns the same interface, adding logging, metrics, or retry logic, is a Decorator.

**[Proxy](/go/patterns/structural/proxy)** looks similar to Decorator but has a different intent: it controls *access* rather than adding behaviour. Lazy initialization, access control, and connection pooling are all Proxy territory. The distinction is subtle in Go code — both wrap an interface — but matters for design intent.

**[Facade](/go/patterns/structural/facade)** simplifies a complex subsystem behind a single entry point. If you have orchestration code that is duplicated across callers, that code belongs in a Facade. The `http.ListenAndServe` function is a textbook Facade over `net.Listener`, `http.Server`, and `TLS` configuration.

**[Composite](/go/patterns/structural/composite)** is for tree structures where leaves and branches must be treated the same way. Filesystem paths, UI component trees, and expression trees are natural Composite territory.

**[Bridge](/go/patterns/structural/bridge)** separates an abstraction from its implementation so both can vary independently. It's the right choice when a type hierarchy is growing in two independent directions at once.

**[Flyweight](/go/patterns/structural/flyweight)** is a targeted memory optimisation: when you have large numbers of similar objects, share the immutable parts and keep only the unique parts per instance. It's situational — reach for it when profiling points to memory as the bottleneck.

---

Most structural patterns are expressions of the [SOLID Principles](/go/philosophy/solid) Open/Closed and Dependency Inversion principles: add behaviour without modifying existing types, and depend on interfaces rather than concrete implementations.
