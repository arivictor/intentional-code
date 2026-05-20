---
title: "Domain-Driven Design"
category: architectural
intent: "Model software around the business domain using Entities, Value Objects, Aggregates, Repositories, and Domain Events, keeping the ubiquitous language consistent across code and conversation."
idiomSummary: "Model the domain explicitly with rich objects, boundaries, and ubiquitous language."
relatedSlugs: ["repository", "event-driven", "clean-architecture", "cqrs"]
tags: [interfaces, state, events, composition, dependency-inversion]
---

# Domain-Driven Design

The problem DDD solves is logic that leaks. Business rules like "a subscription can't be activated without a payment method" get written into one service function, forgotten in another, and enforced inconsistently across the codebase. Your domain types become plain data structs, and the rules that govern them float free. DDD puts that logic back inside the type, where Python's object model helps you keep callers honest.

The tactical building blocks are **Entities** (identity-based, stateful), **Value Objects** (equality-based, immutable), **Aggregates** (consistency boundaries mutated only through the root), **Repositories** (persistence interfaces defined by the domain), **Domain Events** (facts that have occurred), and **Domain Services** (operations spanning multiple aggregates). The unifying constraint is simple: the code should speak the language of the business.

## Problem

A billing system has a `User` struct carrying 40 fields. It's updated from 12 different places. Some mutations are only valid in certain states. Bugs appear because invariants like "a subscription can't be activated without a payment method" are enforced in some callers but forgotten in others. The model is an anemic data bag, not a reflection of the business.

```python
# Anemic domain model, data bag, no behavior, invariants scattered
class Subscription:
    id: string
    user_id: string
    plan: string
    Status        string      // "active", "paused", "cancelled"
    payment_method: string
    start_date: time.Time
    end_date: time.Time

# Invariants live in service code, duplicated and inconsistently enforced
def activate_subscription(db, sub_id):
    var sub Subscription
    db.QueryRow("SELECT * FROM subscriptions WHERE id = $1", subID).Scan(&sub)
    if sub.PaymentMethod == "" :
        return Exception("no payment method")   // enforced here...
    db.Exec("UPDATE subscriptions SET status = 'active' WHERE id = $1", subID)
    return None

def admin_activate(sub):
    sub.Status = "active"   // ...but bypassed here
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
│  Rules enforced inside, no bypass possible │
└───────────────────┬─────────────────────────┘
                    │ persisted via
             SubscriptionRepository (interface)
                    │ emits
              SubscriptionActivated (Domain Event)
```

**Value Objects:** immutable, compared by value:

```python
# domain/subscription/value_objects.py


type SubscriptionID string

type PlanType string

const (
PlanStarter  PlanType = "starter"
PlanPro      PlanType = "pro"
PlanEnterprise PlanType = "enterprise"

class Money:
    Amount   int64  // cents
    Currency string // "USD", "EUR"

def new_money(amount, currency):
    if amount < 0 :
        return Money{}, fmt.Errorf("amount cannot be negative")
    if currency == "" :
        return Money{}, fmt.Errorf("currency is required")
    return Money{Amount: amount, Currency: currency}, None

def add(self, other):
    if m.Currency != other.Currency :
        return Money{}, fmt.Errorf("currency mismatch: %s vs %s", m.Currency, other.Currency)
    return Money{Amount: m.Amount + other.Amount, Currency: m.Currency}, None
```

**Entity and Aggregate Root:** identity, state, and invariants enforced together:

