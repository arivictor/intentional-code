---
title: "Domain-Driven Design"
category: architectural
intent: "Model software around the business domain using Entities, Value Objects, Aggregates, Repositories, and Domain Events, keeping the ubiquitous language consistent across code and conversation."
idiomSummary: "Structs for entities and value objects; aggregate roots as the only entry point for mutations; domain events as plain structs dispatched after state changes."
relatedSlugs: ["repository", "event-driven", "clean-architecture", "cqrs"]
tags: [interfaces, state, events, composition, dependency-inversion]
---

# Domain-Driven Design

Domain-Driven Design (DDD) fixes a common problem where business rules end up scattered across many places. For example, a rule like *"a post must have a title before publish"* might be checked in one function but missed in another. That causes bugs.

Over time, domain types become simple data holders, while the real rules live outside them (This is known as an anemic domain model). DDD puts the rules back inside the domain type, so there is one clear place to enforce them and it is harder for callers to break them.

The building blocks of DDD are: 

* **Entities** (identity-based, stateful), 
* **Value Objects** (equality-based, immutable), 
* **Aggregates** (consistency boundaries mutated only through the root), 
* **Repositories** (persistence interfaces defined by the domain), 
* **Domain Events** (facts that have occurred), and 
* **Domain Services** (operations spanning multiple aggregates). 

Domain Driven Design also emphases a unified language between developers and domain experts, called the ubiquitous language, which should be reflected in the code's package names, type names, and method names. If your business analyst says "we don't 'process' orders, we 'fulfil' them," then the code should say `FulfillOrder`, not `ProcessOrder`.

## Strategic vs Tactical

DDD has two parts, and both matter.

**Tactical DDD** is the hands-on part. It gives you the core building blocks: Entities, Value Objects, Aggregates, Repositories, Domain Events, and Domain Services. These patterns help you model one bounded context clearly and keep business rules in the right place.

**Strategic DDD** is the big-picture part. It is about splitting a large business domain into smaller, clear sub-domains, defining the boundaries between them, and deciding how those parts talk to each other. Many teams fail with DDD because they use the tactical patterns but skip this strategic work. They create rich aggregates, but the system is still tightly coupled because the context boundaries were never defined.

Imagine a online store, its core domain is delivering products to the customer, but it has other domains like recommendations, search, billing, and shipping. Each of those is a sub-domain with its own model and rules. Strategic DDD helps you define clear boundaries between those sub-domains (bounded contexts) and decide how they integrate (context maps). For example, the recommendation system might be a separate bounded context that consumes events from the core service but has its own model of users and songs.

## Bounded Contexts

A bounded context is an explicit boundary within which a particular domain language applies. Inside the boundary, terms, models, and rules are consistent. Outside it, the same words may mean something entirely different.

The word "Customer" appears across the entire strategic domain, but means something different to each team's bounded context:

```
┌────────────────────────┐    ┌────────────────────────┐
│    Billing Context     │    │   Shipping Context     │
│                        │    │                        │
│  Customer {            │    │  Customer {            │
│    ID                  │    │    ID                  │
│    PaymentMethod       │    │    ShippingAddress     │
│    BillingAddress      │    │    DeliveryPrefs       │
│    CreditLimit         │    │    ContactPhone        │
│  }                     │    │  }                     │
└────────────────────────┘    └────────────────────────┘
```

In Go, each bounded context is its own package (or set of packages). The types are independent:

```go
// billing/customer.go — the billing model of a customer
package billing

type Customer struct {
    ID            string
    PaymentMethod PaymentMethod
    BillingAddr   Address
    CreditLimit   Money
}
```

```go
// shipping/customer.go — the shipping model of a customer
package shipping

type Customer struct {
    ID            string
    ShippingAddr  Address
    DeliveryPrefs DeliveryPreferences
    ContactPhone  string
}
```

Forcing a single `Customer` struct to serve both contexts produces a type with 15 fields where every consumer uses a different 5. Bounded contexts are the fix: each context owns its model and its data. Cross-context reads happen through explicit integration points, not shared tables.

## Context Maps

A context map documents the relationships between bounded contexts. The four most common relationships in practice:

**Shared Kernel:** Two contexts share a small subset of the model (a `Money` type, an `OrderID`). Changes to the kernel require coordination between both teams.

**Customer/Supplier:** One context is upstream (the supplier), one is downstream (the customer). The supplier defines the API; the customer adapts to it.

**Anti-Corruption Layer (ACL):** The downstream context translates the upstream model into its own terms, protecting its domain from the upstream's design decisions. This is the most important relationship for legacy integration.

