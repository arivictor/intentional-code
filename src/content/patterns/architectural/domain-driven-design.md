# Domain-Driven Design

DDD's identifying problem is the anemic domain model: business logic scattered across service functions, domain types that are just data bags, and invariants — "a subscription can't be activated without a payment method" — enforced in some callers but forgotten in others. DDD moves that logic into the domain type itself, where it's enforced by the compiler and can't be bypassed.

The tactical building blocks: **Entities** (identity-based, stateful), **Value Objects** (equality-based, immutable), **Aggregates** (consistency boundaries mutated only through the root), **Repositories** (persistence interfaces defined by the domain), **Domain Events** (facts that have occurred), and **Domain Services** (operations spanning multiple aggregates). The unifying constraint: code should speak the language of the business.

## Problem

A billing system has a `User` struct carrying 40 fields. It's updated from 12 different places. Some mutations are only valid in certain states. Bugs appear because invariants — "a subscription can't be activated without a payment method" — are enforced in some callers but forgotten in others. The model is an anemic data bag, not a reflection of the business.

```go
// Anemic domain model — data bag, no behaviour, invariants scattered
type Subscription struct {
    ID            string
    UserID        string
    Plan          string
    Status        string      // "active", "paused", "cancelled"
    PaymentMethod string
    StartDate     time.Time
    EndDate       *time.Time
}

// Invariants live in service code, duplicated and inconsistently enforced
func ActivateSubscription(db *sql.DB, subID string) error {
    var sub Subscription
    db.QueryRow("SELECT * FROM subscriptions WHERE id = $1", subID).Scan(&sub)
    if sub.PaymentMethod == "" {
        return errors.New("no payment method")   // enforced here...
    }
    db.Exec("UPDATE subscriptions SET status = 'active' WHERE id = $1", subID)
    return nil
}

func AdminActivate(sub *Subscription) {
    sub.Status = "active"   // ...but bypassed here
}
```

## Solution

Model the domain explicitly. Each building block has a specific role.

```
┌─────────────────────────────────────────────┐
│               Aggregate Root                │
│           Subscription (Entity)             │
│  ┌───────────────┐   ┌────────────────────┐ │
│  │  SubscriptionID│   │  Plan (Value Obj.) │ │
│  │  (Value Obj.) │   │  Money, PlanType   │ │
│  └───────────────┘   └────────────────────┘ │
│                                             │
│  Rules enforced inside — no bypass possible │
└───────────────────┬─────────────────────────┘
                    │ persisted via
             SubscriptionRepository (interface)
                    │ emits
              SubscriptionActivated (Domain Event)
```

**Value Objects** — immutable, compared by value:

```go
// domain/subscription/value_objects.go
package subscription

import "fmt"

type SubscriptionID string

type PlanType string

const (
    PlanStarter  PlanType = "starter"
    PlanPro      PlanType = "pro"
    PlanEnterprise PlanType = "enterprise"
)

type Money struct {
    Amount   int64  // cents
    Currency string // "USD", "EUR"
}

func NewMoney(amount int64, currency string) (Money, error) {
    if amount < 0 {
        return Money{}, fmt.Errorf("amount cannot be negative")
    }
    if currency == "" {
        return Money{}, fmt.Errorf("currency is required")
    }
    return Money{Amount: amount, Currency: currency}, nil
}

func (m Money) Add(other Money) (Money, error) {
    if m.Currency != other.Currency {
        return Money{}, fmt.Errorf("currency mismatch: %s vs %s", m.Currency, other.Currency)
    }
    return Money{Amount: m.Amount + other.Amount, Currency: m.Currency}, nil
}
```

**Entity and Aggregate Root** — identity, state, and invariants enforced together:

