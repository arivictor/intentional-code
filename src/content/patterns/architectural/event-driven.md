---
title: "Event-Driven Architecture"
category: architectural
intent: "Decouple services by having producers emit domain events and consumers react to them asynchronously, without either knowing about the other."
goIdiomSummary: "In-process: Go channels or a simple event bus struct. Cross-service: publish to Kafka/NATS/SQS; consumers implement an idempotent handler interface."
relatedSlugs: ["cqrs", "domain-driven-design", "observer"]
tags: [interfaces, concurrency, events, distributed, testability]
---

# Event-Driven Architecture

Event-Driven Architecture solves the cascading failure problem of synchronous service calls: when service A calls B and C directly, a failure in C also fails A. With events, A publishes a fact and returns — B and C subscribe and react independently. A failed notification service can't block order placement.

The pattern spans both in-process (Go channels, event bus struct) and cross-service (Kafka, NATS, SQS) contexts. Hiding the difference behind a `Publisher` interface lets you start with an in-process bus and graduate to a broker when the system demands it.

## Problem

A monolithic order service calls the inventory service, the notification service, and the analytics service directly when an order is placed. Every new downstream concern means a new import and a new call site in the order service. If the notification service is down, the order fails. Testing the order service requires all downstream services to be running.

```go
// OrderService knows about every downstream concern — tight coupling
func (s *OrderService) PlaceOrder(ctx context.Context, orderID string) error {
    if err := s.inventoryService.Reserve(ctx, orderID); err != nil {
        return err
    }
    // Notification failure causes order to fail
    if err := s.notificationService.SendConfirmation(ctx, orderID); err != nil {
        return err
    }
    // Must update analytics synchronously
    s.analyticsService.RecordOrder(ctx, orderID)
    return nil
}
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

**In-process event bus** — zero dependencies, suits a single service with internal decoupling:

```go
// eventbus/bus.go
package eventbus

import "sync"

type Handler func(event interface{})

type Bus struct {
    mu       sync.RWMutex
    handlers map[string][]Handler
}

func New() *Bus {
    return &Bus{handlers: make(map[string][]Handler)}
}

func (b *Bus) Subscribe(eventType string, h Handler) {
    b.mu.Lock()
    defer b.mu.Unlock()
    b.handlers[eventType] = append(b.handlers[eventType], h)
}

func (b *Bus) Publish(eventType string, event interface{}) {
    b.mu.RLock()
    defer b.mu.RUnlock()
    for _, h := range b.handlers[eventType] {
        h(event)
    }
}
```

Define typed events:

```go
// events/order_events.go
package events

import "time"

const OrderPlaced = "order.placed"
const OrderShipped = "order.shipped"

type OrderPlacedEvent struct {
    OrderID    string
    CustomerID string
    Total      int64
    OccurredAt time.Time
}

type OrderShippedEvent struct {
    OrderID    string
    TrackingID string
    OccurredAt time.Time
}
```

Producer publishes — no knowledge of consumers:

```go
// service/order.go
package service

import (
    "context"
    "time"
    "myapp/eventbus"
    "myapp/events"
)

type OrderService struct {
    repo OrderRepository
    bus  *eventbus.Bus
}

func (s *OrderService) PlaceOrder(ctx context.Context, customerID string, total int64) (string, error) {
    o, err := s.repo.Create(ctx, customerID, total)
    if err != nil {
        return "", err
    }
    s.bus.Publish(events.OrderPlaced, events.OrderPlacedEvent{
        OrderID:    o.ID,
        CustomerID: customerID,
        Total:      total,
        OccurredAt: time.Now(),
    })
    return o.ID, nil
}
```

Consumers subscribe and react:

```go
// service/inventory.go
package service

import (
    "log"
    "myapp/eventbus"
    "myapp/events"
)

type InventoryService struct {
    repo InventoryRepository
}

func (s *InventoryService) RegisterHandlers(bus *eventbus.Bus) {
    bus.Subscribe(events.OrderPlaced, func(raw interface{}) {
        evt, ok := raw.(events.OrderPlacedEvent)
        if !ok {
            return
        }
        if err := s.repo.Reserve(evt.OrderID); err != nil {
            log.Printf("inventory: reserve failed for order %s: %v", evt.OrderID, err)
        }
    })
}
```

```go
// service/notification.go
package service

