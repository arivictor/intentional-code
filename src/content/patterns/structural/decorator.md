---
title: "Decorator"
category: structural
intent: "Attach additional behavior to an object dynamically by wrapping it in another object that implements the same interface."
goIdiomSummary: "Wrap an interface to add behavior; canonical Go example: http.Handler / RoundTripper middleware."
relatedSlugs: ["adapter", "composite", "proxy", "chain-of-responsibility"]
tags: [interfaces, closures, composition, testability]
---

# Decorator

Decorator wraps an object to add behavior, keeping the same interface. In Go, this pattern is everywhere — it's how HTTP middleware works. Any function that takes an interface and returns the same interface, adding behavior in between, is a decorator.

The canonical Go example is `http.Handler` middleware: a function that takes a handler, returns a new handler that logs, authenticates, compresses, or rate-limits, and then calls the original. It's the [Open/Closed Principle](/go/philosophy/solid) made concrete — each concern is added without touching the code it wraps.

## Problem

You have an HTTP handler that serves an API. You need to add logging. Then authentication. Then CORS headers. Then rate limiting. Each concern is independent, but you don't want to stuff all of them into one giant handler. And you want to compose them differently for different routes.

```go
// fat_handler.go
package api

import (
    "log"
    "net/http"
    "time"
)

func handleOrder(w http.ResponseWriter, r *http.Request) {
    // Authentication check (shouldn't be here)
    token := r.Header.Get("Authorization")
    if token == "" {
        http.Error(w, "unauthorized", 401)
        return
    }

    // Logging (shouldn't be here)
    start := time.Now()
    defer func() {
        log.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start))
    }()

    // CORS (shouldn't be here)
    w.Header().Set("Access-Control-Allow-Origin", "*")

    // Actual business logic — buried under cross-cutting concerns
    w.Write([]byte("order processed"))
}
```

Every cross-cutting concern is tangled into the handler. Want logging on another route? Copy-paste. Want auth on some routes but not others? Conditionals. This doesn't scale, and the business logic is obscured by plumbing.

## Solution

Each concern becomes a middleware function: it takes an `http.Handler`, returns a new `http.Handler` that adds one behavior, and calls the original. Stack them like function composition.

```
Request ──► Logging ──► Auth ──► CORS ──► Handler
               │           │        │         │
             wraps       wraps    wraps     actual
            handler     handler  handler   logic

Each layer: func(http.Handler) http.Handler
```

Each middleware is a function that wraps a handler:

```go
// middleware.go
package middleware

import (
    "log"
    "net/http"
    "time"
)

// Logging logs the method, path, and duration of each request.
func Logging(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        next.ServeHTTP(w, r)
        log.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start))
    })
}

// Auth rejects requests without an Authorization header.
func Auth(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.Header.Get("Authorization") == "" {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }
        next.ServeHTTP(w, r)
    })
}

// CORS adds permissive CORS headers.
func CORS(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "*")
        w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")
        next.ServeHTTP(w, r)
    })
}
```

Compose them in any combination:

```go
// main.go
package main

import (
    "middleware"
    "net/http"
)

func orderHandler(w http.ResponseWriter, r *http.Request) {
    w.Write([]byte("order processed"))
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
    w.Write([]byte("ok"))
}

func main() {
    // Orders: logging + auth + CORS
    orders := middleware.Logging(
        middleware.Auth(
            middleware.CORS(
                http.HandlerFunc(orderHandler),
            ),
        ),
    )

    // Health: logging only — no auth, no CORS
    health := middleware.Logging(http.HandlerFunc(healthHandler))

    http.Handle("/orders", orders)
    http.Handle("/health", health)
    http.ListenAndServe(":8080", nil)
}
```

Output:

```
GET /health 52µs
GET /orders 128µs
```

## When to Use

- You need to add behavior to objects without modifying their code.
- You want to compose behaviors independently — different combinations for different cases.
- The behavior is cross-cutting (logging, auth, caching, metrics) and shouldn't live in business logic.
- You see yourself wrapping an `http.Handler` — you're already using Decorator.

## When Not to Use

- The added behavior is tightly coupled to the object's internals. A decorator that needs private fields isn't a decorator — it's a refactoring need.
- Deep decorator stacks (5+ layers) make debugging difficult. Consider whether a [Chain of Responsibility](/go/patterns/behavioral/chain-of-responsibility) would be clearer.
- You only ever need one fixed combination. Direct composition in a single handler might be simpler.

## Advantages

- Each concern is isolated in its own function — Single Responsibility.
- Compose any combination at the call site without creating new types.
- Standard Go idiom for HTTP middleware — instantly recognizable.

## Disadvantages

- Deep wrapping can make stack traces harder to read.
- Order matters: `Logging(Auth(handler))` logs all requests; `Auth(Logging(handler))` only logs authenticated ones.
- Each wrapper adds a function call, though the overhead is negligible for HTTP handlers.

## Related Patterns

- **Adapter** — Adapter resolves an interface mismatch; Decorator keeps the same interface and adds behavior — if your wrapper changes the API, it's an Adapter; if it preserves the API and enriches it, it's a Decorator.
- **Composite** — Decorator wraps exactly one object and adds behavior; Composite aggregates many objects of the same type — if you wrap one, Decorator; if you compose many, Composite.
- **Proxy** — Proxy and Decorator are structurally identical in Go; the distinction is intent — Proxy controls or intercepts access (lazy init, auth, caching), Decorator adds new capabilities without restricting access.
- **Chain of Responsibility** — HTTP middleware chains are both Decorator and Chain of Responsibility: each middleware wraps the next (Decorator) and may short-circuit the chain without calling the inner handler (Chain of Responsibility).
