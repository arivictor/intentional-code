---
title: "Event-Driven Architecture"
category: architectural
intent: "Decouple services by having producers emit domain events and consumers react to them asynchronously, without either knowing about the other."
idiomSummary: "In-process: Go channels or a simple event bus struct. Cross-service: publish to Kafka/NATS/SQS; consumers implement an idempotent handler interface."
relatedSlugs: ["cqrs", "domain-driven-design", "observer"]
tags: [interfaces, concurrency, events, distributed, testability]
---

# Event-Driven Architecture

Event-Driven Architecture solves the cascading failure problem of synchronous service calls: when service A calls B and C directly, a failure in C also fails A. With events, A publishes a fact and returns, then B and C subscribe and react independently. A failed notification service can't block a file upload completing successfully.

The pattern spans both in-process (Go channels, event bus struct) and cross-service (Kafka, NATS, SQS) contexts. Hiding the difference behind a `Publisher` interface lets you start with an in-process bus and graduate to a broker when the system demands it.

## Problem

A file-processing service calls the notification service, the search indexer, and the audit logger directly when a file is uploaded. Every new downstream concern means a new import and a new call site in the upload service. If the notification service is down, the upload fails. Testing the upload service requires all downstream services to be running.

```go
// UploadService knows about every downstream concern — tight coupling
func (s *UploadService) ProcessUpload(ctx context.Context, fileID string) error {
    if err := s.store.Save(ctx, fileID); err != nil {
        return err
    }
    // Notification failure causes the whole upload to fail
    if err := s.notifier.SendConfirmation(ctx, fileID); err != nil {
        return err
    }
    // Must index synchronously even though the user doesn't need it immediately
    s.indexer.Index(ctx, fileID)
    s.audit.Log(ctx, fileID)
    return nil
}
```

## Solution

The upload service emits a `FileUploaded` event. Notifications, indexing, and audit log subscribe independently. Producers and consumers are decoupled at the event schema boundary.

```
Producer                     Event Bus / Queue                Consumers
┌──────────────┐             ┌──────────────────┐            ┌──────────────────┐
│ UploadService│──FileUploaded►                  ├───────────►│ NotifierService  │
└──────────────┘             │  (channel / NATS  │            └──────────────────┘
                             │   / Kafka / SQS)  ├───────────►┌──────────────────┐
                             │                   │            │  IndexerService  │
                             └──────────────────┘            └──────────────────┘
                                                  ───────────►┌──────────────────┐
                                                              │  AuditService    │
                                                              └──────────────────┘
```

**In-process event bus:** zero dependencies, good for a single service with internal decoupling:

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
// events/file_events.go
package events

import "time"

const FileUploaded = "file.uploaded"
const FileDeleted  = "file.deleted"

type FileUploadedEvent struct {
    FileID     string
    OwnerID    string
    SizeBytes  int64
    OccurredAt time.Time
}

type FileDeletedEvent struct {
    FileID     string
    OccurredAt time.Time
}
```

Producer publishes with no knowledge of consumers:

```go
// service/upload.go
package service

import (
    "context"
    "time"
    "myapp/eventbus"
    "myapp/events"
)

type FileStore interface {
    Save(ctx context.Context, fileID string, data []byte) error
}

type UploadService struct {
    store FileStore
    bus   *eventbus.Bus
}

func NewUploadService(store FileStore, bus *eventbus.Bus) *UploadService {
    return &UploadService{store: store, bus: bus}
}

func (s *UploadService) ProcessUpload(ctx context.Context, ownerID, fileID string, data []byte) error {
    if err := s.store.Save(ctx, fileID, data); err != nil {
        return err
    }
    s.bus.Publish(events.FileUploaded, events.FileUploadedEvent{
        FileID:     fileID,
        OwnerID:    ownerID,
        SizeBytes:  int64(len(data)),
        OccurredAt: time.Now(),
    })
    return nil
}
```

Consumers subscribe and react:

```go
// service/notifier.go
package service

import (
    "log"
    "myapp/eventbus"
    "myapp/events"
)

type Mailer interface {
    SendUploadConfirmation(ownerID, fileID string) error
}

type NotifierService struct {
    mailer Mailer
}

func (s *NotifierService) RegisterHandlers(bus *eventbus.Bus) {
    bus.Subscribe(events.FileUploaded, func(raw interface{}) {
        evt, ok := raw.(events.FileUploadedEvent)
        if !ok {
            return
        }
        if err := s.mailer.SendUploadConfirmation(evt.OwnerID, evt.FileID); err != nil {
            log.Printf("notifier: send failed for file %s: %v", evt.FileID, err)
        }
    })
}
```

```go
// service/indexer.go
package service

import (
    "log"
    "myapp/eventbus"
    "myapp/events"
)

type SearchIndex interface {
    Index(fileID string) error
}

type IndexerService struct {
    index SearchIndex
}

func (s *IndexerService) RegisterHandlers(bus *eventbus.Bus) {
    bus.Subscribe(events.FileUploaded, func(raw interface{}) {
        evt, ok := raw.(events.FileUploadedEvent)
        if !ok {
            return
        }
        if err := s.index.Index(evt.FileID); err != nil {
            log.Printf("indexer: index failed for file %s: %v", evt.FileID, err)
        }
    })
}
```

Wire it up at startup (the only place that needs to know about all services):

```go
// main.go
package main

import "myapp/eventbus"

