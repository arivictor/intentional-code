---
title: "Singleton"
category: creational
intent: "Ensure a type has only one instance and provide a global point of access to it."
goIdiomSummary: "Package-level value + sync.Once; then argue against it (testability) and show dependency injection."
relatedSlugs: ["factory-method", "builder"]
---

# Singleton

In most Go codebases, Singleton is an anti-pattern — not because the idea is wrong, but because global mutable state hides dependencies, breaks test isolation, and ties every consumer to a concrete type instead of an injected interface. The idiomatic implementation (`sync.Once` for thread-safe lazy initialization) is correct; correctness doesn't mean you should use it.

The pattern has legitimate uses: hardware drivers, license managers, or immutable package-level values compiled at startup (a compiled regex, a frozen lookup table). For shared resources like database pools and loggers, pass the instance through constructors and let `main()` enforce uniqueness.

## Problem

Your application needs a database connection pool. Creating multiple pools wastes resources and can hit connection limits. You want exactly one pool shared across the entire application. The naive approach uses a global variable initialized at package load time — but package init order is fragile, and there's no way to configure the pool differently for tests.

```go
// db_global.go
package db

import "database/sql"

// Global state, initialized at import time.
// Problems:
// 1. Can't configure differently for tests
// 2. Package init order may not have config ready yet
// 3. Any package that imports db gets a real database connection
// 4. No way to swap in a mock
var Pool *sql.DB

func init() {
    var err error
    Pool, err = sql.Open("postgres", "host=prod-db ...")
    if err != nil {
        panic(err)
    }
}
```

This global pool couples every consumer to a real database. Tests can't run without a PostgreSQL server. The DSN is hardcoded. And `init()` runs at import time, before your application has a chance to read configuration or set up test fixtures.

## Solution

The Go-idiomatic singleton uses `sync.Once` for thread-safe lazy initialization. Then we'll show why dependency injection is almost always better.

```
        sync.Once
            │
  ┌─────────▼──────────┐
  │  GetPool()         │
  │  ┌───────────────┐ │
  │  │  once.Do(     │ │
  │  │    initPool   │ │
  │  │  )            │ │
  │  └───────────────┘ │
  │  return pool       │
  └────────────────────┘
            │
  First call: creates pool
  All others: returns same instance
```

The `sync.Once` singleton — correct but not recommended:

```go
// singleton.go
package db

import (
    "database/sql"
    "sync"
)

var (
    pool *sql.DB
    once sync.Once
)

func GetPool(dsn string) *sql.DB {
    once.Do(func() {
        var err error
        pool, err = sql.Open("postgres", dsn)
        if err != nil {
            panic(err)
        }
    })
    return pool
}
```

This works correctly — thread-safe, lazy, and the DSN is configurable. But it's still global mutable state. Tests that call `GetPool` get a real database connection, and there's no way to swap in a fake.

The recommended alternative: dependency injection. Pass the pool as a parameter.

```go
// store.go
package orders

import "database/sql"

// OrderStore depends on an interface, not a global.
type OrderStore struct {
    db *sql.DB
}

func NewOrderStore(db *sql.DB) *OrderStore {
    return &OrderStore{db: db}
}

func (s *OrderStore) FindByID(id string) (*Order, error) {
    row := s.db.QueryRow("SELECT ... WHERE id = $1", id)
    return &Order{}, nil
}
```

Wire it up in main — the only place that knows about the real database:

```go
// main.go
package main

import (
    "database/sql"
    "fmt"
    "log"
    "orders"
)

func main() {
    db, err := sql.Open("postgres", "host=prod-db ...")
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    store := orders.NewOrderStore(db)
    fmt.Println(store)
}
```

## When to Use

- You genuinely need exactly one instance of something — a hardware driver, a license manager — and dependency injection is impractical.
- Package-level, immutable configuration (e.g., a compiled regex, a frozen lookup table) — these are fine as package-level vars, and `sync.Once` is the right initialization tool.

## When Not to Use

- The "single instance" is a database pool, logger, or service client. Use dependency injection instead — pass it through constructors. Your tests will thank you.
- You're using Singleton because "there should only be one." That's an application constraint, not a reason to bake it into the type. Let `main()` enforce uniqueness by creating one and passing it around.
- You need different instances in tests. Singleton makes this painful.

## Advantages

- Guarantees exactly one instance — useful for resource-constrained objects.
- `sync.Once` is simple, correct, and has zero contention after initialization.
- Lazy initialization defers costly setup until actually needed.

## Disadvantages

- Creates hidden global state that makes code harder to reason about.
- Extremely difficult to test — you can't swap in a fake without build tags or interface wrappers.
- Violates the Dependency Inversion Principle — consumers depend on a concrete global, not an injected interface.
- Concurrency bugs if you mutate the singleton's state without additional synchronization.

## Related Patterns

- **Factory Method** — A factory method can return the same cached instance on every call, giving Singleton-like behavior without a global variable; prefer this when the "one instance" constraint belongs to a specific use case, not to the type itself.
- **Builder** — A Builder configured once and stored in a regular variable achieves the same "one well-configured instance" goal without global state, and lets tests substitute a differently-configured instance without any contortion.