**Open Host Service:** The upstream publishes a stable, versioned API for any consumer, rather than negotiating separately with each one.

```
┌─────────────────────┐      ACL     ┌─────────────────────┐
│  Legacy ERP System  │ ──────────── │   Order Context     │
│  (Upstream)         │              │   (Downstream)      │
│  LegacyOrder{...}   │              │   Order{...}        │
└─────────────────────┘              └─────────────────────┘
```

In Go, an Anti-Corruption Layer is a translator struct that converts the upstream's types into your domain's types:

```go
// acl/erp_translator.go
package acl

import "myapp/order"

// LegacyOrder is the upstream ERP's order format.
type LegacyOrder struct {
    OrderNo    string
    CustRef    string
    LineItems  []LegacyLineItem
    OrderFlags int // bitmask: 0x01=rush, 0x02=gift, 0x04=international
}

type LegacyLineItem struct {
    SKU            string
    Qty            int
    UnitPriceCents int
}

type ERPTranslator struct{}

func (t *ERPTranslator) ToDomainOrder(src LegacyOrder) order.Order {
    items := make([]order.LineItem, len(src.LineItems))
    for i, li := range src.LineItems {
        items[i] = order.LineItem{
            ProductID: order.ProductID(li.SKU),
            Quantity:  li.Qty,
            UnitPrice: order.Money{Cents: li.UnitPriceCents},
        }
    }
    return order.Order{
        ID:         order.OrderID(src.OrderNo),
        CustomerID: order.CustomerID(src.CustRef),
        Items:      items,
        IsRush:     src.OrderFlags&0x01 != 0,
    }
}
```

The order domain never sees `LegacyOrder` or its bitmask flags. The ACL absorbs the translation complexity and keeps the domain model clean.

## Ubiquitous Language

A ubiquitous language is a shared vocabulary built with domain experts that appears consistently in conversation, documentation, and code. It eliminates the translation tax that developers pay every time they convert business concepts into technical terms.

Building the language is a collaborative process: sit with domain experts, model out loud, and let their corrections shape the vocabulary. When a domain expert starts saying something that doesn't match the code, it's a sign the language has drifted. For example, if they say "we don't suggest products, we recommend them" then the code should say `RecommendProduct`, not `SuggestProduct`. When the code reads like the domain expert's sentences, you've arrived at a ubiquitous language.

```go
// Before: technical naming that does not match business language.
type ProductSuggestionRecord struct {
    ID        string
    CreatedAt time.Time
}

func saveProductSuggestion(db *sql.DB, r *ProductSuggestionRecord) error { ... }

// After: business language used in type and method names.
type ProductRecommendation struct {
    RecommendationID string
    CustomerID       CustomerID
    ProductID        ProductID
    RecommendedAt    time.Time
}

func (c *Customer) RecommendProduct(productID ProductID) (*ProductRecommendation, error) { ... }
```

The language flows through package names (`product_recommendation`), type names (`ProductRecommendation`, `Customer`, `Product`), and method names (`RecommendProduct`). The domain model becomes a living document of the business, and the business conversation becomes more precise because everyone is using the same words.

## Scenario

A growing online store has an `Order` struct with many fields. It is updated by checkout, admin tools, support scripts, and background jobs. Some mutations are only valid in certain states. Bugs appear because invariants like "an order cannot ship before payment" are enforced in some places but skipped in others. The model is an anemic data bag, not a reflection of the business.

```go
// Anemic domain model — data bag, no behavior, invariants scattered
type Order struct {
    ID             string
    CustomerID     string
    PaymentStatus  string // "pending", "paid"
    ShippingStatus string // "pending", "shipped", "cancelled"
    ShippedAt      *time.Time
}

// Invariant lives in service code, duplicated and inconsistently enforced
func ShipOrder(db *sql.DB, id string) error {
    var o Order
    db.QueryRow("SELECT * FROM orders WHERE id = $1", id).Scan(&o)
    if o.PaymentStatus != "paid" {
        return errors.New("cannot ship unpaid order") // enforced here...
    }
    db.Exec("UPDATE orders SET shipping_status = 'shipped' WHERE id = $1", id)
    return nil
}

func AdminForceShip(o *Order) {
    o.ShippingStatus = "shipped" // ...but bypassed here
}
```

## Solution

Model the domain explicitly. Each building block has a specific role.