import (
    "log"
    "myapp/eventbus"
    "myapp/events"
)

type NotificationService struct {
    mailer Mailer
}

func (s *NotificationService) RegisterHandlers(bus *eventbus.Bus) {
    bus.Subscribe(events.OrderPlaced, func(raw interface{}) {
        evt, ok := raw.(events.OrderPlacedEvent)
        if !ok {
            return
        }
        if err := s.mailer.SendOrderConfirmation(evt.CustomerID, evt.OrderID); err != nil {
            log.Printf("notification: send failed for order %s: %v", evt.OrderID, err)
        }
    })
}
```

Wire up at startup — the only place that knows about all services:

```go
// main.go
func main() {
    bus := eventbus.New()

    orderRepo := postgres.NewOrderRepo(db)
    inventoryRepo := postgres.NewInventoryRepo(db)
    mailer := smtp.NewMailer(cfg.SMTP)

    orderSvc := service.NewOrderService(orderRepo, bus)
    inventorySvc := service.NewInventoryService(inventoryRepo)
    notifSvc := service.NewNotificationService(mailer)

    inventorySvc.RegisterHandlers(bus)
    notifSvc.RegisterHandlers(bus)

    // ...
}
```

**Cross-service with an interface** — swap in-process bus for NATS/Kafka without changing producers or consumers:

```go
// eventbus/publisher.go
package eventbus

import "context"

type Publisher interface {
    Publish(ctx context.Context, topic string, payload []byte) error
}

type Subscriber interface {
    Subscribe(ctx context.Context, topic string, handler func([]byte) error) error
}
```

```go
// infra/nats/publisher.go
package nats

import (
    "context"
    "github.com/nats-io/nats.go"
)

type Publisher struct{ conn *nats.Conn }

func (p *Publisher) Publish(_ context.Context, topic string, payload []byte) error {
    return p.conn.Publish(topic, payload)
}
```

Idempotent consumers protect against at-least-once delivery:

```go
// service/inventory.go
func (s *InventoryService) HandleOrderPlaced(ctx context.Context, evt events.OrderPlacedEvent) error {
    // Check if already processed (deduplication table or idempotency key)
    if s.repo.AlreadyReserved(evt.OrderID) {
        return nil // safe to re-process
    }
    return s.repo.Reserve(evt.OrderID)
}
```

## When to Use

- Services or components need to react to the same event independently without a central orchestrator knowing about all of them.
- You want producers to remain stable as new consumers are added — open/closed for extension.
- Downstream failures should not fail the producer — notification being down shouldn't block order placement.
- Workloads are naturally async: emails, inventory updates, analytics, audit logs.

## When Not to Use

- You need a synchronous response: the caller must know the result before proceeding (use direct calls or request/reply).
- The domain is simple and only one thing reacts to each action — the indirection adds complexity for no gain.
- Operational overhead of a message broker (Kafka, NATS) isn't justified — in-process channels or direct calls suffice.
- Debugging and tracing distributed events is more than the team can manage.

## Advantages

- Producers and consumers are decoupled — adding a new consumer doesn't change the producer.
- Downstream failures are isolated — a failed notification doesn't roll back the order.
- Natural audit trail — the event log is a history of everything that happened.
- Scales independently — consumers can be replicated or throttled without touching the producer.

## Disadvantages

- Eventual consistency — consumers may lag behind the producer; data isn't immediately consistent.
- At-least-once delivery means consumers must be idempotent, which adds complexity.
- Debugging is harder — a request fans out across multiple consumers with no single call stack.
- Schema coupling — event schema changes must be backwards compatible or consumers break.

## Related Patterns

- **Domain-Driven Design** — Domain Events are the natural producer for an event-driven system; aggregates record events as facts during state transitions, and the application layer dispatches them after the transaction commits.
- **CQRS** — Commands produce events; read-side projections consume those events to build denormalised views — the two patterns compose into a complete write-and-read model with a full audit history.
- **Circuit Breaker** — Wrap message broker publish calls in a circuit breaker; if the broker is unavailable, fail fast and route events to a dead-letter queue rather than blocking the producer.
- **Hexagonal Architecture** — The message broker is a driven adapter implementing a `Publisher` port; the event handler function is a driven port that the infrastructure layer implements.
