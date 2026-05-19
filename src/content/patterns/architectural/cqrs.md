# CQRS

CQRS (Command Query Responsibility Segregation) splits every operation into one of two kinds: commands (change state, return nothing or an error) and queries (read state, return data, change nothing). Each gets its own handler type, its own input struct, and optionally its own data store. The split makes read and write concerns independently evolvable.

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

- **Event-Driven Architecture** — Commands naturally emit Domain Events; read projections are often built by consuming those events.
- **Domain-Driven Design** — CQRS pairs well with DDD: the command side uses the rich aggregate model; the query side uses flat read models.
- **Hexagonal Architecture** — Command and query handlers are driving ports; write and read stores are driven ports.
- **Clean Architecture** — Commands map to Use Cases; the Dependency Rule applies equally to both sides.