```
┌─────────────────────────────────────────────┐
│               Aggregate Root                │
│              Order (Entity)                 │
│  ┌──────────────────┐  ┌──────────────────┐ │
│  │  OrderID         │  │  Money           │ │
│  │  (Value Obj.)    │  │  (Value Obj.)    │ │
│  └──────────────────┘  └──────────────────┘ │
│                                             │
│  Rules enforced inside, no bypass possible │
└───────────────────┬─────────────────────────┘
                    │ persisted via OrderRepository (interface)
                    │ emits OrderShipped (Domain Event)
```

**Value Objects:** immutable, compared by value:

```go
// domain/order/value_objects.go
package order

import (
    "fmt"
)

type OrderID string

type ProductID string

type Money struct {
    Cents int64
}

func NewMoney(cents int64) (Money, error) {
    if cents < 0 {
        return Money{}, fmt.Errorf("money cannot be negative")
    }
    return Money{Cents: cents}, nil
}
```

**Entity and Aggregate Root:** identity, state, and invariants enforced together:

```go
// domain/order/order.go
package order

import (
    "fmt"
    "time"
)

type PaymentStatus string
type ShippingStatus string

const (
    PaymentPending PaymentStatus = "pending"
    PaymentPaid    PaymentStatus = "paid"

    ShippingPending   ShippingStatus = "pending"
    ShippingShipped   ShippingStatus = "shipped"
    ShippingCancelled ShippingStatus = "cancelled"
)

// Domain Event — a fact that occurred inside the aggregate.
type ShippedEvent struct {
    OrderID    OrderID
    OccurredAt time.Time
}

type LineItem struct {
    ProductID ProductID
    Qty       int
}

// Order is the aggregate root — the only entry point for mutations.
type Order struct {
    id             OrderID
    customerID     string
    paymentStatus  PaymentStatus
    shippingStatus ShippingStatus
    items          []LineItem
    total          Money

    events []interface{} // uncommitted domain events
}

func New(id OrderID, customerID string, items []LineItem, total Money) (*Order, error) {
    if len(items) == 0 {
        return nil, fmt.Errorf("order must contain at least one item")
    }
    if total.Cents <= 0 {
        return nil, fmt.Errorf("order total must be greater than zero")
    }
    copiedItems := make([]LineItem, len(items))
    copy(copiedItems, items)
    return &Order{
        id:             id,
        customerID:     customerID,
        paymentStatus:  PaymentPending,
        shippingStatus: ShippingPending,
        items:          copiedItems,
        total:          total,
    }, nil
}

func (o *Order) ID() OrderID                { return o.id }
func (o *Order) PaymentStatus() PaymentStatus  { return o.paymentStatus }
func (o *Order) ShippingStatus() ShippingStatus { return o.shippingStatus }

func (o *Order) MarkPaid() error {
    if o.shippingStatus == ShippingCancelled {
        return fmt.Errorf("cannot pay a cancelled order")
    }
    if o.paymentStatus == PaymentPaid {
        return nil
    }
    o.paymentStatus = PaymentPaid
    return nil
}

// Ship enforces the invariant — callers cannot ship unpaid orders.
func (o *Order) Ship() error {
    if o.paymentStatus != PaymentPaid {
        return fmt.Errorf("cannot ship unpaid order")
    }
    if o.shippingStatus == ShippingCancelled {
        return fmt.Errorf("cannot ship cancelled order")
    }
    if o.shippingStatus == ShippingShipped {
        return nil // idempotent
    }
    o.shippingStatus = ShippingShipped
    o.events = append(o.events, ShippedEvent{
        OrderID:    o.id,
        OccurredAt: time.Now(),
    })
    return nil
}

func (o *Order) Cancel() error {
    if o.shippingStatus == ShippingShipped {
        return fmt.Errorf("cannot cancel shipped order")
    }
    if o.shippingStatus == ShippingCancelled {
        return nil
    }
    o.shippingStatus = ShippingCancelled
    return nil
}

// Items returns a copy so callers cannot mutate order internals.
func (o *Order) Items() []LineItem {
    copied := make([]LineItem, len(o.items))
    copy(copied, o.items)
    return copied
}

// PopEvents returns and clears uncommitted domain events.
func (o *Order) PopEvents() []interface{} {
    evts := o.events
    o.events = nil
    return evts
}
```

**Repository interface:** defined by the domain, implemented by infrastructure:

```go
// domain/order/repository.go
package order

import "context"

type Repository interface {
    FindByID(ctx context.Context, id OrderID) (*Order, error)
    Save(ctx context.Context, o *Order) error
}
```

**Domain Service:** operations that span the aggregate boundary, like checking inventory in another context before shipping:

```go
// domain/order/service.go
package order

import (
    "context"
    "fmt"
)

type InventoryChecker interface {
    CanFulfill(ctx context.Context, productID ProductID, qty int) (bool, error)
}

type ShipService struct {
    repo      Repository
    inventory InventoryChecker
}

func NewShipService(repo Repository, inventory InventoryChecker) *ShipService {
    return &ShipService{repo: repo, inventory: inventory}
}

func (s *ShipService) Ship(ctx context.Context, id OrderID) error {
    o, err := s.repo.FindByID(ctx, id)
    if err != nil {
        return fmt.Errorf("finding order: %w", err)
    }
    for _, it := range o.Items() {
        ok, err := s.inventory.CanFulfill(ctx, it.ProductID, it.Qty)
        if err != nil {
            return fmt.Errorf("checking inventory: %w", err)
        }
        if !ok {
            return fmt.Errorf("insufficient inventory for product %q", it.ProductID)
        }
    }
    if err := o.Ship(); err != nil {
        return err
    }
    return s.repo.Save(ctx, o)
}
```

## Folder Structure

Bounded context boundaries come first; tactical building blocks live inside them:

```
myapp/
├── cmd/
│   └── server/
│       └── main.go
├── order/                      # Bounded context: ordering
│   ├── order.go                # aggregate root, entity, domain events
│   ├── value_objects.go        # OrderID, Money
│   ├── repository.go           # persistence interface, owned by the domain
│   ├── service.go              # domain service for cross-context operations
│   └── postgres/
│       └── repository.go       # infrastructure implementation, kept inside the context
├── billing/                    # Separate bounded context — payment model
│   └── ...
├── inventory/                  # Separate bounded context — stock model
│   └── ...
└── acl/                        # Anti-corruption layer for upstream integrations
    └── erp_translator.go
```

Avoid organising by layer across contexts (`entities/`, `repositories/`, `services/` at the top level) as it produces a folder structure that looks DDD but couples bounded contexts through shared packages. Keep each context self-contained: the aggregate, its value objects, its repository interface, its domain service, and its infrastructure implementation all live together. For a context with many aggregates, split into sub-packages per aggregate rather than per tactical concept.

## When to Use

- The business domain is complex, with multiple interacting concepts, non-trivial rules, and frequent change driven by business requirements.
- You need to communicate with domain experts and the code should reflect their language (the ubiquitous language).
- Bugs are caused by invariants being enforced inconsistently in different places.
- You have aggregates with clear consistency boundaries (things that must change together).

## When Not to Use

- The domain is simple CRUD. DDD adds structure for complexity that isn't there.
- The team doesn't have access to domain experts. DDD's value compounds with tight collaboration.
- You're in early exploration. Build a working version first; apply DDD when the domain stabilises.

## The Decision

The main benefit is clear: aggregates keep important business rules in one place, so callers cannot quietly skip them, and the ubiquitous language keeps code and business conversations aligned. The cost is real and ongoing. If you draw aggregate boundaries badly, fixing them later is expensive. If you split too much, you create too much cross-transaction coordination. If you group too much, you end up with giant structs that every feature touches. Mapping rich domain objects to flat database tables is also repetitive work that grows with each aggregate. For simple admin or reporting systems, DDD is often more structure than you need.

Some practical rules help. An aggregate root should protect consistency that must hold in one database transaction. If you must load many other entities to enforce that consistency, the aggregate is probably too big. Refer to other aggregates by ID, not by direct pointer, so cross-aggregate work is explicit through a domain service or domain event. Use domain events for cross-aggregate behavior. For example, when an order is placed, emit an `OrderPlaced` event and let Inventory handle it separately, instead of calling Inventory directly from Order. If two aggregates are always loaded together, they may be one aggregate. If enforcing a rule in one aggregate always needs data from another, your boundary is probably wrong.

## Related Patterns

- **Repository:** Repositories are a first-class DDD tactical pattern. The domain defines the interface, infrastructure implements it, and the aggregate root is the only unit the repository saves and loads.
- **Event-Driven Architecture:** Domain Events are a natural source for an event-driven system. Aggregates record events as facts, and the application layer dispatches them to consumers after the transaction commits.
- **CQRS:** Pairs directly with DDD. The command side uses the rich aggregate model with enforced invariants, while the query side uses flat DTOs that bypass the domain model for read performance.
- **Clean Architecture:** DDD's domain model maps to Clean Architecture's innermost Entities ring. The two are complementary, not competing: DDD provides the modeling discipline, and Clean Architecture provides the structural boundary.
