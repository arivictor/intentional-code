---
title: Separation of Concerns
description: Each part of a system should address exactly one concern, and the boundaries between parts should be explicit.
---

# Separation of Concerns

*"Separation of concerns, even if not perfectly possible, is yet the only available technique for effective ordering of one's thoughts."* (Edsger Dijkstra, 1974)

A concern is a distinct responsibility: something a piece of software must do, know, or decide. Separation of Concerns (SoC) says those responsibilities should live in distinct places, with clear boundaries between them. When concerns are mixed, a change in one area ripples unpredictably into others.

SoC is closely related to the Single Responsibility Principle, but it operates at a higher level. SRP says a *type* should have one reason to change. SoC says an entire *layer or module* should address one domain of the problem. Both are expressions of the same underlying idea: isolate what changes together.

---

## The three-layer model

The most common application of SoC in web services is the three-layer architecture: delivery, business logic, and data access. Each layer speaks to one audience and knows nothing of the others' implementation.

```
HTTP handlers  →  domain services  →  storage layer
(delivery)        (business logic)     (persistence)
```

```go
// delivery/order_handler.go — HTTP concerns only.
// Knows about requests, responses, status codes.
// Knows nothing about how orders are validated or stored.

type OrderHandler struct {
    service OrderService
}

func (h *OrderHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req CreateOrderRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }
    order, err := h.service.PlaceOrder(r.Context(), req.UserID, req.Items)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(order)
}
```

```go
// domain/order_service.go — business rules only.
// Knows about validation, pricing, inventory.
// Knows nothing about HTTP or SQL.

type OrderService interface {
    PlaceOrder(ctx context.Context, userID string, items []Item) (Order, error)
}

type orderService struct {
    store    OrderStore
    inventory InventoryChecker
}

func (s *orderService) PlaceOrder(ctx context.Context, userID string, items []Item) (Order, error) {
    if len(items) == 0 {
        return Order{}, errors.New("order must contain at least one item")
    }
    for _, item := range items {
        if !s.inventory.InStock(ctx, item.SKU) {
            return Order{}, fmt.Errorf("item %s is out of stock", item.SKU)
        }
    }
    order := Order{ID: newID(), UserID: userID, Items: items}
    return order, s.store.Save(ctx, order)
}
```

```go
// store/order_store.go — persistence concerns only.
// Knows about SQL, transactions, connection pooling.
// Knows nothing about business rules or HTTP.

type OrderStore interface {
    Save(ctx context.Context, o Order) error
}

type postgresOrderStore struct {
    db *sql.DB
}

func (s *postgresOrderStore) Save(ctx context.Context, o Order) error {
    _, err := s.db.ExecContext(ctx, `
        INSERT INTO orders (id, user_id, total_cents, created_at)
        VALUES ($1, $2, $3, $4)
    `, o.ID, o.UserID, o.TotalCents(), time.Now())
    return fmt.Errorf("saving order: %w", err)
}
```

Each layer can change independently. Replace Postgres with a different database and the business logic and handlers don't move. Change a validation rule and the storage and HTTP layers don't move.

---

## Concern leakage: the violation

Concern leakage happens when one layer reaches into another's responsibilities.

```go
// BAD — the HTTP handler contains business logic and SQL.
// Three concerns in one place.

func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
    var req struct {
        UserID string  `json:"user_id"`
        Items  []Item  `json:"items"`
    }
    json.NewDecoder(r.Body).Decode(&req)

    // Business rule leaking into handler:
    if len(req.Items) == 0 {
        http.Error(w, "no items", 400)
        return
    }

    // SQL leaking into handler:
    total := 0
    for _, item := range req.Items {
        total += item.Price
    }
    h.db.Exec("INSERT INTO orders (user_id, total) VALUES (?, ?)", req.UserID, total)

    w.WriteHeader(201)
}
```

When the business rule changes (minimum order amount, discount logic, inventory check), you edit the handler. When the database schema changes, you edit the handler. The handler has three reasons to change, which violates both SoC and SRP.

---

## Package boundaries in Go

Go's package system is the natural mechanism for enforcing SoC. A package should represent a single concern. Packages that import each other in cycles are a signal that concerns have leaked; two packages become so entangled that neither can stand alone.

```
cmd/          — entry points, wires dependencies together
internal/
  handler/    — HTTP delivery
  domain/     — business rules and domain types
  store/      — persistence
  notify/     — notifications
```

The dependency graph should be a DAG. `handler` imports `domain`. `store` imports `domain`. `domain` imports nothing internal. `cmd` imports everything and wires it together.

> **Smell:** A handler function imports a SQL package directly. A business logic function constructs an HTTP response. A database struct has a method that sends an email. You need to mock the database to test a business rule.

See also: [Clean Architecture](/go/patterns/architectural/clean-architecture), [Hexagonal Architecture](/go/patterns/architectural/hexagonal), [Repository](/go/patterns/architectural/repository), [SOLID](/go/philosophy/solid).
