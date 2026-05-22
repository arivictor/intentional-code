---
title: Functional Programming Principles
description: Pure functions, immutability, and composability, and how these ideas make Go code more predictable and testable.
---

# Functional Programming Principles

Go is not a functional language. It has mutable state, imperative loops, and no algebraic types. But many ideas from functional programming translate directly and improve Go code: pure functions are easier to test, immutable data prevents whole categories of bugs, and higher-order functions enable flexible composition without inheritance.

You don't adopt FP as a religion. You adopt the ideas that pay off.

---

## Pure functions: no hidden inputs, no hidden outputs

A pure function's output depends only on its inputs. It has no side effects: it doesn't modify shared state, doesn't perform I/O, doesn't depend on globals or time. Given the same inputs, it always returns the same outputs.

Pure functions are easy to test (no setup, no mocking), easy to reason about (no hidden state), and safe to call in any order or concurrently.

```go
// IMPURE — depends on external state, result varies with time.
func isExpiredSession(s Session) bool {
    return time.Now().After(s.ExpiresAt) // hidden input: time.Now()
}

// PURE — expiry is a parameter. The function is deterministic.
// In tests, pass any time you like.
func isExpiredAt(s Session, now time.Time) bool {
    return now.After(s.ExpiresAt)
}
```

```go
// IMPURE — modifies a shared map, not safe to call concurrently.
var cache = map[string]int{}

func getCached(key string) int {
    if v, ok := cache[key]; ok {
        return v
    }
    v := computeExpensive(key)
    cache[key] = v // side effect
    return v
}

// PURE — takes the cache as input, returns the new cache as output.
// Caller decides how to store state.
func getCachedPure(cache map[string]int, key string) (int, map[string]int) {
    if v, ok := cache[key]; ok {
        return v, cache
    }
    v := computeExpensive(key)
    next := make(map[string]int, len(cache)+1)
    for k, val := range cache {
        next[k] = val
    }
    next[key] = v
    return v, next
}
```

---

## Immutability: data that doesn't change doesn't surprise you

Mutable shared state is the source of most concurrency bugs. When multiple goroutines can modify the same data, you need synchronization everywhere you access it. Immutable data needs no synchronization at all.

In Go, full immutability isn't enforced by the compiler (there's no `const` struct), but you can design for it:

```go
// Mutable — callers can modify Config after construction.
type Config struct {
    Host string
    Port int
    TLS  bool
}

// Immutable by convention — use a constructor that copies inputs,
// expose only read methods, never expose the underlying fields.
type Config struct {
    host string
    port int
    tls  bool
}

func NewConfig(host string, port int, tls bool) Config {
    return Config{host: host, port: port, tls: tls}
}

func (c Config) Host() string { return c.host }
func (c Config) Port() int    { return c.port }
func (c Config) TLS() bool    { return c.tls }

// Modifications return a new Config, leaving the original unchanged.
func (c Config) WithHost(host string) Config {
    c.host = host
    return c
}
```

This pattern (value types that return modified copies) avoids shared mutable state entirely. It's safe to pass `Config` values between goroutines without a mutex.

---

## Higher-order functions: behaviour as a parameter

First-class functions let you pass behaviour as a value. This is the basis of the [Strategy](/go/patterns/behavioral/strategy) pattern and many other compositional designs.

```go
// A pipeline that applies transformations in sequence.
type StringTransform func(string) string

func Apply(s string, transforms ...StringTransform) string {
    for _, t := range transforms {
        s = t(s)
    }
    return s
}

result := Apply("  Hello, World!  ",
    strings.TrimSpace,
    strings.ToLower,
    func(s string) string { return strings.ReplaceAll(s, ",", "") },
)
// "hello world!"
```

```go
// Filter and Map — functional staples that work naturally in Go.

func Filter[T any](slice []T, keep func(T) bool) []T {
    out := make([]T, 0, len(slice))
    for _, v := range slice {
        if keep(v) {
            out = append(out, v)
        }
    }
    return out
}

func Map[T, U any](slice []T, transform func(T) U) []U {
    out := make([]U, len(slice))
    for i, v := range slice {
        out[i] = transform(v)
    }
    return out
}

// Usage — no mutable accumulator, no index arithmetic.
activeUsers := Filter(users, func(u User) bool { return u.Active })
emails := Map(activeUsers, func(u User) string { return u.Email })
```

---

## Functional options: clean constructors without overloading

The functional options pattern uses higher-order functions to build flexible constructors. It's a common Go idiom that avoids both large config structs and function overloading.

```go
type Server struct {
    host    string
    port    int
    timeout time.Duration
}

type Option func(*Server)

func WithHost(host string) Option {
    return func(s *Server) { s.host = host }
}

func WithPort(port int) Option {
    return func(s *Server) { s.port = port }
}

func WithTimeout(d time.Duration) Option {
    return func(s *Server) { s.timeout = d }
}

func NewServer(opts ...Option) *Server {
    s := &Server{host: "localhost", port: 8080, timeout: 30 * time.Second}
    for _, opt := range opts {
        opt(s)
    }
    return s
}

// Callers set only what they need; defaults apply to the rest.
srv := NewServer(
    WithPort(9090),
    WithTimeout(5 * time.Second),
)
```

---

## Where to draw the line

Taken too far, functional style in Go produces awkward code. Avoid:

- Folding straightforward loops into recursive functions (Go has no tail-call optimisation)
- Chaining function calls to the point where the call stack becomes the control flow
- Avoiding all state; some state is inherent to the problem, and immutability is a tool, not a doctrine

Use the ideas that make code clearer. Ignore the ones that don't.

> **Smell:** A function returns different results when called twice with the same arguments. A struct method modifies a field that another goroutine reads without a lock. You need to set up global state before calling a function in a test.

See also: [Strategy](/go/patterns/behavioral/strategy), [Composition over Inheritance](/go/philosophy/composition-over-inheritance), [TDD](/go/philosophy/tdd).
