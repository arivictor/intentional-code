---
title: "Repository"
category: architectural
intent: "Isolate domain logic from data persistence by defining an interface for storage operations and providing concrete implementations for each backend."
idiomSummary: "Hide persistence details behind an interface that speaks in domain concepts."
relatedSlugs: ["hexagonal", "layered", "domain-driven-design", "clean-architecture"]
tags: [interfaces, dependency-inversion, testability]
---

# Repository

The most immediate sign you need Repository is a service function that takes a `sqlite3.Connection` or `Session` as a parameter. That signature tells you something uncomfortable: you can't test this business rule without a running database. Repository replaces the concrete dependency with a protocol defined in the domain package. Python's structural typing means the domain never imports the infrastructure module, and any class with the right methods becomes a valid backend — including the in-memory fake that keeps unit tests fast.

This is the [Dependency Inversion Principle](/python/philosophy/solid) applied to persistence: the domain defines what it needs, and infrastructure satisfies it, not the other way around.

## Problem

Your order-processing logic is scattered with direct database calls. Every function that needs an order calls `sqlite3` directly. Tests require a live database. Switching to a different store means hunting through business logic.

```python
# orders.py
import sqlite3


def ship_order(db: sqlite3.Connection, order_id: str) -> None:
    row = db.execute(
        "SELECT status FROM orders WHERE id = ?", (order_id,)
    ).fetchone()
    if row is None:
        raise KeyError(f"Order {order_id!r} not found")
    status = row[0]
    if status != "paid":
        raise ValueError(f"Order {order_id} is not paid (status={status!r})")
    db.execute(
        "UPDATE orders SET status = 'shipped' WHERE id = ?", (order_id,)
    )
    db.commit()
```

The business rule (`status must be "paid"`) is entangled with SQL. There is no way to test `ship_order` without a real database.

## Solution

Define a repository protocol in the domain package. Business logic depends on that protocol. Infrastructure packages implement it.

```
Domain package
  ├── Order (entity)
  └── OrderRepository (Protocol)
          │ implemented by
          ▼
  SqliteOrderRepo   ← talks to sqlite3.Connection
  InMemoryOrderRepo ← holds a dict, used in tests
```

Define the domain types and the protocol together:

```python
# domain/orders/order.py
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Protocol


class Status(str, Enum):
    PAID = "paid"
    SHIPPED = "shipped"


@dataclass
class Order:
    id: str
    status: Status

    def ship(self) -> None:
        if self.status != Status.PAID:
            raise ValueError(
                f"Order {self.id} cannot be shipped: status is {self.status!r}"
            )
        self.status = Status.SHIPPED


# Repository is the persistence contract the domain requires.
class OrderRepository(Protocol):
    def find_by_id(self, order_id: str) -> Order: ...
    def save(self, order: Order) -> None: ...
```

The service depends only on the protocol:

```python
# domain/orders/service.py
from .order import Order, OrderRepository


class OrderService:
    def __init__(self, repo: OrderRepository) -> None:
        self._repo = repo

    def ship_order(self, order_id: str) -> None:
        order = self._repo.find_by_id(order_id)
        order.ship()  # raises ValueError if not paid
        self._repo.save(order)
```

The SQLite implementation lives in the infrastructure layer:

```python
# infra/sqlite/order_repo.py
import sqlite3
from domain.orders.order import Order, Status


class SqliteOrderRepo:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def find_by_id(self, order_id: str) -> Order:
        row = self._conn.execute(
            "SELECT id, status FROM orders WHERE id = ?", (order_id,)
        ).fetchone()
        if row is None:
            raise KeyError(f"Order {order_id!r} not found")
        return Order(id=row[0], status=Status(row[1]))

    def save(self, order: Order) -> None:
        self._conn.execute(
            "UPDATE orders SET status = ? WHERE id = ?",
            (order.status.value, order.id),
        )
        self._conn.commit()
```

An in-memory implementation makes unit tests fast and infrastructure-free:

```python
# infra/memory/order_repo.py
from domain.orders.order import Order


class InMemoryOrderRepo:
    def __init__(self, seed: list[Order] | None = None) -> None:
        self._orders: dict[str, Order] = {o.id: o for o in (seed or [])}

    def find_by_id(self, order_id: str) -> Order:
        if order_id not in self._orders:
            raise KeyError(f"Order {order_id!r} not found")
        return self._orders[order_id]

    def save(self, order: Order) -> None:
        self._orders[order.id] = order
```

```python
# tests/test_order_service.py
import pytest
from domain.orders.order import Order, Status
from domain.orders.service import OrderService
from infra.memory.order_repo import InMemoryOrderRepo


def test_ship_order() -> None:
    repo = InMemoryOrderRepo(seed=[Order(id="o1", status=Status.PAID)])
    svc = OrderService(repo)

    svc.ship_order("o1")

    assert repo.find_by_id("o1").status == Status.SHIPPED


def test_ship_unpaid_order_raises() -> None:
    repo = InMemoryOrderRepo(seed=[Order(id="o2", status=Status.SHIPPED)])
    svc = OrderService(repo)

    with pytest.raises(ValueError, match="cannot be shipped"):
        svc.ship_order("o2")
```

## When to Use

- Your domain logic needs to be tested without a real database.
- You want the flexibility to change your persistence layer without touching business logic.
- Multiple storage backends are needed (e.g., SQLite for production, in-memory for tests, Redis for caching).
- You're following Layered, Clean, or Hexagonal Architecture and need a defined persistence boundary.

## When Not to Use

- Simple CRUD applications where there is no domain logic to protect. A direct `sqlite3` or ORM call is cleaner.
- The application is a thin data service. Adding a repository protocol just to have one adds ceremony without value.
- Your query needs are so varied (complex filters, reporting) that a single protocol becomes a leaky abstraction. In that case, a query builder or direct SQL for reads is usually cleaner.

## Advantages

- Domain logic is testable with no infrastructure required.
- Storage backends are swappable — move from SQLite to PostgreSQL or an in-memory dict without touching business code.
- The protocol documents exactly what persistence operations the domain actually needs.
- Follows the Dependency Inversion Principle. The domain defines the contract, and infrastructure satisfies it.

## Disadvantages

- Adds a layer of indirection. For simple applications this is boilerplate with no payoff.
- One protocol per aggregate can lead to many small interfaces that are tedious to keep in sync.
- Complex read requirements often leak through the protocol (pagination, filtering, sorting) making it hard to keep the interface small and stable.
- In-memory implementations must be kept in sync with the real implementation, or tests give false confidence.

## Related Patterns

- **Hexagonal Architecture:** Repository is the canonical example of a driven port. The application defines the protocol, and an adapter implements it. Use Repository anywhere you need a persistence port, and Hexagonal as the larger structure that tells you where each piece lives.
- **Layered Architecture:** Repository sits at the Service-to-Infrastructure boundary. In a strictly layered codebase, it is the main tool for keeping business logic database-agnostic. If you are not doing full Hexagonal or Clean Architecture, Layered plus Repository is often enough.
- **Domain-Driven Design:** Repositories are a first-class DDD tactical pattern with one repository per aggregate root. DDD adds the constraint that a repository should load and save complete aggregates, not partial state.
- **Clean Architecture:** Repository protocols belong in the Use Case (inner) ring, while implementations belong in the outermost Frameworks and Drivers ring. The Dependency Rule means the domain references only the protocol, never the implementation.
