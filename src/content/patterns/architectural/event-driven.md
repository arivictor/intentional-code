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

**In-process event bus:** zero dependencies, good for a single service with internal decoupling.

The following is a single runnable file combining the event bus, typed events, producer, and consumers:

```go
package main

import (
	"fmt"
	"log"
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
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, h := range b.handlers[eventType] {
		h(event)
	}
}

// --- Typed events ---

const FileUploaded = "file.uploaded"

type FileUploadedEvent struct {
	FileID     string
	OwnerID    string
	SizeBytes  int64
	OccurredAt time.Time
}

// --- Producer: publishes events with no knowledge of consumers ---

type FileStore interface {
	Save(fileID string, data []byte) error
}

type MemFileStore struct{ files map[string][]byte }

func (s *MemFileStore) Save(fileID string, data []byte) error {
	s.files[fileID] = data
	return nil
}

type UploadService struct {
	store FileStore
	bus   *Bus
}

func (s *UploadService) ProcessUpload(ownerID, fileID string, data []byte) error {
	if err := s.store.Save(fileID, data); err != nil {
		return err
	}
	s.bus.Publish(FileUploaded, FileUploadedEvent{
		FileID:     fileID,
		OwnerID:    ownerID,
		SizeBytes:  int64(len(data)),
		OccurredAt: time.Now(),
	})
	return nil
}

// --- Consumers: subscribe independently, no knowledge of each other ---

type NotifierService struct{}

func (s *NotifierService) RegisterHandlers(bus *Bus) {
	bus.Subscribe(FileUploaded, func(raw interface{}) {
		evt, ok := raw.(FileUploadedEvent)
		if !ok {
			return
		}
		// In production this would send email; here we just log.
		log.Printf("notifier: confirming upload %s for owner %s", evt.FileID, evt.OwnerID)
	})
}

type IndexerService struct{ indexed []string }

func (s *IndexerService) RegisterHandlers(bus *Bus) {
	bus.Subscribe(FileUploaded, func(raw interface{}) {
		evt, ok := raw.(FileUploadedEvent)
		if !ok {
			return
		}
		s.indexed = append(s.indexed, evt.FileID)
		log.Printf("indexer: indexed %s (%d bytes)", evt.FileID, evt.SizeBytes)
	})
}

type AuditService struct{ log []string }

func (s *AuditService) RegisterHandlers(bus *Bus) {
	bus.Subscribe(FileUploaded, func(raw interface{}) {
		evt, ok := raw.(FileUploadedEvent)
		if !ok {
			return
		}
		s.log = append(s.log, fmt.Sprintf("%s uploaded by %s", evt.FileID, evt.OwnerID))
	})
}

func main() {
	bus := NewBus()

	notifier := &NotifierService{}
	indexer := &IndexerService{}
	auditor := &AuditService{}

	notifier.RegisterHandlers(bus)
	indexer.RegisterHandlers(bus)
	auditor.RegisterHandlers(bus)

	upload := &UploadService{
		store: &MemFileStore{files: make(map[string][]byte)},
		bus:   bus,
	}

	upload.ProcessUpload("alice", "file-001", []byte("hello world"))
	upload.ProcessUpload("bob", "file-002", []byte("another file"))

	fmt.Println("indexed:", indexer.indexed)
	fmt.Println("audit log:", auditor.log)
}
```

```
// Output (log lines may vary in order):
// notifier: confirming upload file-001 for owner alice
// indexer: indexed file-001 (11 bytes)
// notifier: confirming upload file-002 for owner bob
// indexer: indexed file-002 (12 bytes)
// indexed: [file-001 file-002]
// audit log: [file-001 uploaded by alice file-002 uploaded by bob]
```

**Cross-service with an interface:** swap the in-process bus for NATS or Kafka without changing producers or consumers (illustrative — requires an external broker):

```go
// Illustrative only — shows the Publisher/Subscriber interface for cross-service use.
// The in-process Bus above satisfies the same contract for single-service use.
//
// type Publisher interface {
//     Publish(ctx context.Context, topic string, payload []byte) error
// }
//
// type Subscriber interface {
//     Subscribe(ctx context.Context, topic string, handler func([]byte) error) error
// }
//
// // NATS adapter — swap in by changing the constructor argument, not the business logic.
// type NATSPublisher struct{ conn *nats.Conn }
//
// func (p *NATSPublisher) Publish(_ context.Context, topic string, payload []byte) error {
//     return p.conn.Publish(topic, payload)
// }
```

Idempotent consumers protect against at-least-once delivery (illustrative):

