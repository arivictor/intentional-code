# Clean Architecture

Clean Architecture organises code in concentric rings — Entities, Use Cases, Interface Adapters, Frameworks & Drivers — with one strict rule: source-code dependencies may only point inward. The innermost rings know nothing about HTTP, databases, or frameworks. Everything outside serves the domain.

## Problem

You're three years into a project. Switching from PostgreSQL to CockroachDB requires touching service logic. Adding a gRPC endpoint means duplicating validation that lives in the HTTP handler. Your domain types import `database/sql`. The framework is load-bearing — you can't reason about the business logic without understanding the infrastructure.

```go
// Typical symptom: domain types coupled to infrastructure
package orders

import (
    "database/sql"       // domain importing infrastructure
    "net/http"           // domain importing HTTP
    "encoding/json"
)

type Order struct {
    ID string `json:"id" db:"id"`   // JSON and DB tags on domain type
}

func CreateOrder(db *sql.DB, w http.ResponseWriter, r *http.Request) {
    // HTTP, DB, and domain logic all in one place
}
```

## Solution

Enforce the Dependency Rule: source code in an inner ring never names, imports, or knows about anything in an outer ring.

```
┌───────────────────────────────────────────┐
│          Frameworks & Drivers             │  HTTP handlers, sql.DB,
│     (outermost — nothing imports this)    │  SMTP clients, CLI
│  ┌─────────────────────────────────────┐  │
│  │       Interface Adapters            │  │  Controllers, Presenters,
│  │  (converts between rings)           │  │  Repository implementations
│  │  ┌───────────────────────────────┐  │  │
│  │  │        Use Cases              │  │  │  Application business rules
│  │  │  (application logic)          │  │  │  orchestrate entities
│  │  │  ┌─────────────────────────┐  │  │  │
│  │  │  │       Entities          │  │  │  │  Enterprise business rules
│  │  │  │  (domain types & rules) │  │  │  │  — pure Go, zero imports
│  │  │  └─────────────────────────┘  │  │  │
│  │  └───────────────────────────────┘  │  │
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
            ← dependencies point inward
```

**Entities** — pure domain types, no imports beyond the standard library:

```go
// domain/order.go
package domain

import (
    "fmt"
    "time"

    "github.com/google/uuid"
)

type OrderStatus string

const (
    StatusDraft    OrderStatus = "draft"
    StatusPlaced   OrderStatus = "placed"
    StatusShipped  OrderStatus = "shipped"
)

type Order struct {
    ID         string
    CustomerID string
    Total      int64
    Status     OrderStatus
    PlacedAt   time.Time
}

func NewOrder(customerID string, total int64) (*Order, error) {
    if customerID == "" {
        return nil, fmt.Errorf("customer_id is required")
    }
    if total <= 0 {
        return nil, fmt.Errorf("total must be positive")
    }
    return &Order{
        ID:         uuid.NewString(),
        CustomerID: customerID,
        Total:      total,
        Status:     StatusDraft,
    }, nil
}

func (o *Order) Place() error {
    if o.Status != StatusDraft {
        return fmt.Errorf("only draft orders can be placed")
    }
    o.Status = StatusPlaced
    o.PlacedAt = time.Now()
    return nil
}
```

**Use Cases** — define interfaces for everything they need; implement nothing:

