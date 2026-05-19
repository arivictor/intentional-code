# Repository

Repository isolates domain logic from data persistence. You define an interface describing the operations your domain needs — save, find, delete — and provide concrete implementations for each backend. Domain code depends on the interface; infrastructure code implements it.

## Problem

Your order-processing logic is scattered with direct database calls. Every function that needs an order calls `sql.DB` directly. Tests require a live database. Switching from PostgreSQL to a different store means hunting through business logic.

```go
// orders.go
package orders

import (
    "database/sql"
    "fmt"
)

func ShipOrder(db *sql.DB, orderID string) error {
    var status string
    err := db.QueryRow("SELECT status FROM orders WHERE id = $1", orderID).Scan(&status)
    if err != nil {
        return fmt.Errorf("fetching order: %w", err)
    }
    if status != "paid" {
        return fmt.Errorf("order %s is not paid", orderID)
    }
    _, err = db.Exec("UPDATE orders SET status = 'shipped' WHERE id = $1", orderID)
    return err
}
```

The business rule (`status must be "paid"`) is entangled with SQL. There is no way to test `ShipOrder` without a real database running.

## Solution

Define a repository interface in the domain package. Business logic depends on that interface. Infrastructure packages implement it.

```
Domain package
  ├── Order (entity)
  └── OrderRepository (interface)
          │ implemented by
          ▼
  postgres.OrderRepo   ← talks to sql.DB
  memory.OrderRepo     ← holds a map, used in tests
```

Define the domain types and the interface together:

```go
// domain/orders/order.go
package orders

import "fmt"

type Status string

const (
    StatusPaid    Status = "paid"
    StatusShipped Status = "shipped"
)

type Order struct {
    ID     string
    Status Status
}

func (o *Order) Ship() error {
    if o.Status != StatusPaid {
        return fmt.Errorf("order %s cannot be shipped: status is %s", o.ID, o.Status)
    }
    o.Status = StatusShipped
    return nil
}

// Repository is the persistence contract the domain requires.
type Repository interface {
    FindByID(id string) (*Order, error)
    Save(o *Order) error
}
```

The service depends only on the interface:

```go
// domain/orders/service.go
package orders

type Service struct {
    repo Repository
}

func NewService(repo Repository) *Service {
    return &Service{repo: repo}
}

func (s *Service) ShipOrder(orderID string) error {
    order, err := s.repo.FindByID(orderID)
    if err != nil {
        return err
    }
    if err := order.Ship(); err != nil {
        return err
    }
    return s.repo.Save(order)
}
```

The PostgreSQL implementation lives in the infrastructure layer:

```go
// infra/postgres/order_repo.go
package postgres

import (
    "database/sql"
    "fmt"
    "orders"
)

type OrderRepo struct {
    db *sql.DB
}

func NewOrderRepo(db *sql.DB) *OrderRepo {
    return &OrderRepo{db: db}
}

func (r *OrderRepo) FindByID(id string) (*orders.Order, error) {
    var o orders.Order
    err := r.db.QueryRow(
        "SELECT id, status FROM orders WHERE id = $1", id,
    ).Scan(&o.ID, &o.Status)
    if err != nil {
        return nil, fmt.Errorf("finding order %s: %w", id, err)
    }
    return &o, nil
}

func (r *OrderRepo) Save(o *orders.Order) error {
    _, err := r.db.Exec(
        "UPDATE orders SET status = $1 WHERE id = $2", o.Status, o.ID,
    )
    return err
}
```

An in-memory implementation makes unit tests fast and infrastructure-free:

```go
// infra/memory/order_repo.go
package memory

import (
    "fmt"
    "orders"
    "sync"
)

type OrderRepo struct {
    mu     sync.RWMutex
    orders map[string]*orders.Order
}

func NewOrderRepo(seed ...*orders.Order) *OrderRepo {
    m := make(map[string]*orders.Order)
    for _, o := range seed {
        m[o.ID] = o
    }
    return &OrderRepo{orders: m}
}

func (r *OrderRepo) FindByID(id string) (*orders.Order, error) {
    r.mu.RLock()
    defer r.mu.RUnlock()
    o, ok := r.orders[id]
    if !ok {
        return nil, fmt.Errorf("order %s not found", id)
    }
    return o, nil
}

func (r *OrderRepo) Save(o *orders.Order) error {
    r.mu.Lock()
    defer r.mu.Unlock()
    r.orders[o.ID] = o
    return nil
}
```

```go
// domain/orders/service_test.go
package orders_test

import (
    "orders"
    "orders/infra/memory"
    "testing"
)

func TestShipOrder(t *testing.T) {
    repo := memory.NewOrderRepo(&orders.Order{ID: "o1", Status: orders.StatusPaid})
    svc := orders.NewService(repo)

    if err := svc.ShipOrder("o1"); err != nil {
        t.Fatal(err)
    }
    got, _ := repo.FindByID("o1")
    if got.Status != orders.StatusShipped {
        t.Errorf("status = %s, want shipped", got.Status)
    }
}
```

## When to Use

- Your domain logic needs to be tested without a real database.
- You want the flexibility to change your persistence layer without touching business logic.
- Multiple storage backends are needed (e.g., SQL for production, in-memory for tests, Redis for caching).
- You're following Layered, Clean, or Hexagonal Architecture and need a defined persistence boundary.

## When Not to Use

- Simple CRUD applications where there is no domain logic to protect. A direct `sql.DB` call is cleaner.
- The application is a thin data service. Adding a repository interface just to have one adds ceremony without value.
- Your query needs are so varied (complex filters, reporting) that a single interface becomes a leaky abstraction — consider a query builder or direct SQL for reads.

## Advantages

- Domain logic is testable with no infrastructure required.
- Storage backends are swappable — swap PostgreSQL for SQLite or an in-memory map without touching business code.
- The interface documents exactly what persistence operations the domain actually needs.
- Follows the Dependency Inversion Principle — domain defines the contract, infrastructure satisfies it.

## Disadvantages

- Adds a layer of indirection. For simple applications this is boilerplate with no payoff.
- One interface per aggregate can lead to many small interfaces that are tedious to keep in sync.
- Complex read requirements often leak through the interface (pagination, filtering, sorting) making it hard to keep the interface small and stable.
- In-memory implementations must be kept in sync with the real implementation, or tests give false confidence.

## Related Patterns

- **Hexagonal Architecture** — Repository is the canonical example of a driven port in Hexagonal Architecture.
- **Layered Architecture** — Repository sits at the boundary between the Domain and Infrastructure layers.
- **Domain-Driven Design** — Repositories are a first-class tactical pattern in DDD, one per aggregate root.
- **Clean Architecture** — Repository interfaces belong in the Use Case ring; implementations belong in the outermost ring.
