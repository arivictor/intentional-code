---
title: "Singleton"
category: creational
intent: "Ensure a type has only one instance and provide a global point of access to it."
idiomSummary: "A module-level instance or memoized accessor when shared process-wide state is genuinely required."
relatedSlugs: ["factory-method", "builder"]
tags: [concurrency, state, testability, performance]
---

# Singleton

In most Python codebases, Singleton is an anti-pattern — not because the idea is wrong, but because global mutable state hides dependencies, makes tests unreliable, and forces every part of your application to use one specific concrete type that you can't swap out. Python can enforce one-time initialization with module-level caching, a metaclass, or a `threading.Lock` around lazy construction — but even a correct singleton is often still the wrong dependency boundary.

The pattern has legitimate uses: hardware drivers, license managers, or immutable module-level values created at startup (a compiled regex, a frozen lookup table). For shared resources like database pools and loggers, pass the instance through constructors and let the application's entrypoint enforce uniqueness.

## Problem

Your application needs a database connection pool. Creating multiple pools wastes resources and can hit connection limits. You want exactly one pool shared across the entire application. The naive approach uses a global variable initialized at import time — but import order is fragile, and there's no way to configure the pool differently for tests.

```python
# db_global.py
import sqlite3

# Global state, initialized at import time.
# Problems:
# 1. Can't configure differently for tests
# 2. Import order may not have config ready yet
# 3. Any module that imports db gets a real database connection
# 4. No way to swap in a fake
_connection: sqlite3.Connection = sqlite3.connect("file:prod.db?mode=ro", uri=True)


def get_connection() -> sqlite3.Connection:
    return _connection
```

This global connection couples every consumer to a real database. Tests can't run without the production file. The path is hardcoded. And the connection is created at import time, before your application has a chance to read configuration or set up test fixtures.

## Solution

The Python-idiomatic singleton uses `threading.Lock` for thread-safe lazy initialization. Then we'll show why dependency injection is almost always better.

```
        threading.Lock
            │
  ┌─────────▼──────────┐
  │  get_pool()        │
  │  ┌───────────────┐ │
  │  │  if _pool is  │ │
  │  │  None: lock + │ │
  │  │  init         │ │
  │  └───────────────┘ │
  │  return _pool      │
  └────────────────────┘
            │
  First call: creates pool
  All others: returns same instance
```

The thread-safe lazy singleton — correct but not always recommended:

```python
# pool.py
from __future__ import annotations

import sqlite3
import threading

_pool: sqlite3.Connection | None = None
_lock = threading.Lock()


def get_pool(dsn: str = "prod.db") -> sqlite3.Connection:
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:  # double-checked locking
                _pool = sqlite3.connect(dsn, check_same_thread=False)
    return _pool
```

This works correctly — thread-safe, lazy, and the DSN is configurable on first call. But it's still global mutable state. Tests that call `get_pool()` get a real database connection, and there's no way to swap in a fake without patching the module.

The recommended alternative: dependency injection. Pass the connection as a parameter.

```python
# store.py
import sqlite3
from dataclasses import dataclass
from typing import Protocol


class OrderStore:
    """Depends on an injected connection, not a global."""

    def __init__(self, db: sqlite3.Connection) -> None:
        self._db = db

    def find_by_id(self, order_id: str) -> dict:
        row = self._db.execute(
            "SELECT id, status FROM orders WHERE id = ?", (order_id,)
        ).fetchone()
        if row is None:
            raise KeyError(f"Order {order_id!r} not found")
        return {"id": row[0], "status": row[1]}
```

Wire it up in `main.py` — the only place that knows about the real database:

```python
# main.py
import sqlite3
from store import OrderStore


def main() -> None:
    db = sqlite3.connect("prod.db")
    store = OrderStore(db)
    order = store.find_by_id("o-123")
    print(order)
```

## When to Use

- You genuinely need exactly one instance of something — a hardware driver, a license manager — and dependency injection is impractical.
- Package-level, immutable values (e.g., a compiled regex, a frozen lookup table) — these are fine as module-level variables, and lazy initialization with a `threading.Lock` is the right tool.

## When Not to Use

- The "single instance" is a database pool, logger, or service client. Use dependency injection instead — pass it through constructors. Your tests will thank you.
- You're using Singleton because "there should only be one." That's an application constraint, not a reason to bake it into the type. Let `main()` enforce uniqueness by creating one and passing it around.
- You need different instances in tests. Singleton makes this painful.

## Advantages

- Guarantees exactly one instance — useful for resource-constrained objects.
- `threading.Lock` with double-checked locking is straightforward and correct.
- Lazy initialization defers costly setup until actually needed.

## Disadvantages

- Creates hidden global state that makes code harder to reason about.
- Extremely difficult to test — you can't swap in a fake without `unittest.mock.patch` or module-level surgery.
- Violates the Dependency Inversion Principle — consumers depend on a concrete global, not an injected abstraction.
- Mutation of the singleton's internal state requires additional synchronization.

## Related Patterns

- **Factory Method** — A factory method can return the same cached instance on every call, giving Singleton-like behaviour without a global variable; prefer this when the "one instance" constraint belongs to a specific use case, not to the type itself.
- **Builder** — A Builder configured once and stored in a regular variable achieves the same "one well-configured instance" goal without global state, and lets tests substitute a differently-configured instance without any contortion.
