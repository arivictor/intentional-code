---
title: "CQRS"
category: architectural
intent: "Separate the model used for writing state (Commands) from the model used for reading it (Queries), allowing each side to be optimised independently."
goIdiomSummary: "Command handler functions that accept a command struct and return an error; query functions that accept filter params and return read-model DTOs."
relatedSlugs: ["event-driven", "domain-driven-design", "repository"]
tags: [interfaces, dependency-inversion, distributed, events]
---

# CQRS

CQRS (Command Query Responsibility Segregation) separates every operation into one of two kinds: commands (mutate state, return nothing or an error) and queries (read state, return data, change nothing). The core insight: read and write models are different shapes. Commands need rich domain validation; queries need flat, denormalised views. Forcing one model to serve both purposes means either an anemic domain or bloated query results.

Each command and query gets its own handler type, its own input struct, and — when workloads diverge enough — its own data store.

## Problem

A single `OrderService` handles both writes and reads. The `GetOrder` method returns the full domain struct, which is expensive to load and exposes internal state. The `CreateOrder` method and `GetOrderSummary` method share the same repository, which means optimising the read path (adding a denormalised view) requires touching the write path too. Every new read shape requires a new method on the same service.

```go
// One service doing everything — reads and writes entangled
type OrderService struct {
    repo OrderRepository
}

func (s *OrderService) CreateOrder(ctx context.Context, customerID string, total int64) error {
    // mutates state
}

func (s *OrderService) GetOrder(ctx context.Context, id string) (*Order, error) {
    // returns full domain object — expensive, exposes internals
}

func (s *OrderService) GetOrderSummary(ctx context.Context, id string) (*OrderSummary, error) {
    // different read shape — now the service has two query methods with different return types
}
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

```go
// command/create_order.go
package command

import "context"

type CreateOrder struct {
    CustomerID string
    Total      int64
}

type OrderRepository interface {
    Save(ctx context.Context, o *Order) error
}

type CreateOrderHandler struct {
    repo OrderRepository
}

func NewCreateOrderHandler(repo OrderRepository) *CreateOrderHandler {
    return &CreateOrderHandler{repo: repo}
}

func (h *CreateOrderHandler) Handle(ctx context.Context, cmd CreateOrder) error {
    if cmd.CustomerID == "" {
        return fmt.Errorf("customer_id is required")
    }
    o := &Order{
        ID:         uuid.NewString(),
        CustomerID: cmd.CustomerID,
        Total:      cmd.Total,
        Status:     StatusDraft,
    }
    return h.repo.Save(ctx, o)
}
```

```go
// command/ship_order.go
package command

import (
    "context"
    "fmt"
)

type ShipOrder struct {
    OrderID string
}

type ShipOrderHandler struct {
    repo OrderRepository
}

func NewShipOrderHandler(repo OrderRepository) *ShipOrderHandler {
    return &ShipOrderHandler{repo: repo}
}

func (h *ShipOrderHandler) Handle(ctx context.Context, cmd ShipOrder) error {
    o, err := h.repo.FindByID(ctx, cmd.OrderID)
    if err != nil {
        return fmt.Errorf("finding order: %w", err)
    }
    if err := o.Ship(); err != nil {
        return err
    }
    return h.repo.Save(ctx, o)
}
```

Queries return purpose-built DTOs — not domain objects:

```go
// query/get_order.go
package query

import "context"

// OrderView is a read-optimised projection — not the domain type.
type OrderView struct {
    ID           string
    CustomerName string
    Total        int64
    Status       string
    ItemCount    int
}

type OrderSummary struct {
    ID     string
    Total  int64
    Status string
}

type OrderReadStore interface {
    FindByID(ctx context.Context, id string) (*OrderView, error)
    ListByCustomer(ctx context.Context, customerID string) ([]OrderSummary, error)
}

type GetOrderHandler struct {
    store OrderReadStore
}

func NewGetOrderHandler(store OrderReadStore) *GetOrderHandler {
    return &GetOrderHandler{store: store}
}

func (h *GetOrderHandler) Handle(ctx context.Context, id string) (*OrderView, error) {
    return h.store.FindByID(ctx, id)
}

type ListOrdersHandler struct {
    store OrderReadStore
}

func (h *ListOrdersHandler) Handle(ctx context.Context, customerID string) ([]OrderSummary, error) {
    return h.store.ListByCustomer(ctx, customerID)
}
```

The read store can be the same database (a view or query-optimised table) or a separate projection:

```go
// infra/postgres/order_read_store.go
package postgres

