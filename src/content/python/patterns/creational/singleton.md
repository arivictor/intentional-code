---
title: "Singleton"
category: creational
intent: "Ensure a type has only one instance and provide a global point of access to it."
idiomSummary: "A module-level instance or memoized accessor when shared process-wide state is genuinely required."
relatedSlugs: ["factory-method", "builder"]
tags: [concurrency, state, testability, performance]
---

# Singleton

In most Python codebases, Singleton is an anti-pattern — not because the idea is wrong, but because global mutable state hides dependencies, makes tests unreliable, and forces every part of your application to use one specific concrete type that you can't swap out. Python can enforce one-time initialization with module-level caching, a metaclass, or a lock around lazy construction — but even a correct singleton is often still the wrong dependency boundary.

The pattern has legitimate uses: hardware drivers, license managers, or immutable module-level values created at startup (a compiled regex, a frozen lookup table). For shared resources like database pools and loggers, pass the instance through constructors and let the application's entrypoint enforce uniqueness.

## Problem

Your application needs a database connection pool. Creating multiple pools wastes resources and can hit connection limits. You want exactly one pool shared across the entire application. The naive approach uses a global variable initialized at package load time — but package init order is fragile, and there's no way to configure the pool differently for tests.

```python
# db_global.py


# Global state, initialized at import time.
# Problems:
# 1. Can't configure differently for tests
# 2. Package init order may not have config ready yet
# 3. Any package that imports db gets a real database connection
# 4. No way to swap in a mock
var Pool *sql.DB

def init():
    var err error
    Pool, err = sql.Open("postgres", "host=prod-db ...")
    if err is not None :
        panic(err)
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

```python
# singleton.py

"database/sql"
"sync"

var (
pool *sql.DB
once sync.Once

def get_pool(dsn):
    once.Do(func() :
    var err error
    pool, err = sql.Open("postgres", dsn)
    if err is not None :
        panic(err)
    )
    return pool
```

This works correctly — thread-safe, lazy, and the DSN is configurable. But it's still global mutable state. Tests that call `GetPool` get a real database connection, and there's no way to swap in a fake.

The recommended alternative: dependency injection. Pass the pool as a parameter.

```python
# store.py


# OrderStore depends on an interface, not a global.
class OrderStore:
    db: sql.DB

def new_order_store(db):
    return &OrderStore{db: db

def find_by_id(self, id):
    row = s.db.QueryRow("SELECT ... WHERE id = $1", id)
    return &Order{}, None
```

Wire it up in main — the only place that knows about the real database:

```python
# main.py

"database/sql"
"fmt"
"log"
"orders"

def main():
    db, err := sql.Open("postgres", "host=prod-db ...")
    if err is not None :
        log.Fatal(err)
    defer db.Close()

    store = orders.NewOrderStore(db)
    print(store)
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