```go
// Idempotency check — every consumer should guard against duplicate delivery.
// In production, track processed event IDs in a database or cache.
//
// func (s *IndexerService) HandleFileUploaded(evt FileUploadedEvent) error {
//     if s.alreadyIndexed(evt.FileID) {
//         return nil // safe to re-deliver
//     }
//     return s.index(evt.FileID)
// }
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

Write to the outbox in the same transaction as the main change (illustrative — requires a real database):

```go
// Illustrative only — requires a sql.DB and a broker to run.
// func (s *UploadService) ProcessUpload(ctx context.Context, ownerID, fileID string, data []byte) error {
//     tx, err := s.db.BeginTx(ctx, nil)
//     if err != nil { return err }
//     defer tx.Rollback()
//
//     if _, err := tx.ExecContext(ctx,
//         "INSERT INTO files (id, owner_id) VALUES ($1, $2)", fileID, ownerID,
//     ); err != nil { return err }
//
//     payload, _ := json.Marshal(FileUploadedEvent{
//         FileID: fileID, OwnerID: ownerID, SizeBytes: int64(len(data)),
//     })
//     if _, err := tx.ExecContext(ctx,
//         "INSERT INTO outbox_events (topic, payload) VALUES ($1, $2)", FileUploaded, payload,
//     ); err != nil { return err }
//
//     return tx.Commit()
// }
```

A relay goroutine polls for unpublished events and publishes them to the broker (illustrative):

```go
// Illustrative only — requires a sql.DB and a broker to run.
// func (r *OutboxRelay) Run(ctx context.Context) {
//     ticker := time.NewTicker(500 * time.Millisecond)
//     defer ticker.Stop()
//     for {
//         select {
//         case <-ticker.C:
//             r.publishPending(ctx)
//         case <-ctx.Done():
//             return
//         }
//     }
// }
//
// func (r *OutboxRelay) publishPending(ctx context.Context) {
//     rows, err := r.db.QueryContext(ctx,
//         "SELECT id, topic, payload FROM outbox_events WHERE published_at IS NULL ORDER BY created_at LIMIT 100",
//     )
//     if err != nil { return }
//     defer rows.Close()
//     for rows.Next() {
//         var id, topic string
//         var payload []byte
//         rows.Scan(&id, &topic, &payload)
//         if err := r.broker.Publish(ctx, topic, payload); err != nil {
//             continue // retry next tick
//         }
//         r.db.ExecContext(ctx, "UPDATE outbox_events SET published_at = NOW() WHERE id = $1", id)
//     }
// }
```

At-least-once delivery is preserved: if the relay crashes after publishing but before updating `published_at`, the event is re-published on restart — consumers must be idempotent. For production use, consider a CDC (change data capture) tool like Debezium that reads the Postgres write-ahead log directly, avoiding the polling overhead.

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

The main benefit is isolation: producers stay stable as new consumers are added, and a failing consumer can't roll back the producer's work. The main cost is eventual consistency — consumers may lag behind the producer, so the indexer may not see a newly uploaded file immediately, and this surprises users who expect their own write to be immediately reflected. At-least-once delivery means every consumer must be idempotent, which isn't hard to implement but is easy to forget when adding a new handler. Schema coupling is the subtler ongoing cost: event schemas need to stay backward compatible or consumers break silently, requiring deliberate versioning discipline that pure function call contracts don't. The rules: add new fields additively and never remove or rename existing ones; use pointer types (`*string`, `*int`) for optional new fields so producers that omit the field produce valid JSON that older consumers can still decode; use a `Version` field to dispatch consumers to different deserialization paths when a structural change is unavoidable. Go's `json.Unmarshal` ignores unknown fields by default, which means producers can add fields without coordinating consumer deploys — as long as you never remove fields that consumers already depend on.

## Related Patterns

- **Domain-Driven Design** — Domain Events are a natural producer for an event-driven system. Aggregates record events as facts during state transitions, and the application layer dispatches them after the transaction commits.
- **CQRS** — Commands produce events, and read-side projections consume those events to build denormalized views. Together they give you a full write and read model with a useful audit history.
- **Circuit Breaker** — Wrap message broker publish calls in a circuit breaker. If the broker is unavailable, fail fast and route events to a dead-letter queue instead of blocking the producer.
- **Hexagonal Architecture** — The message broker is a driven adapter implementing a `Publisher` port, and the event handler function is another driven port implemented by the infrastructure layer.
- **Observer** — Event-Driven Architecture is the distributed, cross-process form of the Observer pattern. Observer is in-process with direct method calls; Event-Driven adds a broker, serialization, and at-least-once delivery semantics.
