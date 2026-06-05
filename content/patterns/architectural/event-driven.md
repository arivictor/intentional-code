---
title: "Event-Driven Architecture"
description: "Decouple services by having producers emit domain events and consumers react to them asynchronously, without either knowing about the other."
---

# Event-Driven Architecture

Event-Driven Architecture helps you avoid chain-reaction failures from direct service calls. In a synchronous flow, if service `A` calls `B` and `C`, a failure in `C` can make `A` fail too. With events, `A` publishes a fact (for example, `FileUploaded`) and returns. `B` and `C` handle that event on their own. If notifications fail, the upload can still succeed.

This pattern works in both small and large systems. Inside one service, you can use Go channels or a simple event bus struct. Across services, you can use Kafka, NATS, or SQS. A `Publisher` interface hides those transport details, so you can start with an in-process bus and move to a broker later without rewriting your core business logic.

## Scenario

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
┌──────────────┐           ┌───────────────────┐       ┌──────────────────┐
│ UploadService│──Event───►│                   ├──────►│ NotifierService  │
└──────────────┘           │  (channel / NATS  │       └──────────────────┘
                           │   / Kafka / SQS)  ├──────►┌──────────────────┐
                           │                   │       │  IndexerService  │
                           └───────────────────┘       └──────────────────┘
                                                ──────►┌──────────────────┐
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
package gomark

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

Here's the whole flow as one runnable program — the bus, a typed event, a producer that knows nothing about its consumers, and two independent subscribers:

```go:title="main.go":run=true
package main

import (
	"fmt"
	"sync"
	"time"
)

// --- Event bus ---

type Handler func(event interface{})

type Bus struct {
	mu       sync.RWMutex
	handlers map[string][]Handler
}

func NewBus() *Bus {
	return &Bus{handlers: make(map[string][]Handler)}
}

func (b *Bus) Subscribe(eventType string, h Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[eventType] = append(b.handlers[eventType], h)
}

func (b *Bus) Publish(eventType string, event interface{}) {
	// Copy the handler slice under the lock, then release it before invoking
	// handlers: a handler that subscribes (needs the write lock) would deadlock
	// otherwise, and we don't want to hold the lock for the duration of their work.
	b.mu.RLock()
	handlers := append([]Handler(nil), b.handlers[eventType]...)
	b.mu.RUnlock()
	for _, h := range handlers {
		h(event)
	}
}

// --- Typed event ---

const FileUploaded = "file.uploaded"

type FileUploadedEvent struct {
	FileID     string
	OwnerID    string
	SizeBytes  int64
	OccurredAt time.Time
}

// --- Producer: knows nothing about its consumers ---

type UploadService struct {
	bus *Bus
}

func (s *UploadService) ProcessUpload(ownerID, fileID string, data []byte) {
	// ... persist the file, then publish a fact and return ...
	s.bus.Publish(FileUploaded, FileUploadedEvent{
		FileID:     fileID,
		OwnerID:    ownerID,
		SizeBytes:  int64(len(data)),
		OccurredAt: time.Now(),
	})
}

func main() {
	bus := NewBus()

	// Two independent consumers subscribe to the same fact.
	bus.Subscribe(FileUploaded, func(raw interface{}) {
		evt := raw.(FileUploadedEvent)
		fmt.Printf("notifier: emailing owner %s about file %s\n", evt.OwnerID, evt.FileID)
	})
	bus.Subscribe(FileUploaded, func(raw interface{}) {
		evt := raw.(FileUploadedEvent)
		fmt.Printf("indexer: indexing file %s (%d bytes)\n", evt.FileID, evt.SizeBytes)
	})

	upload := &UploadService{bus: bus}
	upload.ProcessUpload("owner-7", "file-42", []byte("hello world"))
}
```

```
// Output:
// notifier: emailing owner owner-7 about file file-42
// indexer: indexing file file-42 (11 bytes)
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

- Downstream failures are rolling back the producer's work. A broken notification service failing an upload is the canonical forcing function — events let the upload complete regardless of what consumers do.
- Multiple consumers react to the same fact and the producer shouldn't know who they are. Adding a consumer means subscribing, not modifying the producer.
- Workloads are naturally async: emails, search indexing, analytics, audit logs. None of these need to complete before the user's operation returns.
- You need the producer to remain stable as new consumers are added — events make this open/closed by default.

## When Not to Use

- You need a synchronous response: the caller must know the result before proceeding (use direct calls or request/reply).
- The domain is simple and only one thing reacts to each action, so the indirection adds complexity for no gain.
- Operational overhead of a message broker (Kafka, NATS) isn't justified. In-process channels or direct calls are enough.
- Debugging and tracing distributed events is more than the team can manage.

## The Decision

Events are usually worth it for one of two reasons: downstream failures are breaking the producer (for example, a broken indexer causes upload to fail), or adding a new consumer forces you to edit producer code. If neither problem exists, direct calls are usually simpler. Events give you decoupling and fault isolation, but you pay with eventual consistency and more operational work. Make sure you need that trade before adopting the pattern.

The biggest benefit is isolation. Producers can stay unchanged while you add consumers, and one bad consumer does not undo producer work. The biggest cost is eventual consistency. Consumers can run behind, so a just-uploaded file may not appear in search immediately. Users often notice this because they expect read-after-write behavior. Also, broker delivery is often at-least-once, so every consumer must be idempotent. That is straightforward to build, but easy to forget when adding new handlers.

Another ongoing cost is schema compatibility. Event schemas must stay backward compatible, or consumers can break without obvious errors. The safe rules are: only add fields, do not remove or rename existing fields, and treat structural changes as versioned changes. For optional new fields, use pointer types such as `*string` or `*int`, so older producers can omit them and consumers can still decode valid JSON. When you need a structural change, add a `Version` field and route to different decode paths. Go helps here because `json.Unmarshal` ignores unknown fields by default, so producers can add fields without coordinating deploys, as long as you do not remove fields consumers already use.

## Related Patterns

- **Domain-Driven Design:** Domain Events are a natural producer for an event-driven system. Aggregates record events as facts during state transitions, and the application layer dispatches them after the transaction commits.
- **CQRS:** Commands produce events, and read-side projections consume those events to build denormalised views. Together they give you a full write and read model with a useful audit history.
- **Circuit Breaker:** Wrap message broker publish calls in a circuit breaker. If the broker is unavailable, fail fast and route events to a dead-letter queue instead of blocking the producer.
- **Hexagonal Architecture:** The message broker is a driven adapter implementing a `Publisher` port, and the event handler function is another driven port implemented by the infrastructure layer.
- **Observer:** Event-Driven Architecture is the distributed, cross-process form of the Observer pattern. Observer is in-process with direct method calls; Event-Driven adds a broker, serialization, and at-least-once delivery semantics.
