---
title: "Proxy"
category: structural
intent: "Provide a surrogate or placeholder for another object to control access, add lazy initialization, logging, or caching."
idiomSummary: "Intercept access with an object that validates, caches, delays, or protects the real target."
relatedSlugs: ["adapter", "decorator"]
tags: [interfaces, state, performance, testability, concurrency]
---

# Proxy

Proxy wraps an object with the same interface to control access to it. The wrapper can add lazy initialization, access control, logging, caching, or remote communication — all without the client knowing it's not talking to the real object.

In Python, Proxy and Decorator look structurally identical (both wrap an interface). The distinction is intent: Decorator adds new behavior; Proxy controls access to existing behavior.

## Problem

You have a database query service that's expensive to initialize and you don't always need it. Some callers also need access control — only admins should be able to run certain queries. You want to delay initialization until the first actual call and enforce permissions, but you don't want to change the service's interface or litter every call site with auth checks.

```python
# eager.py
import sqlite3


class QueryService:
    def __init__(self, dsn: str) -> None:
        # Connects to the database immediately — slow, may fail,
        # and wastes a connection if no queries are ever made.
        self._conn = sqlite3.connect(dsn)

    def execute(self, query: str) -> list[tuple]:
        return self._conn.execute(query).fetchall()
```

The service eagerly connects to the database. If the handler path doesn't always need queries, this wastes a connection. And there's no access control — any caller can execute any query.

## Solution

Create a proxy that implements the same interface. It lazily initializes the real service on first use and checks permissions before delegating.

```
┌────────────────────────┐
│    <<Protocol>>        │
│    QueryRunner         │
│────────────────────────│
│ execute(q) -> [tuple]  │
└────────────┬───────────┘
             │ implements
     ┌───────┼───────┐
     │               │
┌────▼────────┐ ┌────▼──────────┐
│QueryService │ │  QueryProxy   │
│ (real)      │ │ (proxy)       │
│             │ │ - lazy init   │
│ execute()   │ │ - access ctrl │
└─────────────┘ │ execute()     │
                └───────────────┘
```

```python
# proxy.py
from __future__ import annotations

import threading
from typing import Protocol


class QueryRunner(Protocol):
    """Interface implemented by both the real service and the proxy."""
    def execute(self, query: str) -> list[tuple]: ...


class RealQueryService:
    """The expensive real implementation."""

    def __init__(self, dsn: str) -> None:
        import sqlite3
        print("[db] Connecting to database...")
        self._conn = sqlite3.connect(dsn)

    def execute(self, query: str) -> list[tuple]:
        print(f"[db] Executing: {query}")
        return self._conn.execute(query).fetchall()


class QueryProxy:
    """Adds lazy initialization and role-based access control."""

    def __init__(self, dsn: str, role: str) -> None:
        self._dsn = dsn
        self._role = role
        self._real: RealQueryService | None = None
        self._lock = threading.Lock()

    def _get_real(self) -> RealQueryService:
        if self._real is None:
            with self._lock:
                if self._real is None:  # double-checked locking
                    print("[proxy] Initializing database connection...")
                    self._real = RealQueryService(self._dsn)
        return self._real

    def execute(self, query: str) -> list[tuple]:
        if self._role != "admin":
            raise PermissionError(
                f"access denied: role {self._role!r} cannot execute queries"
            )
        print(f"[proxy] role={self._role} query={query}")
        return self._get_real().execute(query)
```

```python
# main.py
from proxy import QueryProxy


def run_query(runner: "QueryRunner", query: str) -> None:
    try:
        rows = runner.execute(query)
        print(f"Results: {rows}\n")
    except PermissionError as exc:
        print(f"Error: {exc}\n")


def main() -> None:
    admin = QueryProxy(dsn=":memory:", role="admin")
    viewer = QueryProxy(dsn=":memory:", role="viewer")

    run_query(admin, "SELECT 1")
    run_query(admin, "SELECT 2")
    run_query(viewer, "SELECT * FROM secrets")
```

Output:

```
[proxy] role=admin query=SELECT 1
[proxy] Initializing database connection...
[db] Connecting to database...
[db] Executing: SELECT 1
Results: [(1,)]

[proxy] role=admin query=SELECT 2
[db] Executing: SELECT 2
Results: [(2,)]

Error: access denied: role 'viewer' cannot execute queries
```

## When to Use

- You need lazy initialization — the real object is expensive to create and may not be needed.
- You need access control — check permissions before delegating to the real object.
- You need logging or caching around an interface without modifying the implementation.
- You want a local representative for a remote object.

## When Not to Use

- The real object is cheap to create. Lazy initialization adds complexity without benefit.
- Access control belongs at a higher level (middleware, gateway) rather than at the object level.
- You're adding behavior without restricting access — that's [Decorator](/python/patterns/structural/decorator), not Proxy.

## Advantages

- Controls access without changing the real object or its clients.
- Lazy initialization defers costly work until it's actually needed.
- `threading.Lock` with double-checked locking keeps initialization thread-safe with minimal contention after the first call.

## Disadvantages

- Adds indirection — harder to trace which implementation is actually running.
- The proxy must stay in sync with the real interface — if methods are added, the proxy must be updated.
- Lazy initialization can surprise callers if the first call takes unexpectedly long.

## Related Patterns

- **Adapter** — Adapter provides a different interface to bridge a mismatch; Proxy preserves the same interface — if your wrapper changes the API, it's an Adapter; if it intercepts calls through the same API, it's a Proxy.
- **Decorator** — Proxy and Decorator are structurally identical in Python; the distinction is purpose — Proxy controls or intercepts access (lazy init, auth, caching), Decorator adds new capabilities while allowing unrestricted access to the original object.
