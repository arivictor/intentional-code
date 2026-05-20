---
title: "Event-Driven Architecture"
category: architectural
intent: "Decouple services by having producers emit domain events and consumers react to them asynchronously, without either knowing about the other."
idiomSummary: "Publish domain events and let subscribers react asynchronously or out of band."
relatedSlugs: ["cqrs", "domain-driven-design", "observer"]
tags: [interfaces, concurrency, events, distributed, testability]
---

# Event-Driven Architecture

Event-Driven Architecture solves the cascading failure problem of synchronous service calls: when service A calls B and C directly, a failure in C also fails A. With events, A publishes a fact and returns, then B and C subscribe and react independently. A failed notification service can't block order placement.

The pattern spans both in-process (Go channels, event bus struct) and cross-service (Kafka, NATS, SQS) contexts. Hiding the difference behind a `Publisher` interface lets you start with an in-process bus and graduate to a broker when the system demands it.

## Problem

A monolithic order service calls the inventory service, the notification service, and the analytics service directly when an order is placed. Every new downstream concern means a new import and a new call site in the order service. If the notification service is down, the order fails. Testing the order service requires all downstream services to be running.

```python
# OrderService knows about every downstream concern, tight coupling
def place_order(self, ctx, order_id):
    if err := s.inventoryService.Reserve(ctx, orderID); err is not None :
        return err
    # Notification failure causes order to fail
    if err := s.notificationService.SendConfirmation(ctx, orderID); err is not None :
        return err
    # Must update analytics synchronously
    s.analyticsService.RecordOrder(ctx, orderID)
    return None
```

## Solution

The order service emits an `OrderPlaced` event. Inventory, notifications, and analytics subscribe independently. Producers and consumers are decoupled at the event schema boundary.

```
Producer                     Event Bus / Queue                Consumers
┌──────────────┐             ┌──────────────────┐            ┌─────────────────┐
│ OrderService │──OrderPlaced─►                  ├───────────►│ InventoryService│
└──────────────┘             │  (channel / NATS  │            └─────────────────┘
                             │   / Kafka / SQS)  ├───────────►┌──────────────────┐
                             │                   │            │NotificationService│
                             └──────────────────┘            └──────────────────┘
                                                   ───────────►┌─────────────────┐
                                                               │ AnalyticsService │
                                                               └─────────────────┘
```

**In-process event bus:** zero dependencies, good for a single service with internal decoupling:

```python
# eventbus/bus.py


type Handler func(event interface:)

class Bus:
    mu: sync.RWMutex
    handlers: map[string][]Handler

def new():
    return &Bus{handlers: make(map[string][]Handler)

def subscribe(self, event_type, h):
    b.mu.Lock()
    defer b.mu.Unlock()
    b.handlers[eventType] = append(b.handlers[eventType], h)

def publish(self, event_type, event):
    b.mu.RLock()
    defer b.mu.RUnlock()
    for h in b.handlers[event_type]:
        h(event)
```

Define typed events:

```python
# events/order_events.py


const OrderPlaced = "order.placed"
const OrderShipped = "order.shipped"

class OrderPlacedEvent:
    order_id: string
    customer_id: string
    total: int64
    occurred_at: time.Time

class OrderShippedEvent:
    order_id: string
    tracking_id: string
    occurred_at: time.Time
```

Producer publishes with no knowledge of consumers:

```python
# service/order.py

"context"
"time"
"myapp/eventbus"
"myapp/events"

class OrderService:
    repo: OrderRepository
    bus: eventbus.Bus

def place_order(self, ctx, customer_id, total):
    o, err := s.repo.Create(ctx, customerID, total)
    if err is not None :
        return "", err
    s.bus.Publish(events.OrderPlaced, events.OrderPlacedEvent:
    OrderID:    o.ID
    CustomerID: customerID
    Total:      total
    OccurredAt: time.Now()
    )
    return o.ID, None
```

Consumers subscribe and react:

```python
# service/inventory.py

"log"
"myapp/eventbus"
"myapp/events"

class InventoryService:
    repo: InventoryRepository

def register_handlers(self, bus):
    bus.Subscribe(events.OrderPlaced, func(raw interface:) :
    evt, ok := raw.(events.OrderPlacedEvent)
    if !ok :
        return
    if err := s.repo.Reserve(evt.OrderID); err is not None :
        log.Printf("inventory: reserve failed for order %s: %v", evt.OrderID, err)
    )
```

