export const GLOSSARY = [
  {
    term: "Interface Satisfaction",
    definition:
      "In Go, a type satisfies an interface implicitly — there is no `implements` keyword. If a type has the methods an interface requires, it satisfies it. This is structural (duck) typing and is fundamental to how Go achieves polymorphism without inheritance.",
  },
  {
    term: "Composition",
    definition:
      "Building complex types by combining simpler ones via struct fields or embedding, rather than through inheritance hierarchies. Go has no inheritance; composition is the only mechanism for code reuse between types.",
  },
  {
    term: "Embedding",
    definition:
      "A Go mechanism where a struct includes another type without a field name, promoting the embedded type's methods to the outer struct. It looks like inheritance but is forwarding — the embedded type has no reference to the outer struct.",
  },
  {
    term: "Accept Interfaces, Return Structs",
    definition:
      "A Go proverb meaning functions should accept interface parameters (for flexibility) but return concrete struct types (for clarity and to avoid premature abstraction). This keeps APIs honest and testable.",
  },
  {
    term: "Constructor Function",
    definition:
      "A Go convention: a package-level function named `NewX(...)` that creates and returns a value of type `X`. Go has no constructors, so this is the idiomatic replacement. Often returns an interface type for factory patterns.",
  },
  {
    term: "Functional Options",
    definition:
      "A pattern where a constructor accepts a variadic list of `func(*Config)` values, each setting one option. Introduced by Dave Cheney and Rob Pike, it avoids long parameter lists and config struct sprawl while keeping the API extensible.",
  },
  {
    term: "Double Dispatch",
    definition:
      "A technique where the operation performed depends on the runtime types of two objects — the element and the visitor. In Go, this is achieved via an `Accept(Visitor)` method that calls back the correct `Visit` method on the visitor.",
  },
  {
    term: "sync.Once",
    definition:
      "A standard library primitive that ensures a function is executed exactly once, even across goroutines. Used idiomatically for lazy initialization and is the correct building block for singleton-like patterns in Go.",
  },
  {
    term: "iter.Seq / Range-over-func",
    definition:
      "Introduced in Go 1.23, `iter.Seq[T]` is a function type `func(yield func(T) bool)` that can be used in a `for range` loop. It is the idiomatic way to implement iterators in modern Go, replacing channel-based or explicit-struct iterators.",
  },
  {
    term: "http.Handler",
    definition:
      "The `net/http.Handler` interface has a single method `ServeHTTP(ResponseWriter, *Request)`. It is Go's canonical example of the Decorator and Chain of Responsibility patterns: middleware wraps handlers to add logging, auth, CORS, etc.",
  },
  {
    term: "Middleware",
    definition:
      "A function that takes an `http.Handler` and returns a new `http.Handler`, wrapping the original with additional behavior. This is the Decorator pattern applied to HTTP, and is pervasive in Go web development.",
  },
  {
    term: "Type Switch",
    definition:
      "Go's `switch v := x.(type)` construct dispatches on the dynamic type of an interface value. It is often the pragmatic Go alternative to the Visitor pattern, trading extensibility (open/closed principle) for simplicity.",
  },
  {
    term: "Dependency Injection",
    definition:
      "Passing dependencies (as interface values) to a struct or function rather than having it create or find them internally. In Go, this typically means accepting interfaces in constructors. It is the recommended alternative to singletons for testability.",
  },
  {
    term: "Table-Driven Tests",
    definition:
      "A Go testing idiom where test cases are defined as a slice of structs, each with inputs and expected outputs, and iterated with `t.Run`. This produces clear, extensible tests with minimal boilerplate.",
  },
  {
    term: "sync.Pool",
    definition:
      "A standard library type for caching allocated objects for reuse, reducing GC pressure. It is related to but different from the Flyweight pattern: Pool recycles mutable temporaries, while Flyweight shares immutable state.",
  },
  {
    term: "First-Class Functions",
    definition:
      "In Go, functions are values that can be assigned to variables, passed as arguments, and returned from other functions. This makes many behavioral patterns (Strategy, Command, Template Method hooks) simpler than their class-based OOP equivalents.",
  },
  {
    term: "Goroutine",
    definition:
      "A lightweight concurrent execution unit managed by the Go runtime. Goroutines are relevant to patterns like Observer (notification fan-out), Mediator (coordination), and Command (async execution).",
  },
  {
    term: "Channel",
    definition:
      "A typed conduit for sending and receiving values between goroutines. Channels can implement Observer (pub/sub), Iterator (sequence streaming), and Command (work queues) patterns, though they add concurrency complexity.",
  },
];