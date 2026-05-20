---
title: "Builder"
category: creational
intent: "Construct complex objects step by step, separating construction from representation so the same process can create different results."
goIdiomSummary: "Prefer the functional options pattern (func WithTimeout(d) Option); also show classic chained builder."
relatedSlugs: ["factory-method", "abstract-factory"]
---

# Builder

Long parameter lists cause two problems: callers must fill every position even for optional fields, and zero values become ambiguous (`maxConns=0` could mean "unlimited" or "no connections"). In Go, the functional options pattern solves both — a variadic list of option functions lets callers specify only what they need, defaults are centralized in the constructor, and adding new options never breaks existing call sites.

The classic chained builder also works in Go and is preferable when construction has a meaningful order or when you want to reuse a partially configured builder across multiple similar objects.

## Problem

You're building an HTTP server with many optional configuration parameters: timeouts, TLS, middleware, max connections, logging. A constructor with twelve parameters is unreadable. A config struct helps, but requires the caller to know which zero values are meaningful and which mean "use default."

```go
// server_naive.go
package server

import "time"

// Twelve parameters. Which ones are required? What are the defaults?
// Zero value of time.Duration is 0 — does that mean "no timeout" or "instant timeout"?
func NewServer(
    addr string,
    readTimeout time.Duration,
    writeTimeout time.Duration,
    idleTimeout time.Duration,
    maxConns int,
    tlsCert string,
    tlsKey string,
    enableLogging bool,
    logLevel string,
    enableMetrics bool,
    metricsAddr string,
    shutdownTimeout time.Duration,
) *Server {
    // ...
}

// Calling this is painful and error-prone:
// s := NewServer(":8080", 5*time.Second, 10*time.Second, 30*time.Second,
//     100, "", "", true, "info", false, "", 5*time.Second)
```

The caller has to remember the position of twelve arguments. Zero values are ambiguous — is `maxConns=0` "unlimited" or "no connections"? Adding a new option means changing every call site.

## Solution

The functional options pattern solves this elegantly. Define an `Option` type as a function that modifies a config. The constructor accepts a variadic list of options. Defaults are set inside the constructor, and only the options you care about are passed.

```
┌──────────────────────────────────┐
│          NewServer(addr,         │
│            ...Option)            │
│──────────────────────────────────│
│  1. Set defaults in config      │
│  2. Apply each Option func      │
│  3. Build and return *Server    │
└──────────────────────────────────┘

Option = func(*config)

WithReadTimeout(d) ──► func(c *config) { c.readTimeout = d }
WithMaxConns(n)    ──► func(c *config) { c.maxConns = n }
WithTLS(cert, key) ──► func(c *config) { c.tls = ... }
```

Define the internal config and the `Option` type:

```go
// options.go
package server

import "time"

type config struct {
    readTimeout  time.Duration
    writeTimeout time.Duration
    idleTimeout  time.Duration
    maxConns     int
    tlsCert      string
    tlsKey       string
    enableLog    bool
    logLevel     string
}

// Option configures a Server.
type Option func(*config)
```

Each option is a simple function returning an `Option`:

```go
// options.go
package server

import "time"

func WithReadTimeout(d time.Duration) Option {
    return func(c *config) { c.readTimeout = d }
}

func WithWriteTimeout(d time.Duration) Option {
    return func(c *config) { c.writeTimeout = d }
}

func WithMaxConns(n int) Option {
    return func(c *config) { c.maxConns = n }
}

func WithTLS(cert, key string) Option {
    return func(c *config) {
        c.tlsCert = cert
        c.tlsKey = key
    }
}

func WithLogging(level string) Option {
    return func(c *config) {
        c.enableLog = true
        c.logLevel = level
    }
}
```

The constructor sets sensible defaults, then applies options:

```go
// server.go
package server

import (
    "fmt"
    "time"
)

type Server struct {
    Addr string
    cfg  config
}

func NewServer(addr string, opts ...Option) *Server {
    cfg := config{
        readTimeout:  5 * time.Second,
        writeTimeout: 10 * time.Second,
        idleTimeout:  120 * time.Second,
        maxConns:     1000,
        logLevel:     "info",
    }
    for _, opt := range opts {
        opt(&cfg)
    }
    return &Server{Addr: addr, cfg: cfg}
}

func (s *Server) String() string {
    return fmt.Sprintf("Server{addr=%s, read=%v, write=%v, maxConns=%d, tls=%v, log=%s}",
        s.Addr, s.cfg.readTimeout, s.cfg.writeTimeout,
        s.cfg.maxConns, s.cfg.tlsCert != "", s.cfg.logLevel)
}
```

Clean, readable call sites:

```go
// main.go
package main

import (
    "fmt"
    "server"
    "time"
)

func main() {
    // Minimal — all defaults
    s1 := server.NewServer(":8080")
    fmt.Println(s1)

    // Custom — only the options you care about
    s2 := server.NewServer(":443",
        server.WithTLS("cert.pem", "key.pem"),
        server.WithReadTimeout(30*time.Second),
        server.WithMaxConns(5000),
        server.WithLogging("debug"),
    )
    fmt.Println(s2)
}
```

Output:

```
Server{addr=:8080, read=5s, write=10s, maxConns=1000, tls=false, log=info}
Server{addr=:443, read=30s, write=10s, maxConns=5000, tls=true, log=debug}
```

## When to Use

- A constructor needs more than 3–4 optional parameters.
- You want sensible defaults with the ability to override any subset.
- The API needs to be extensible — adding options shouldn't break existing callers.
- Configuration is provided at construction time and doesn't change afterward.

## When Not to Use

- The object has only a few required fields and no optional ones. A plain `NewX(a, b)` is simpler.
- Construction has a meaningful sequence of steps that must be followed in order — use a chained builder or a step-interface builder instead.
- You need to reuse a partially configured builder to stamp out similar objects — the functional options pattern creates a new config each time.

## Advantages

- Clean call sites — only specify what you need.
- Adding new options is backward compatible — no existing callers change.
- Defaults are explicit and centralized in one place.
- Options are composable — you can build "preset" option bundles.

## Disadvantages

- The pattern requires writing one function per option, which adds boilerplate.
- Option validation happens at runtime, not compile time. An invalid combination won't be caught until the constructor runs.
- For very simple types, the pattern is over-engineering.

## Related Patterns

- **Factory Method** — Use Factory Method when the choice of *which type* to create is the core decision; use Builder when you need fine-grained control over *how* one specific type is constructed with many optional parameters.
- **Abstract Factory** — Use Abstract Factory when you need a consistent family of related objects created together; use Builder when you need one complex object configured precisely, with defaults and overrides.
