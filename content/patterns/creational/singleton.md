---
title: "Singleton"
description: "Ensure a type has only one instance and provide a global point of access to it."
---

# Singleton

**Buys one guaranteed shared instance; pays in hidden global dependencies, untestable swaps, and first-caller-wins configuration — in most Go code, prefer dependency injection.**

The Singleton pattern guarantees a type has exactly one instance and gives the whole program access to it. Go's standard implementation is `sync.Once` guarding a package-level variable — and in most Go code, it's the wrong tool. Global mutable state hides dependencies from function signatures, makes tests share state they can't reset, and welds every caller to one concrete type. For loggers, HTTP clients, and service clients, pass the instance through constructors and let `main()` enforce uniqueness; the constraint belongs to the application, not the type. The legitimate exceptions are narrow: hardware drivers, licence managers, and immutable package-level values like a compiled regex, where `sync.Once` is exactly right.

## Scenario

Your application needs a logger. Creating multiple loggers with different state (different output files, different prefixes) produces inconsistent output and wastes resources. You want exactly one logger shared across the entire application. The naive approach uses a global variable initialised at package load time, but package init order is fragile, and there's no way to configure the logger differently for tests.

```go
// log_global.go
package applog

import "log"

// Global state, initialised at import time.
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

The Go-idiomatic singleton uses `sync.Once` for thread-safe lazy initialisation. Then we'll show why dependency injection is almost always better.

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

The `sync.Once` singleton: correct but not recommended. Run it to see the same logger instance returned on every call.

```go:title="sync-once.go":run=true:editable=true
package main

import (
	"io"
	"log"
	"os"
	"sync"
)

var (
	logger *log.Logger
	once   sync.Once
)

func GetLogger(out io.Writer) *log.Logger {
	once.Do(func() {
		logger = log.New(out, "[app] ", log.LstdFlags)
	})
	return logger
}

func main() {
	l := GetLogger(os.Stdout)
	l.Println("server started")
	l.Println("request received")
}
```

This works correctly: thread-safe, lazy, and the output writer is configurable on first call. But it's still global mutable state. Any test that calls `GetLogger` gets the same logger as production code, with no way to silence or redirect it.

The recommended alternative is dependency injection. Pass the logger as a parameter, and run the example to see the handler log through the injected logger.

```go:title="injection.go":run=true:editable=true
package main

import (
	"fmt"
	"log"
	"os"
)

type Logger interface {
	Printf(format string, v ...any)
}

type Handler struct {
	log Logger
}

func NewHandler(log Logger) *Handler {
	return &Handler{log: log}
}

func (h *Handler) ServeHTTP(path string) {
	h.log.Printf("request: %s", path)
	fmt.Println("ok")
}

func main() {
	logger := log.New(os.Stdout, "[app] ", log.LstdFlags)

	h := NewHandler(logger)
	h.ServeHTTP("/api/users")
}
```

In tests, pass `log.New(io.Discard, "", 0)` to silence the logger entirely: no global to reset, no test pollution.

## When to Use

- You genuinely need exactly one instance of something (a hardware driver, a licence manager) and dependency injection is impractical.
- Package-level, immutable configuration (a compiled regex, a frozen lookup table): these are fine as package-level vars, and `sync.Once` is the right initialisation tool.

## When Not to Use

- The "single instance" is a logger, HTTP client, or service client. Use dependency injection instead and pass it through constructors. Your tests will thank you.
- You're using Singleton because "there should only be one." That's an application constraint, not a reason to bake it into the type. Let `main()` enforce uniqueness by creating one and passing it around.
- You need different instances in tests. Singleton makes this painful.

## The Decision

`sync.Once` is genuinely correct: zero-cost after the first call, safe across goroutines, and no more fragile than a plain global var. The problem isn't the mechanism; it's what it produces. Any function that calls `GetLogger()` implicitly depends on the global, but that dependency doesn't show up in the function's signature, so callers can't see it, tests can't replace it, and linters can't enforce it. The moment you need two loggers (one for the app, one for a library) or a silent logger in tests, the global becomes a liability.

`sync.Once` does have one subtle trap: the first caller configures the instance, and all subsequent callers get whatever the first call set up, even if they pass different arguments. If call order matters for configuration, that's a bug waiting to happen.

You've already used a Go singleton with exactly these foot-guns: `http.DefaultClient` is a package-level shared instance with no timeout by default, and any code that reassigns or mutates it changes behaviour for every caller in the process.

This is [tenet #2 — name the trade-off](/philosophy/name-the-trade-off) in practice. The global isn't free; it's a dependency you took on without writing it into a single function signature. If you can't say out loud what the global buys you over an injected parameter, you didn't decide to use it — you defaulted into it.

## Related Patterns

- **Factory Method**: A factory method can return the same cached instance on every call, giving Singleton-like behaviour without a global variable; prefer this when the "one instance" constraint belongs to a specific use case, not to the type itself.
- **Builder**: A Builder configured once and stored in a regular variable achieves the same "one well-configured instance" goal without global state, and lets tests substitute a differently-configured instance without any contortion.