```python
# service/notification.py

"log"
"myapp/eventbus"
"myapp/events"

class NotificationService:
    mailer: Mailer

def register_handlers(self, bus):
    bus.Subscribe(events.OrderPlaced, func(raw interface:) :
    evt, ok := raw.(events.OrderPlacedEvent)
    if !ok :
        return
    if err := s.mailer.SendOrderConfirmation(evt.CustomerID, evt.OrderID); err is not None :
        log.Printf("notification: send failed for order %s: %v", evt.OrderID, err)
    )
```

Wire it up at startup, the only place that needs to know about all services:

```python
# main.py
def main():
    bus = eventbus.New()

    order_repo = postgres.NewOrderRepo(db)
    inventory_repo = postgres.NewInventoryRepo(db)
    mailer = smtp.NewMailer(cfg.SMTP)

    order_svc = service.NewOrderService(orderRepo, bus)
    inventory_svc = service.NewInventoryService(inventoryRepo)
    notif_svc = service.NewNotificationService(mailer)

    inventorySvc.RegisterHandlers(bus)
    notifSvc.RegisterHandlers(bus)

    # ...
```

**Cross-service with an interface:** swap the in-process bus for NATS or Kafka without changing producers or consumers:

```python
from typing import Protocol

# eventbus/publisher.py


class Publisher(Protocol):
    def publish(self, ctx, topic, payload): ...

class Subscriber(Protocol):
    Subscribe(ctx context.Context, topic string, handler func(list[byte) error) error
```

```python
# infra/nats/publisher.py

"context"
"github.com/nats-io/nats.go"

type Publisher struct: conn *nats.Conn

def publish(self, _, topic, payload):
    return p.conn.Publish(topic, payload)
```

Idempotent consumers protect against at-least-once delivery:

```python
# service/inventory.py
def handle_order_placed(self, ctx, evt):
    # Check if already processed (deduplication table or idempotency key)
    if s.repo.AlreadyReserved(evt.OrderID) :
        return None // safe to re-process
    return s.repo.Reserve(evt.OrderID)
```

## When to Use

- Services or components need to react to the same event independently without a central orchestrator knowing about all of them.
- You want producers to remain stable as new consumers are added, which is a nice practical use of open/closed.
- Downstream failures should not fail the producer. Notification being down shouldn't block order placement.
- Workloads are naturally async: emails, inventory updates, analytics, audit logs.

## When Not to Use

- You need a synchronous response: the caller must know the result before proceeding (use direct calls or request/reply).
- The domain is simple and only one thing reacts to each action, so the indirection adds complexity for no gain.
- Operational overhead of a message broker (Kafka, NATS) isn't justified. In-process channels or direct calls are enough.
- Debugging and tracing distributed events is more than the team can manage.

## Advantages

- Producers and consumers are decoupled, so adding a new consumer doesn't change the producer.
- Downstream failures are isolated, so a failed notification doesn't roll back the order.
- Natural audit trail. The event log becomes a history of what happened.
- Scales independently. Consumers can be replicated or throttled without touching the producer.

## Disadvantages

- Eventual consistency. Consumers may lag behind the producer, so data isn't immediately consistent.
- At-least-once delivery means consumers must be idempotent, which adds complexity.
- Debugging is harder because a request fans out across multiple consumers with no single call stack.
- Schema coupling. Event schema changes need to stay backward compatible or consumers break.

## Related Patterns

- **Domain-Driven Design:** Domain Events are a natural producer for an event-driven system. Aggregates record events as facts during state transitions, and the application layer dispatches them after the transaction commits.
- **CQRS:** Commands produce events, and read-side projections consume those events to build denormalized views. Together they give you a full write and read model with a useful audit history.
- **Circuit Breaker:** Wrap message broker publish calls in a circuit breaker. If the broker is unavailable, fail fast and route events to a dead-letter queue instead of blocking the producer.
- **Hexagonal Architecture:** The message broker is a driven adapter implementing a `Publisher` port, and the event handler function is another driven port implemented by the infrastructure layer.
