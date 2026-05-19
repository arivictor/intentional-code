# Layered Architecture

The warning sign that you need Layered Architecture is an HTTP handler that imports `database/sql`. Go encourages small, composable packages, which means a growing service will naturally tangle HTTP, business rules, and SQL if you don't deliberately separate them. Layered Architecture is the first line of defence: four horizontal tiers — Handler, Service, Repository, Infrastructure — where each layer depends only on the layer below it, and Go's implicit interfaces enforce the boundary at no extra cost.

## Problem

A growing codebase has no clear structure. HTTP handlers call SQL queries directly. Business rules live in middleware. Email sending is triggered from a database callback. There is no obvious place to add new behaviour, and changing the database means searching the entire codebase.

```go
// main.go — everything in one place
func handleCreateOrder(w http.ResponseWriter, r *http.Request) {
    var req CreateOrderRequest
    json.NewDecoder(r.Body).Decode(&req)

    // Validation mixed with HTTP handling
    if req.CustomerID == "" {
        http.Error(w, "customer_id required", 400)
        return
    }

    // Business logic mixed with SQL
    db.Exec("INSERT INTO orders ...", req.CustomerID, req.Total)

    // Infrastructure call mixed with business logic
    smtp.SendMail("orders@shop.com", req.Email, "Order confirmed")

    w.WriteHeader(201)
}
```

Every concern is tangled together. Testing the "create order" rule requires HTTP, a database, and an SMTP server.

## Solution

Separate the code into four layers. Each layer has one responsibility and communicates downward through defined interfaces.

```
┌──────────────────────────────────┐
│         Handler Layer            │  HTTP, gRPC, CLI — translates requests
│   (routes, decode, encode)       │  into service calls and formats responses
└──────────────┬───────────────────┘
               │ calls
┌──────────────▼───────────────────┐
│         Service Layer            │  Business rules, orchestration,
│   (use cases, domain logic)      │  transaction boundaries
└──────────────┬───────────────────┘
               │ calls
┌──────────────▼───────────────────┐
│       Repository Layer           │  Data access abstraction —
│   (interfaces + SQL impl)        │  hides WHERE the data lives
└──────────────┬───────────────────┘
               │ uses
┌──────────────▼───────────────────┐
│     Infrastructure Layer         │  sql.DB, SMTP client, S3,
│   (drivers, clients, adapters)   │  third-party SDKs
└──────────────────────────────────┘
```

The handler translates HTTP to domain types:

```go
// handler/order.go
package handler

import (
    "encoding/json"
    "net/http"
    "orders/service"
)

type OrderHandler struct {
    svc *service.OrderService
}

func (h *OrderHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req struct {
        CustomerID string `json:"customer_id"`
        Total      int64  `json:"total"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "bad request", 400)
        return
    }
    id, err := h.svc.CreateOrder(r.Context(), req.CustomerID, req.Total)
    if err != nil {
        http.Error(w, err.Error(), 422)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"id": id})
}
```

The service layer holds the business rules. It depends on interfaces, not concrete types:

```go
// service/order.go
package service

import (
    "context"
    "fmt"
    "orders/domain"
)

type OrderRepo interface {
    Save(ctx context.Context, o *domain.Order) error
}

type Mailer interface {
    SendConfirmation(ctx context.Context, email string, orderID string) error
}

type OrderService struct {
    repo   OrderRepo
    mailer Mailer
}

func NewOrderService(repo OrderRepo, mailer Mailer) *OrderService {
    return &OrderService{repo: repo, mailer: mailer}
}

func (s *OrderService) CreateOrder(ctx context.Context, customerID string, total int64) (string, error) {
    if customerID == "" {
        return "", fmt.Errorf("customer_id is required")
    }
    o := domain.NewOrder(customerID, total)
    if err := s.repo.Save(ctx, o); err != nil {
        return "", fmt.Errorf("saving order: %w", err)
    }
    s.mailer.SendConfirmation(ctx, o.CustomerEmail, o.ID)
    return o.ID, nil
}
```

The repository layer implements data access:

```go
// repository/order_postgres.go
package repository

import (
    "context"
    "database/sql"
    "orders/domain"
)

type PostgresOrderRepo struct{ db *sql.DB }

func NewPostgresOrderRepo(db *sql.DB) *PostgresOrderRepo {
    return &PostgresOrderRepo{db: db}
}

func (r *PostgresOrderRepo) Save(ctx context.Context, o *domain.Order) error {
    _, err := r.db.ExecContext(ctx,
        "INSERT INTO orders (id, customer_id, total, status) VALUES ($1, $2, $3, $4)",
        o.ID, o.CustomerID, o.Total, o.Status,
    )
    return err
}
```

Wired together in `main.go` — the only place that knows about all layers:

```go
// main.go
package main

import (
    "database/sql"
    "net/http"
    "orders/handler"
    "orders/repository"
    "orders/service"
    "orders/infra/smtp"
)

func main() {
    db, _ := sql.Open("postgres", "host=localhost ...")
    repo := repository.NewPostgresOrderRepo(db)
    mailer := smtp.NewMailer("smtp.example.com:587")
    svc := service.NewOrderService(repo, mailer)
    h := &handler.OrderHandler{Svc: svc}

    http.HandleFunc("POST /orders", h.Create)
    http.ListenAndServe(":8080", nil)
}
```

## When to Use

- You're building a web service or API and want a clear place for each concern.
- Teams are divided by layer (frontend/backend, DB specialists) and need clear boundaries.
- You want business logic to be testable without HTTP or database infrastructure.
- You need to swap a layer — e.g., replace PostgreSQL with a different store — without touching other layers.

## When Not to Use

- Very simple applications. Three packages calling each other is already a layered architecture — don't add ceremony before you feel the pain.
- The domain is so thin that the service layer just passes data through. If service methods are one-liners, the layer is adding noise.
- When you need to optimise differently per operation — consider CQRS instead, which allows asymmetric read/write models.

## Advantages

- Clear separation of concerns — each layer has a defined job.
- Business logic is isolated and testable without infrastructure.
- Layers are independently replaceable (swap the database, swap the HTTP framework).
- Onboarding is fast — new engineers can quickly orient themselves to the structure.

## Disadvantages

- Can produce "lasagne code" — many thin layers that just pass data through, adding indirection without value.
- Strict layering can make it awkward to optimise queries — the service layer can't reach into the database without going through the repository interface.
- Feature changes often touch every layer, making simple additions feel heavyweight.
- Does not address how layers within the same tier relate to each other (use Hexagonal or Clean Architecture for more nuanced guidance).

## Related Patterns

- **Repository** — The natural pattern to define the Service-to-Infrastructure boundary: the service layer declares the interface it needs; the repository layer implements it — use Repository whenever the persistence logic is complex enough to warrant its own package.
- **Clean Architecture** — A more opinionated elaboration of layered thinking that enforces the inward dependency rule with ring terminology; prefer Clean Architecture when you need stronger isolation guarantees or multiple delivery mechanisms against the same domain.
- **Hexagonal Architecture** — Replaces strict downward layering with symmetric ports — HTTP and databases become equivalent adapters plugging into the same hexagon; prefer Hexagonal when you need to test the full application core without any infrastructure, since the port model makes that clearer than strict layers.
