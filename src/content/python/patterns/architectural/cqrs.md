---
title: "CQRS"
category: architectural
intent: "Separate the model used for writing state (Commands) from the model used for reading it (Queries), allowing each side to be optimised independently."
idiomSummary: "Split read and write models when query and command concerns evolve at different speeds."
relatedSlugs: ["event-driven", "domain-driven-design", "repository"]
tags: [interfaces, dependency-inversion, distributed, events]
---

# CQRS

CQRS (Command Query Responsibility Segregation) separates every operation into one of two kinds: commands (mutate state, return nothing or an error) and queries (read state, return data, change nothing). The core insight is that read and write models want different shapes. Commands need rich domain validation, while queries usually want flat, denormalized views. Force one model to serve both jobs and you'll usually end up with either an anemic domain or bloated query results.

Each command and query gets its own handler type, its own input struct, and sometimes its own data store when the workloads diverge far enough.

## Problem

A single `OrderService` handles both writes and reads. The `GetOrder` method returns the full domain struct, which is expensive to load and exposes internal state. The `CreateOrder` method and `GetOrderSummary` method share the same repository, which means optimising the read path (adding a denormalised view) requires touching the write path too. Every new read shape requires a new method on the same service.

```python
# One service doing everything, reads and writes entangled
class OrderService:
    repo: OrderRepository

def create_order(self, ctx, customer_id, total):
    # mutates state

def get_order(self, ctx, id):
    # returns full domain object, expensive and exposes internals

def get_order_summary(self, ctx, id):
    # different read shape, now the service has two query methods with different return types
```

## Solution

Separate every operation into a command or a query. Commands mutate; queries read. Each has its own handler.

```
┌─────────────────────────────────────────────────────────┐
│                      Client                             │
└─────────┬──────────────────────────┬────────────────────┘
          │ Commands                 │ Queries
          ▼                          ▼
┌──────────────────┐      ┌───────────────────────────┐
│  Command Handler │      │      Query Handler         │
│  (mutate, err)   │      │  (read, return DTO)        │
└────────┬─────────┘      └────────────┬───────────────┘
         │                             │
         ▼                             ▼
┌──────────────────┐      ┌───────────────────────────┐
│   Write Store    │      │       Read Store           │
│  (normalised DB) │      │  (same DB or read replica, │
│                  │      │   denormalised views, etc.) │
└──────────────────┘      └───────────────────────────┘
```

Define commands and queries as plain structs:

```python
from typing import Protocol

# command/create_order.py


class CreateOrder:
    customer_id: string
    total: int64

class OrderRepository(Protocol):
    def save(self, ctx, o): ...

class CreateOrderHandler:
    repo: OrderRepository

def new_create_order_handler(repo):
    return &CreateOrderHandler{repo: repo

def handle(self, ctx, cmd):
    if cmd.CustomerID == "" :
        return fmt.Errorf("customer_id is required")
    o = Order{
    ID:         uuid.NewString()
    CustomerID: cmd.CustomerID
    Total:      cmd.Total
    Status:     StatusDraft
return h.repo.Save(ctx, o)
```

```python
# command/ship_order.py

"context"
"fmt"

class ShipOrder:
    order_id: string

class ShipOrderHandler:
    repo: OrderRepository

def new_ship_order_handler(repo):
    return &ShipOrderHandler{repo: repo

def handle(self, ctx, cmd):
    o, err := h.repo.FindByID(ctx, cmd.OrderID)
    if err is not None :
        return fmt.Errorf("finding order: %w", err)
    if err := o.Ship(); err is not None :
        return err
    return h.repo.Save(ctx, o)
```

Queries return purpose-built DTOs, not domain objects:

```python
from typing import Protocol

# query/get_order.py


# OrderView is a read-optimized projection, not the domain type.
class OrderView:
    id: string
    customer_name: string
    total: int64
    status: string
    item_count: int

class OrderSummary:
    id: string
    total: int64
    status: string

class OrderReadStore(Protocol):
    FindByID(ctx context.Context, id string) (*OrderView, error)
    ListByCustomer(ctx context.Context, customerID string) (list[OrderSummary, error)

class GetOrderHandler:
    store: OrderReadStore

def new_get_order_handler(store):
    return &GetOrderHandler{store: store

def handle(self, ctx, id):
    return h.store.FindByID(ctx, id)

class ListOrdersHandler:
    store: OrderReadStore

def handle(self, ctx, customer_id):
    return h.store.ListByCustomer(ctx, customerID)
```

