---
title: "Clean Architecture"
category: architectural
intent: "Structure code in concentric rings, Entities, Use Cases, Interface Adapters, Frameworks, enforcing a strict inward dependency rule so the domain never imports infrastructure."
idiomSummary: "Keep framework details at the edges and core use cases in plain Python types."
relatedSlugs: ["hexagonal", "layered", "repository", "domain-driven-design"]
tags: [interfaces, dependency-inversion, testability, composition]
---

# Clean Architecture

Clean Architecture organizes code in concentric rings, Entities, Use Cases, Interface Adapters, Frameworks and Drivers, with one strict rule: source-code dependencies may only point inward. The innermost rings know nothing about HTTP, databases, or frameworks. Everything outside exists to serve the domain.

## Problem

You're three years into a project. Switching from PostgreSQL to CockroachDB requires touching service logic. Adding a gRPC endpoint means duplicating validation that lives in the HTTP handler. Your domain types import `database/sql`. The framework has become load-bearing, and you can't reason about business logic without understanding the infrastructure first.

```python
# Typical symptom: domain types coupled to infrastructure

"database/sql"       // domain importing infrastructure
"net/http"           // domain importing HTTP
"encoding/json"

class Order:
    ID string `json:"id" db:"id"`   // JSON and DB tags on domain type

def create_order(db, w, r):
    # HTTP, DB, and domain logic all in one place
```

## Solution

Enforce the Dependency Rule: source code in an inner ring never names, imports, or knows about anything in an outer ring.

```
┌───────────────────────────────────────────┐
│          Frameworks & Drivers             │  HTTP handlers, sql.DB,
│     (outermost, nothing imports this)    │  SMTP clients, CLI
│  ┌─────────────────────────────────────┐  │
│  │       Interface Adapters            │  │  Controllers, Presenters,
│  │  (converts between rings)           │  │  Repository implementations
│  │  ┌───────────────────────────────┐  │  │
│  │  │        Use Cases              │  │  │  Application business rules
│  │  │  (application logic)          │  │  │  orchestrate entities
│  │  │  ┌─────────────────────────┐  │  │  │
│  │  │  │       Entities          │  │  │  │  Enterprise business rules
│  │  │  │  (domain types & rules) │  │  │  │  pure Go, zero imports
│  │  │  └─────────────────────────┘  │  │  │
│  │  └───────────────────────────────┘  │  │
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
            ← dependencies point inward
```

**Entities:** pure domain types, no imports beyond the standard library:

```python
# domain/order.py

"fmt"
"time"

"github.com/google/uuid"

type OrderStatus string

const (
StatusDraft    OrderStatus = "draft"
StatusPlaced   OrderStatus = "placed"
StatusShipped  OrderStatus = "shipped"

class Order:
    id: string
    customer_id: string
    total: int64
    status: OrderStatus
    placed_at: time.Time

def new_order(customer_id, total):
    if customerID == "" :
        return None, fmt.Errorf("customer_id is required")
    if total <= 0 :
        return None, fmt.Errorf("total must be positive")
    return &Order{
    ID:         uuid.NewString()
    CustomerID: customerID
    Total:      total
    Status:     StatusDraft
    , None

def place(self):
    if o.Status != StatusDraft :
        return fmt.Errorf("only draft orders can be placed")
    o.Status = StatusPlaced
    o.PlacedAt = time.Now()
    return None
```

**Use Cases:** define interfaces for everything they need, implement nothing:

```python
from typing import Protocol

# usecase/place_order.py

"context"
"fmt"
"myapp/domain"

# Ports, defined by the use case and implemented by outer rings.
class OrderRepository(Protocol):
    def save(self, ctx, o): ...

class PaymentGateway(Protocol):
    def charge(self, ctx, customer_id, amount): ...

class PlaceOrderInput:
    customer_id: string
    total: int64

class PlaceOrderOutput:
    order_id: string

class PlaceOrderUseCase:
    orders: OrderRepository
    payment: PaymentGateway

def new_place_order_use_case(orders, payment):
    return &PlaceOrderUseCase{orders: orders, payment: payment

def execute(self, ctx, in):
    order, err := domain.NewOrder(in.CustomerID, in.Total)
    if err is not None :
        return PlaceOrderOutput{}, err
    if err := uc.payment.Charge(ctx, order.CustomerID, order.Total); err is not None :
        return PlaceOrderOutput{}, fmt.Errorf("payment failed: %w", err)
    if err := order.Place(); err is not None :
        return PlaceOrderOutput{}, err
    if err := uc.orders.Save(ctx, order); err is not None :
        return PlaceOrderOutput{}, fmt.Errorf("saving order: %w", err)
    return PlaceOrderOutput{OrderID: order.ID}, None
```