import (
    "context"
    "database/sql"
    "myapp/query"
)

type OrderReadStore struct{ db *sql.DB }

func (s *OrderReadStore) FindByID(ctx context.Context, id string) (*query.OrderView, error) {
    var v query.OrderView
    err := s.db.QueryRowContext(ctx, `
        SELECT o.id, c.name, o.total, o.status, COUNT(i.id)
        FROM orders o
        JOIN customers c ON c.id = o.customer_id
        LEFT JOIN order_items i ON i.order_id = o.id
        WHERE o.id = $1
        GROUP BY o.id, c.name, o.total, o.status
    `, id).Scan(&v.ID, &v.CustomerName, &v.Total, &v.Status, &v.ItemCount)
    return &v, err
}

func (s *OrderReadStore) ListByCustomer(ctx context.Context, customerID string) ([]query.OrderSummary, error) {
    rows, err := s.db.QueryContext(ctx,
        "SELECT id, total, status FROM orders WHERE customer_id = $1 ORDER BY created_at DESC",
        customerID,
    )
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    var result []query.OrderSummary
    for rows.Next() {
        var s query.OrderSummary
        rows.Scan(&s.ID, &s.Total, &s.Status)
        result = append(result, s)
    }
    return result, rows.Err()
}
```

Wire up in the HTTP layer — commands and queries have separate endpoints:

```go
// adapter/http/order_handler.go
package httpadapter

import (
    "encoding/json"
    "myapp/command"
    "myapp/query"
    "net/http"
)

type OrderHandler struct {
    createOrder *command.CreateOrderHandler
    shipOrder   *command.ShipOrderHandler
    getOrder    *query.GetOrderHandler
    listOrders  *query.ListOrdersHandler
}

func (h *OrderHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req struct {
        CustomerID string `json:"customer_id"`
        Total      int64  `json:"total"`
    }
    json.NewDecoder(r.Body).Decode(&req)
    if err := h.createOrder.Handle(r.Context(), command.CreateOrder{
        CustomerID: req.CustomerID,
        Total:      req.Total,
    }); err != nil {
        http.Error(w, err.Error(), 422)
        return
    }
    w.WriteHeader(201)
}

func (h *OrderHandler) Get(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    view, err := h.getOrder.Handle(r.Context(), id)
    if err != nil {
        http.Error(w, err.Error(), 404)
        return
    }
    json.NewEncoder(w).Encode(view)
}
```

## When to Use

- Read and write workloads have different performance profiles — queries need denormalised views or aggregations that don't fit the write model.
- The domain is complex and the write side needs a rich model, but the read side only needs flat projections.
- You want to scale reads and writes independently (read replicas, caching layers).
- Different teams own the read path and the write path.

## When Not to Use

- Simple CRUD. CQRS adds two handler types, two store interfaces, and two data shapes where one would do.
- The read and write models are identical — no distinct query shapes or read optimisations needed.
- The team is small and the added structure costs more than it returns.

## Advantages

- Reads and writes evolve independently — add a new query shape without touching the write model.
- Query handlers return purpose-built DTOs — no accidental exposure of domain internals.
- Read stores can be aggressively optimised (materialised views, separate databases, caches) without affecting writes.
- Commands are a clean audit trail — each is a named, typed intention.

## Disadvantages

- More types: each operation gets its own struct and handler. A ten-operation service becomes twenty files.
- Eventual consistency: if write and read stores diverge, queries may return stale data until the projection catches up.
- Overkill for simple domains — the overhead is real and the payoff only arrives at scale or complexity.
- Testing both sides doubles the surface area for integration tests.

## Related Patterns

- **Event-Driven Architecture** — Commands naturally emit Domain Events that update read-side projections asynchronously; CQRS and event-driven systems compose well, but CQRS does not require them — a single database with separate read and write models is enough to start.
- **Domain-Driven Design** — Pairs naturally with DDD: the command side uses the rich aggregate model with enforced invariants; the query side uses flat DTOs that bypass the domain model entirely for read performance.
- **Hexagonal Architecture** — Command and query handlers are driving ports called by HTTP or queue adapters; write and read stores are driven ports implemented by database adapters.
- **Clean Architecture** — Commands map to Use Cases in the inner ring; queries can bypass the domain model and read directly from the store — the Dependency Rule applies to both sides.