func main() {
    bus := eventbus.New()

    // ... construct services ...

    notifier.RegisterHandlers(bus)
    indexer.RegisterHandlers(bus)
    auditor.RegisterHandlers(bus)

    // ...
}
```

**Cross-service with an interface:** swap the in-process bus for NATS or Kafka without changing producers or consumers:

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
// service/indexer.go
func (s *IndexerService) HandleFileUploaded(ctx context.Context, evt events.FileUploadedEvent) error {
    // Check if already processed (deduplication table or idempotency key)
    if s.index.AlreadyIndexed(evt.FileID) {
        return nil // safe to re-process
    }
    return s.index.Index(evt.FileID)
}
```

## Reliable Event Publishing: The Outbox Pattern

Publishing an event after writing to the database creates a dual-write problem: if the process crashes after the database commit but before the broker publish, the event is lost. If you publish to the broker first, a subsequent database failure leaves an event in the broker for a write that never persisted.

The Outbox Pattern solves this by writing the event to a database table in the same transaction as the main write. A separate relay process reads unpublished events and publishes them to the broker.

```sql
CREATE TABLE outbox_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic        TEXT NOT NULL,
    payload      JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ -- NULL means unpublished
);
```

Write to the outbox in the same transaction as the main change:

```go
// service/upload.go
func (s *UploadService) ProcessUpload(ctx context.Context, ownerID, fileID string, data []byte) error {
    tx, err := s.db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer tx.Rollback()

    if _, err := tx.ExecContext(ctx, "INSERT INTO files (id, owner_id) VALUES ($1, $2)", fileID, ownerID); err != nil {
        return err
    }

    payload, _ := json.Marshal(FileUploadedEvent{
        FileID: fileID, OwnerID: ownerID, SizeBytes: int64(len(data)),
    })
    if _, err := tx.ExecContext(ctx,
        "INSERT INTO outbox_events (topic, payload) VALUES ($1, $2)",
        FileUploaded, payload,
    ); err != nil {
        return err
    }

    return tx.Commit()
}
```

A relay goroutine polls for unpublished events and publishes them to the broker:

```go
// relay/outbox_relay.go
func (r *OutboxRelay) Run(ctx context.Context) {
    ticker := time.NewTicker(500 * time.Millisecond)
    defer ticker.Stop()
    for {
        select {
        case <-ticker.C:
            r.publishPending(ctx)
        case <-ctx.Done():
            return
        }
    }
}

func (r *OutboxRelay) publishPending(ctx context.Context) {
    rows, err := r.db.QueryContext(ctx,
        "SELECT id, topic, payload FROM outbox_events WHERE published_at IS NULL ORDER BY created_at LIMIT 100",
    )
    if err != nil {
        return
    }
    defer rows.Close()
    for rows.Next() {
        var id, topic string
        var payload []byte
        rows.Scan(&id, &topic, &payload)
        if err := r.broker.Publish(ctx, topic, payload); err != nil {
            continue // retry next tick
        }
        r.db.ExecContext(ctx,
            "UPDATE outbox_events SET published_at = NOW() WHERE id = $1", id,
        )
    }
}
```

At-least-once delivery is preserved: if the relay crashes after publishing but before updating `published_at`, the event is re-published on restart. Consumers must be idempotent. For production use, consider a CDC (change data capture) tool like Debezium that reads the Postgres write-ahead log directly, avoiding the polling overhead.

## When to Use

- Services or components need to react to the same event independently without a central orchestrator knowing about all of them.
- You want producers to remain stable as new consumers are added, which is a nice practical use of open/closed.
- Downstream failures should not fail the producer. A broken indexer shouldn't block file uploads.
- Workloads are naturally async: emails, search indexing, analytics, audit logs.

## When Not to Use

- You need a synchronous response: the caller must know the result before proceeding (use direct calls or request/reply).
- The domain is simple and only one thing reacts to each action, so the indirection adds complexity for no gain.
- Operational overhead of a message broker (Kafka, NATS) isn't justified. In-process channels or direct calls are enough.
- Debugging and tracing distributed events is more than the team can manage.

## Tradeoffs

The main benefit is isolation: producers stay stable as new consumers are added, and a failing consumer can't roll back the producer's work. The main cost is eventual consistency. Consumers may lag behind the producer, so the indexer may not see a newly uploaded file immediately. This surprises users who expect their own write to be reflected right away. At-least-once delivery means every consumer must be idempotent, which isn't hard to implement but is easy to forget when adding a new handler.

Schema coupling is the subtler ongoing cost: event schemas need to stay backward compatible or consumers break silently, requiring deliberate versioning discipline that pure function call contracts don't. The rules: add new fields additively and never remove or rename existing ones; use pointer types (`*string`, `*int`) for optional new fields so producers that omit the field produce valid JSON that older consumers can still decode; use a `Version` field to dispatch consumers to different deserialization paths when a structural change is unavoidable. Go's `json.Unmarshal` ignores unknown fields by default, which means producers can add fields without coordinating consumer deploys, as long as you never remove fields that consumers already depend on.

## Related Patterns

- **Domain-Driven Design:** Domain Events are a natural producer for an event-driven system. Aggregates record events as facts during state transitions, and the application layer dispatches them after the transaction commits.
- **CQRS:** Commands produce events, and read-side projections consume those events to build denormalized views. Together they give you a full write and read model with a useful audit history.
- **Circuit Breaker:** Wrap message broker publish calls in a circuit breaker. If the broker is unavailable, fail fast and route events to a dead-letter queue instead of blocking the producer.
- **Hexagonal Architecture:** The message broker is a driven adapter implementing a `Publisher` port, and the event handler function is another driven port implemented by the infrastructure layer.
- **Observer:** Event-Driven Architecture is the distributed, cross-process form of the Observer pattern. Observer is in-process with direct method calls; Event-Driven adds a broker, serialization, and at-least-once delivery semantics.
