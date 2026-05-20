---
title: "Singleton"
category: creational
intent: "Ensure a type has only one instance and provide a global point of access to it."
idiomSummary: "Package-level value + sync.Once; then argue against it (testability) and show dependency injection."
relatedSlugs: ["factory-method", "builder"]
tags: [concurrency, state, testability, performance]
---

# Singleton

In most Go codebases, Singleton is an anti-pattern — not because the idea is wrong, but because global mutable state hides dependencies, makes tests unreliable, and forces every part of your application to use one specific concrete type that you can't swap out. The standard implementation using `sync.Once` initializes the value exactly once, safely across goroutines — and it's correct. Correct isn't the same as advisable.

The pattern has legitimate uses: hardware drivers, license managers, or immutable package-level values compiled at startup (a compiled regex, a frozen lookup table). For shared resources like loggers and HTTP clients, pass the instance through constructors and let `main()` enforce uniqueness.

## Problem

Your application needs a logger. Creating multiple loggers with different state (different output files, different prefixes) produces inconsistent output and wastes resources. You want exactly one logger shared across the entire application. The naive approach uses a global variable initialized at package load time — but package init order is fragile, and there's no way to configure the logger differently for tests.

```go
// log_global.go
package applog

import "log"

// Global state, initialized at import time.
// Problems:
// 1. Can't configure differently for tests
// 2. Package init order may not have config ready yet
// 3. Any package that imports applog writes to the real log file
// 4. No way to swap in a silent test logger
var Logger *log.Logger

func init() {
    Logger = log.New(openLogFile(), "[app] ", log.LstdFlags)
}
```

This global logger couples every consumer to a real log file. Tests produce noisy output and can't run without the file being writable. `init()` runs at import time, before your application has a chance to read configuration.

## Solution

The Go-idiomatic singleton uses `sync.Once` for thread-safe lazy initialization. Then we'll show why dependency injection is almost always better.

```
        sync.Once
            │
  ┌─────────▼──────────┐
  │  GetLogger()       │
  │  ┌───────────────┐ │
  │  │  once.Do(     │ │
  │  │    initLogger │ │
  │  │  )            │ │
  │  └───────────────┘ │
  │  return logger     │
  └────────────────────┘
            │
  First call: creates logger
  All others: returns same instance
```

The `sync.Once` singleton — correct but not recommended:

```go
// singleton.go
package applog

import (
    "io"
    "log"
    "sync"
)

var (
    logger *log.Logger
    once   sync.Once
)

// GetLogger returns the application-wide logger, initializing it on first call.
func GetLogger(out io.Writer) *log.Logger {
    once.Do(func() {
        logger = log.New(out, "[app] ", log.LstdFlags)
    })
    return logger
}
```

This works correctly — thread-safe, lazy, and the output writer is configurable on first call. But it's still global mutable state. Any test that calls `GetLogger` gets the same logger as production code, with no way to silence or redirect it.

The recommended alternative: dependency injection. Pass the logger as a parameter.

```go
// handler.go
package web

import (
    "fmt"
    "log"
)

// Handler depends on an injected logger, not a global.
type Handler struct {
    log *log.Logger
}

func NewHandler(log *log.Logger) *Handler {
    return &Handler{log: log}
}

func (h *Handler) ServeHTTP(path string) {
    h.log.Printf("request: %s", path)
    fmt.Println("ok")
}
```

Wire it up in main — the only place that knows about the real logger:

```go
// main.go
package main

import (
    "log"
    "os"
    "web"
)

func main() {
    logger := log.New(os.Stdout, "[app] ", log.LstdFlags)

    h := web.NewHandler(logger)
    h.ServeHTTP("/api/users")
}
```

In tests, pass `log.New(io.Discard, "", 0)` to silence the logger entirely — no global to reset, no test pollution.

## When to Use

- You genuinely need exactly one instance of something — a hardware driver, a license manager — and dependency injection is impractical.
- Package-level, immutable configuration (e.g., a compiled regex, a frozen lookup table) — these are fine as package-level vars, and `sync.Once` is the right initialization tool.

## When Not to Use

- The "single instance" is a logger, HTTP client, or service client. Use dependency injection instead — pass it through constructors. Your tests will thank you.
- You're using Singleton because "there should only be one." That's an application constraint, not a reason to bake it into the type. Let `main()` enforce uniqueness by creating one and passing it around.
- You need different instances in tests. Singleton makes this painful.

## Tradeoffs

`sync.Once` is genuinely correct — zero-cost after the first call, safe across goroutines, and no more fragile than a plain global var. The problem isn't the mechanism, it's what it produces: a hidden dependency. Any function that calls `GetLogger()` implicitly depends on the global, but that dependency doesn't show up in the function's signature, so callers can't see it, tests can't replace it, and linters can't enforce it. The moment you need two loggers — one for the app, one for a library — or a silent logger in tests, the global becomes a liability. `sync.Once` does have one subtle trap: the first caller configures the instance, and all subsequent callers get whatever the first call set up, even if they pass different arguments. If call order matters for configuration, that's a bug waiting to happen.

## Related Patterns

- **Factory Method** — A factory method can return the same cached instance on every call, giving Singleton-like behavior without a global variable; prefer this when the "one instance" constraint belongs to a specific use case, not to the type itself.
- **Builder** — A Builder configured once and stored in a regular variable achieves the same "one well-configured instance" goal without global state, and lets tests substitute a differently-configured instance without any contortion.