**Interface Adapters:** convert between the use-case world and the infrastructure world:

```python
# adapter/http/order_handler.py

"encoding/json"
"myapp/usecase"
"net/http"

class OrderHandler:
    place_order: usecase.PlaceOrderUseCase

def place_order(self, w, r):
    var req struct :
    CustomerID string `json:"customer_id"`
    Total      int64  `json:"total"`
if err := json.NewDecoder(r.Body).Decode(&req); err is not None :
    http.Error(w, "bad request", 400)
    return
out, err := h.placeOrder.Execute(r.Context(), usecase.PlaceOrderInput:
CustomerID: req.CustomerID
Total:      req.Total
)
if err is not None :
    http.Error(w, err.Error(), 422)
    return
json.NewEncoder(w).Encode(map[string]string:"order_id": out.OrderID)
```

```python
# adapter/postgres/order_repo.py

"context"
"database/sql"
"myapp/domain"

type OrderRepo struct: db *sql.DB

def save(self, ctx, o):
    _, err := r.db.ExecContext(ctx
    "INSERT INTO orders (id, customer_id, total, status, placed_at) VALUES ($1,$2,$3,$4,$5)"
    o.ID, o.CustomerID, o.Total, o.Status, o.PlacedAt
    return err
```

## When to Use

- You're building a long-lived service where domain rules are the core asset.
- You need to support multiple delivery mechanisms (HTTP, gRPC, CLI, background workers) against the same business logic.
- The domain is complex enough to justify the structure, multiple aggregates, non-trivial rules, frequent change.
- You want to test use cases without starting any infrastructure.

## When Not to Use

- Simple CRUD services with little or no domain logic. The layers add ceremony without payoff.
- Rapid prototypes where the cost of structure outweighs the benefit of isolation.
- Small tools or scripts. Clean Architecture is optimized for change over time, so it's overkill for throwaway code.

## Advantages

- The domain is completely isolated, so it can be tested, reasoned about, and changed without touching infrastructure.
- Delivery mechanisms (HTTP, CLI, gRPC) are interchangeable. You can add a new one without touching domain or use-case code.
- Infrastructure is swappable. Change databases, email providers, or payment gateways by replacing an adapter.
- Teams can work on different rings independently with minimal conflicts.

## Disadvantages

- Significant upfront structure, even for small changes.
- Requires discipline. It's easy to let infrastructure imports creep into inner rings.
- Data mapping between layers (domain types ↔ DTOs ↔ DB models) is mechanical but necessary.
- In Python, without generics in older codebases, the boilerplate for many small interfaces and converters adds up.

## Related Patterns

- **Hexagonal Architecture:** Same goals, different vocabulary. Clean Architecture uses "concentric rings," Hexagonal uses "ports and adapters." Use whichever model helps your team enforce the inward dependency rule. They work well together, and many codebases use both terms interchangeably.
- **Layered Architecture:** Clean Architecture is a stricter version of layered thinking. Layered gives you the tier structure, while Clean Architecture adds an explicit Dependency Rule and forbids inner rings from naming outer ones. Reach for it when you need that rule to hold under pressure.
- **Repository:** Repository is the idiomatic Python implementation of the persistence port in Clean Architecture's Use Case ring. The interface belongs in Use Cases, the SQL implementation belongs in the outermost Frameworks and Drivers ring, and the inward dependency rule tells you exactly where each piece lives.
- **Domain-Driven Design:** Clean Architecture's Entity ring maps directly to DDD's domain model. The two pair naturally. DDD gives you the modeling discipline for what belongs in the inner rings, and Clean Architecture gives you the structural rule that keeps it there.