```go
// usecase/place_order.go
package usecase

import (
    "context"
    "fmt"
    "myapp/domain"
)

// Ports — defined by the use case, implemented by outer rings.
type OrderRepository interface {
    Save(ctx context.Context, o *domain.Order) error
}

type PaymentGateway interface {
    Charge(ctx context.Context, customerID string, amount int64) error
}

type PlaceOrderInput struct {
    CustomerID string
    Total      int64
}

type PlaceOrderOutput struct {
    OrderID string
}

type PlaceOrderUseCase struct {
    orders  OrderRepository
    payment PaymentGateway
}

func NewPlaceOrderUseCase(orders OrderRepository, payment PaymentGateway) *PlaceOrderUseCase {
    return &PlaceOrderUseCase{orders: orders, payment: payment}
}

func (uc *PlaceOrderUseCase) Execute(ctx context.Context, in PlaceOrderInput) (PlaceOrderOutput, error) {
    order, err := domain.NewOrder(in.CustomerID, in.Total)
    if err != nil {
        return PlaceOrderOutput{}, err
    }
    if err := uc.payment.Charge(ctx, order.CustomerID, order.Total); err != nil {
        return PlaceOrderOutput{}, fmt.Errorf("payment failed: %w", err)
    }
    if err := order.Place(); err != nil {
        return PlaceOrderOutput{}, err
    }
    if err := uc.orders.Save(ctx, order); err != nil {
        return PlaceOrderOutput{}, fmt.Errorf("saving order: %w", err)
    }
    return PlaceOrderOutput{OrderID: order.ID}, nil
}
```

**Interface Adapters** — convert between the use-case world and the infrastructure world:

```go
// adapter/http/order_handler.go
package httpadapter

import (
    "encoding/json"
    "myapp/usecase"
    "net/http"
)

type OrderHandler struct {
    placeOrder *usecase.PlaceOrderUseCase
}

func (h *OrderHandler) PlaceOrder(w http.ResponseWriter, r *http.Request) {
    var req struct {
        CustomerID string `json:"customer_id"`
        Total      int64  `json:"total"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "bad request", 400)
        return
    }
    out, err := h.placeOrder.Execute(r.Context(), usecase.PlaceOrderInput{
        CustomerID: req.CustomerID,
        Total:      req.Total,
    })
    if err != nil {
        http.Error(w, err.Error(), 422)
        return
    }
    json.NewEncoder(w).Encode(map[string]string{"order_id": out.OrderID})
}
```

```go
// adapter/postgres/order_repo.go
package postgres

import (
    "context"
    "database/sql"
    "myapp/domain"
)

type OrderRepo struct{ db *sql.DB }

func (r *OrderRepo) Save(ctx context.Context, o *domain.Order) error {
    _, err := r.db.ExecContext(ctx,
        "INSERT INTO orders (id, customer_id, total, status, placed_at) VALUES ($1,$2,$3,$4,$5)",
        o.ID, o.CustomerID, o.Total, o.Status, o.PlacedAt,
    )
    return err
}
```

## When to Use

- You're building a long-lived service where domain rules are the core asset.
- You need to support multiple delivery mechanisms (HTTP, gRPC, CLI, background workers) against the same business logic.
- The domain is complex enough to justify the structure — multiple aggregates, non-trivial rules, frequent change.
- You want to test use cases without starting any infrastructure.

## When Not to Use

- Simple CRUD services with little or no domain logic. The layers add ceremony without payoff.
- Rapid prototypes where the cost of structure outweighs the benefit of isolation.
- Small tools or scripts. Clean Architecture is optimised for change over time — it's overkill for throwaway code.

## Advantages

- The domain is completely isolated — it can be tested, reasoned about, and changed without touching infrastructure.
- Delivery mechanisms (HTTP, CLI, gRPC) are interchangeable — add a new one without touching domain or use-case code.
- Infrastructure is swappable — change databases, email providers, or payment gateways by replacing an adapter.
- Teams can work on different rings independently with minimal conflicts.

## Disadvantages

- Significant upfront structure, even for small changes.
- Requires discipline — it's easy to let infrastructure imports creep into inner rings.
- Data mapping between layers (domain types ↔ DTOs ↔ DB models) is mechanical but necessary.
- In Go, without generics in older codebases, the boilerplate for many small interfaces and converters adds up.

## Related Patterns

- **Hexagonal Architecture** — Very similar goals and structure; Hexagonal uses "ports and adapters" terminology rather than rings.
- **Layered Architecture** — Clean Architecture is a refinement of layered thinking with an explicit, enforced dependency rule.
- **Repository** — The Repository pattern is the idiomatic Go implementation of the persistence port in Clean Architecture.
- **Domain-Driven Design** — Clean Architecture's Entity ring maps directly to DDD's domain model.