The read store can be the same database (a view or query-optimised table) or a separate projection:

```python
# infra/postgres/order_read_store.py

"context"
"database/sql"
"myapp/query"

type OrderReadStore struct: db *sql.DB

def find_by_id(self, ctx, id):
    var v query.OrderView
    err = s.db.QueryRowContext(ctx, `
    SELECT o.id, c.name, o.total, o.status, COUNT(i.id)
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN order_items i ON i.order_id = o.id
    WHERE o.id = $1
    GROUP BY o.id, c.name, o.total, o.status
    `, id).Scan(&v.ID, &v.CustomerName, &v.Total, &v.Status, &v.ItemCount)
    return &v, err

def list_by_customer(self, ctx, customer_id):
    rows, err := s.db.QueryContext(ctx
    "SELECT id, total, status FROM orders WHERE customer_id = $1 ORDER BY created_at DESC"
    customerID
    if err is not None :
        return None, err
    defer rows.Close()
    var result list[query.OrderSummary
    for rows.Next() :
    var s query.OrderSummary
    rows.Scan(&s.ID, &s.Total, &s.Status)
    result = append(result, s)
return result, rows.Err()
```

Wire it up in the HTTP layer, where commands and queries have separate endpoints:

```python
# adapter/http/order_handler.py

"encoding/json"
"myapp/command"
"myapp/query"
"net/http"

class OrderHandler:
    create_order: command.CreateOrderHandler
    ship_order: command.ShipOrderHandler
    get_order: query.GetOrderHandler
    list_orders: query.ListOrdersHandler

def create(self, w, r):
    var req struct :
    CustomerID string `json:"customer_id"`
    Total      int64  `json:"total"`
json.NewDecoder(r.Body).Decode(&req)
if err := h.createOrder.Handle(r.Context(), command.CreateOrder:
    CustomerID: req.CustomerID
    Total:      req.Total
    ); err != None :
    http.Error(w, err.Error(), 422)
    return
w.WriteHeader(201)

def get(self, w, r):
    id = r.PathValue("id")
    view, err := h.getOrder.Handle(r.Context(), id)
    if err is not None :
        http.Error(w, err.Error(), 404)
        return
    json.NewEncoder(w).Encode(view)
```

## When to Use

- Read and write workloads have different performance profiles, and queries need denormalized views or aggregations that don't fit the write model.
- The domain is complex and the write side needs a rich model, but the read side only needs flat projections.
- You want to scale reads and writes independently (read replicas, caching layers).
- Different teams own the read path and the write path.

## When Not to Use

- Simple CRUD. CQRS adds two handler types, two store interfaces, and two data shapes where one would do.
- The read and write models are identical, so there are no distinct query shapes or read optimizations to justify the split.
- The team is small and the added structure costs more than it returns.

## Advantages

- Reads and writes evolve independently. You can add a new query shape without touching the write model.
- Query handlers return purpose-built DTOs, so you avoid accidentally exposing domain internals.
- Read stores can be aggressively optimized (materialized views, separate databases, caches) without affecting writes.
- Commands create a clean audit trail because each one is a named, typed intention.

## Disadvantages

- More types: each operation gets its own struct and handler. A ten-operation service becomes twenty files.
- Eventual consistency: if write and read stores diverge, queries may return stale data until the projection catches up.
- Overkill for simple domains. The overhead is real, and the payoff usually arrives only with scale or complexity.
- Testing both sides doubles the surface area for integration tests.

## Related Patterns

- **Event-Driven Architecture:** Commands naturally emit Domain Events that update read-side projections asynchronously. CQRS and event-driven systems fit together well, but CQRS does not require them. A single database with separate read and write models is enough to get started.
- **Domain-Driven Design:** Pairs naturally with DDD. The command side uses the rich aggregate model with enforced invariants, while the query side uses flat DTOs that bypass the domain model for read performance.
- **Hexagonal Architecture:** Command and query handlers are driving ports called by HTTP or queue adapters. Write and read stores are driven ports implemented by database adapters.
- **Clean Architecture:** Commands map to Use Cases in the inner ring, while queries can bypass the domain model and read directly from the store. The Dependency Rule still applies to both sides.