```go
// domain/subscription/subscription.go
package subscription

import (
    "fmt"
    "time"
)

type Status string

const (
    StatusPending   Status = "pending"
    StatusActive    Status = "active"
    StatusPaused    Status = "paused"
    StatusCancelled Status = "cancelled"
)

// Domain Event — a fact that occurred inside the aggregate.
type ActivatedEvent struct {
    SubscriptionID SubscriptionID
    OccurredAt     time.Time
}

// Subscription is the aggregate root — the only entry point for mutations.
type Subscription struct {
    id            SubscriptionID
    userID        string
    plan          PlanType
    status        Status
    paymentMethod string
    startDate     time.Time

    events []interface{} // uncommitted domain events
}

func New(id SubscriptionID, userID string, plan PlanType) *Subscription {
    return &Subscription{
        id:     id,
        userID: userID,
        plan:   plan,
        status: StatusPending,
    }
}

func (s *Subscription) ID() SubscriptionID { return s.id }
func (s *Subscription) Status() Status     { return s.status }

func (s *Subscription) SetPaymentMethod(method string) error {
    if method == "" {
        return fmt.Errorf("payment method cannot be empty")
    }
    s.paymentMethod = method
    return nil
}

// Activate enforces the invariant — it is impossible to bypass.
func (s *Subscription) Activate() error {
    if s.paymentMethod == "" {
        return fmt.Errorf("cannot activate: no payment method on file")
    }
    if s.status == StatusCancelled {
        return fmt.Errorf("cannot activate a cancelled subscription")
    }
    if s.status == StatusActive {
        return nil // idempotent
    }
    s.status = StatusActive
    s.startDate = time.Now()
    s.events = append(s.events, ActivatedEvent{
        SubscriptionID: s.id,
        OccurredAt:     s.startDate,
    })
    return nil
}

func (s *Subscription) Cancel() error {
    if s.status == StatusCancelled {
        return nil
    }
    s.status = StatusCancelled
    return nil
}

// PopEvents returns and clears uncommitted domain events.
func (s *Subscription) PopEvents() []interface{} {
    evts := s.events
    s.events = nil
    return evts
}
```

**Repository interface** — defined by the domain, implemented by infrastructure:

```go
// domain/subscription/repository.go
package subscription

import "context"

type Repository interface {
    FindByID(ctx context.Context, id SubscriptionID) (*Subscription, error)
    Save(ctx context.Context, s *Subscription) error
}
```

**Domain Service** — operations spanning multiple aggregates:

```go
// domain/subscription/service.go
package subscription

import (
    "context"
    "fmt"
)

type BillingService interface {
    ChargeNow(ctx context.Context, userID string, amount Money) error
}

type ActivationService struct {
    repo    Repository
    billing BillingService
}

func NewActivationService(repo Repository, billing BillingService) *ActivationService {
    return &ActivationService{repo: repo, billing: billing}
}

func (s *ActivationService) Activate(ctx context.Context, id SubscriptionID) error {
    sub, err := s.repo.FindByID(ctx, id)
    if err != nil {
        return fmt.Errorf("finding subscription: %w", err)
    }
    activationFee, _ := NewMoney(999, "USD")
    if err := s.billing.ChargeNow(ctx, sub.userID, activationFee); err != nil {
        return fmt.Errorf("charging activation fee: %w", err)
    }
    if err := sub.Activate(); err != nil {
        return err
    }
    return s.repo.Save(ctx, sub)
}
```

## When to Use

- The business domain is complex — multiple interacting concepts, non-trivial rules, frequent change driven by business requirements.
- You need to communicate with domain experts and the code should reflect their language (the ubiquitous language).
- Bugs are caused by invariants being enforced inconsistently in different places.
- You have aggregates with clear consistency boundaries — things that must change together.

## When Not to Use

- The domain is simple CRUD. DDD adds structure for complexity that isn't there.
- The team doesn't have access to domain experts. DDD's value compounds with tight collaboration.
- You're in early exploration. Build a working version first; apply DDD when the domain stabilises.

## Advantages

- Invariants are enforced in one place — the aggregate — and can't be bypassed.
- The ubiquitous language bridges code and business conversation.
- Domain Events make state changes explicit and auditable.
- Value Objects eliminate primitive obsession and give meaning to raw types.

## Disadvantages

- Significant upfront modelling effort — getting aggregates wrong is expensive to fix.
- More types and more code than a simple struct-and-service approach.
- Persistence mapping between rich domain types and flat database rows is mechanical work.
- Not every problem is a domain problem — applying DDD to a simple reporting tool is over-engineering.

## Related Patterns

- **Repository** — Repositories are a first-class DDD tactical pattern: the domain defines the interface, infrastructure implements it, and the aggregate root is the only unit the repository saves and loads.
- **Event-Driven Architecture** — Domain Events are the natural source for an event-driven system; aggregates record events as facts, and the application layer dispatches them to consumers after the transaction commits.
- **CQRS** — Pairs directly with DDD: the command side uses the rich aggregate model with enforced invariants; the query side uses flat DTOs that bypass the domain model entirely for read performance.
- **Clean Architecture** — DDD's domain model maps to Clean Architecture's innermost Entities ring; the two are complementary, not competing — DDD provides the modelling discipline, Clean Architecture provides the structural boundary.