```python
# domain/subscription/subscription.py

"fmt"
"time"

type Status string

const (
StatusPending   Status = "pending"
StatusActive    Status = "active"
StatusPaused    Status = "paused"
StatusCancelled Status = "cancelled"

# Domain Event, a fact that occurred inside the aggregate.
class ActivatedEvent:
    subscription_id: SubscriptionID
    occurred_at: time.Time

# Subscription is the aggregate root, the only entry point for mutations.
class Subscription:
    id: SubscriptionID
    user_id: string
    plan: PlanType
    status: Status
    payment_method: string
    start_date: time.Time

    events list[interface: // uncommitted domain events

def new(id, user_id, plan):
    return &Subscription{
    id:     id
    userID: userID
    plan:   plan
    status: StatusPending

def id(self):
    return s.id
def status(self):
    return s.status

def set_payment_method(self, method):
    if method == "" :
        return fmt.Errorf("payment method cannot be empty")
    s.paymentMethod = method
    return None

# Activate enforces the invariant, so callers can't bypass it.
def activate(self):
    if s.paymentMethod == "" :
        return fmt.Errorf("cannot activate: no payment method on file")
    if s.status == StatusCancelled :
        return fmt.Errorf("cannot activate a cancelled subscription")
    if s.status == StatusActive :
        return None // idempotent
    s.status = StatusActive
    s.startDate = time.Now()
    s.events = append(s.events, ActivatedEvent:
    SubscriptionID: s.id
    OccurredAt:     s.startDate
    )
    return None

def cancel(self):
    if s.status == StatusCancelled :
        return None
    s.status = StatusCancelled
    return None

# PopEvents returns and clears uncommitted domain events.
func (s *Subscription) PopEvents() list[interface: :
evts = s.events
s.events = None
return evts
```

**Repository interface:** defined by the domain, implemented by infrastructure:

```python
from typing import Protocol

# domain/subscription/repository.py


class Repository(Protocol):
    FindByID(ctx context.Context, id SubscriptionID) (*Subscription, error)
    def save(self, ctx, s): ...
```

**Domain Service:** operations spanning multiple aggregates:

```python
from typing import Protocol

# domain/subscription/service.py

"context"
"fmt"

class BillingService(Protocol):
    def charge_now(self, ctx, user_id, amount): ...

class ActivationService:
    repo: Repository
    billing: BillingService

def new_activation_service(repo, billing):
    return &ActivationService{repo: repo, billing: billing

def activate(self, ctx, id):
    sub, err := s.repo.FindByID(ctx, id)
    if err is not None :
        return fmt.Errorf("finding subscription: %w", err)
    activationFee, _ := NewMoney(999, "USD")
    if err := s.billing.ChargeNow(ctx, sub.userID, activationFee); err is not None :
        return fmt.Errorf("charging activation fee: %w", err)
    if err := sub.Activate(); err is not None :
        return err
    return s.repo.Save(ctx, sub)
```

## When to Use

- The business domain is complex, with multiple interacting concepts, non-trivial rules, and frequent change driven by business requirements.
- You need to communicate with domain experts and the code should reflect their language (the ubiquitous language).
- Bugs are caused by invariants being enforced inconsistently in different places.
- You have aggregates with clear consistency boundaries, things that must change together.

## When Not to Use

- The domain is simple CRUD. DDD adds structure for complexity that isn't there.
- The team doesn't have access to domain experts. DDD's value compounds with tight collaboration.
- You're in early exploration. Build a working version first; apply DDD when the domain stabilises.

## Advantages

- Invariants are enforced in one place, the aggregate, and can't be bypassed.
- The ubiquitous language bridges code and business conversation.
- Domain Events make state changes explicit and auditable.
- Value Objects eliminate primitive obsession and give meaning to raw types.

## Disadvantages

- Significant upfront modeling effort. Getting aggregates wrong is expensive to fix.
- More types and more code than a simple struct-and-service approach.
- Persistence mapping between rich domain types and flat database rows is mechanical work.
- Not every problem is a domain problem. Applying DDD to a simple reporting tool is over-engineering.

## Related Patterns

- **Repository:** Repositories are a first-class DDD tactical pattern. The domain defines the interface, infrastructure implements it, and the aggregate root is the only unit the repository saves and loads.
- **Event-Driven Architecture:** Domain Events are a natural source for an event-driven system. Aggregates record events as facts, and the application layer dispatches them to consumers after the transaction commits.
- **CQRS:** Pairs directly with DDD. The command side uses the rich aggregate model with enforced invariants, while the query side uses flat DTOs that bypass the domain model for read performance.
- **Clean Architecture:** DDD's domain model maps to Clean Architecture's innermost Entities ring. The two are complementary, not competing. DDD provides the modeling discipline, and Clean Architecture provides the structural boundary.
