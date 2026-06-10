---
title: "Transactional Outbox"
description: "Publish events reliably by writing them to an outbox table in the same database transaction as your state change, then relaying them to the broker — eliminating the dual-write problem between database and message bus."
---

# Transactional Outbox

**Buys an event recorded atomically with the state change, killing the dual-write; pays in delivery latency, a relay to operate, and at-least-once dedup downstream.**

You change some state in your database and you need to tell the rest of the system about it — publish an `OrderPlaced` event to Kafka, NATS, or SQS. The trap is the **dual write**: writing to the database and publishing to the broker are two separate systems with no shared transaction. If the database commit succeeds but the publish fails (or the process crashes in between), the state changed but nobody heard about it. If you publish first and the commit fails, you announced something that never happened.

The Transactional Outbox solves this by making the event part of the same database transaction as the state change. You write the business row and an `outbox` row atomically. A separate **relay** process then reads unpublished outbox rows and delivers them to the broker, marking each as published once the broker accepts it. The database is the single source of truth; the broker is eventually, reliably caught up. The mirror-image pattern on the consumer side — an **inbox** table that records processed message IDs to deduplicate redeliveries — gives you exactly-once *effects* on top of at-least-once delivery.

## Scenario

The order service saves an order and then publishes an event. Two writes, no shared transaction.

```go
// The dual-write problem.
func (s *OrderService) Place(ctx context.Context, o Order) error {
    if err := s.db.SaveOrder(ctx, o); err != nil {
        return err
    }
    // If the process crashes HERE, the order exists but no event is published.
    // Inventory is never reserved, the confirmation email never sends.
    if err := s.broker.Publish(ctx, "orders", o.Event()); err != nil {
        // And if we publish first and the DB commit fails, it's worse:
        // we've announced an order that doesn't exist.
        return err
    }
    return nil
}
```

## Solution

Write the order and the event to the database in one transaction. A relay polls the outbox and publishes, retrying until the broker accepts each row.

```text:title="diagram"
   ┌──────────── one DB transaction ────────────┐
   │  INSERT INTO orders ...                     │
   │  INSERT INTO outbox (topic, payload) ...    │  ← atomic: both or neither
   └─────────────────────────────────────────────┘
                      │
              (relay polls outbox)
                      ▼
        unpublished rows ──publish──► broker ──ack──► mark published
                                       │
                                  (failure → row stays, retried next poll)
```

```go:title="main.go":run=true:editable=true
package main

import (
	"errors"
	"fmt"
	"sync"
)

// --- An in-memory "database" with two tables: orders and an outbox. ---
// The key property: a single Tx writes both atomically. The business row and
// the event-to-publish commit together, or not at all.

type Order struct {
	ID     string
	Amount int
}

type OutboxRow struct {
	ID        int
	Topic     string
	Payload   string
	Published bool
}

type DB struct {
	mu     sync.Mutex
	orders map[string]Order
	outbox []OutboxRow
	nextID int
}

func NewDB() *DB {
	return &DB{orders: map[string]Order{}, nextID: 1}
}

// SaveOrderTx writes the order and an outbox event in one critical section,
// standing in for a real SQL transaction (BEGIN ... COMMIT).
func (db *DB) SaveOrderTx(o Order, topic, payload string) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if _, exists := db.orders[o.ID]; exists {
		return errors.New("duplicate order")
	}
	db.orders[o.ID] = o
	db.outbox = append(db.outbox, OutboxRow{ID: db.nextID, Topic: topic, Payload: payload})
	db.nextID++
	return nil
}

func (db *DB) unpublished() []OutboxRow {
	db.mu.Lock()
	defer db.mu.Unlock()
	var out []OutboxRow
	for _, r := range db.outbox {
		if !r.Published {
			out = append(out, r)
		}
	}
	return out
}

func (db *DB) markPublished(id int) {
	db.mu.Lock()
	defer db.mu.Unlock()
	for i := range db.outbox {
		if db.outbox[i].ID == id {
			db.outbox[i].Published = true
		}
	}
}

// --- The relay polls the outbox and publishes to the broker, then marks the
// row published. If publishing fails, the row stays and is retried next poll:
// at-least-once delivery. ---

type Broker struct{ delivered []string }

func (b *Broker) Publish(topic, payload string) error {
	b.delivered = append(b.delivered, topic+":"+payload)
	return nil
}

func relayOnce(db *DB, broker *Broker) {
	for _, row := range db.unpublished() {
		if err := broker.Publish(row.Topic, row.Payload); err != nil {
			continue // leave it for the next poll
		}
		db.markPublished(row.ID)
	}
}

func main() {
	db := NewDB()
	broker := &Broker{}

	// Business operation: persist the order and the event together.
	_ = db.SaveOrderTx(Order{ID: "ord-1", Amount: 100}, "orders", "ord-1 placed")
	_ = db.SaveOrderTx(Order{ID: "ord-2", Amount: 250}, "orders", "ord-2 placed")
	fmt.Printf("pending in outbox: %d\n", len(db.unpublished()))

	// The relay runs (here, synchronously; in production, a background loop).
	relayOnce(db, broker)

	fmt.Printf("pending after relay: %d\n", len(db.unpublished()))
	for _, msg := range broker.delivered {
		fmt.Printf("delivered: %s\n", msg)
	}
}
```

```
// Output:
// pending in outbox: 2
// pending after relay: 0
// delivered: orders:ord-1 placed
// delivered: orders:ord-2 placed
```

In production the relay is one of two designs. **Polling** (above) runs a background loop — `SELECT ... WHERE published = false ORDER BY id LIMIT n FOR UPDATE SKIP LOCKED` — simple and database-agnostic, at the cost of polling latency and load. **Change Data Capture (CDC)** tails the database's write-ahead log instead; tools like Debezium stream committed `outbox` inserts straight to Kafka with no polling. CDC scales better and adds lower latency but is more infrastructure to operate.

```sql
-- The outbox table. Index on (published, id) for the relay's poll query.
CREATE TABLE outbox (
    id         BIGSERIAL PRIMARY KEY,
    topic      TEXT        NOT NULL,
    payload    JSONB       NOT NULL,
    published  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Because the relay can crash after publishing but before marking a row, delivery is **at-least-once**: the same event may be published twice. Consumers must therefore be idempotent — which is exactly what the **inbox** table provides. Each consumer records the IDs of messages it has processed (in the same transaction as its own state change) and skips any it has seen before.

## When to Use

- You must publish events or messages reliably as a consequence of a database change, and losing or duplicating-without-control is unacceptable.
- You're building an [Event-Driven](/go/patterns/architectural/event-driven), [Event Sourcing](/go/patterns/architectural/event-sourcing), or [Saga](/go/patterns/architectural/saga) system where downstream steps depend on every state change being announced.
- Your database supports transactions (so the business row and outbox row commit atomically).
- You can tolerate at-least-once delivery and make consumers idempotent.

## When Not to Use

- The event is purely advisory and an occasional lost message is harmless (best-effort notifications, metrics). The machinery isn't worth it.
- Producer and consumer share the same database and transaction already — just do the work in that transaction; you don't need a broker hop.
- Your "database" has no multi-row transactional guarantee, so the atomic write the pattern depends on isn't available.
- Strict ordering across many partitions is required and your relay can't preserve it cheaply; you may need a different delivery design.

## Tradeoffs

The outbox guarantees the event is *recorded* atomically with the state change, but delivery is still at-least-once and asynchronous. You're buying reliability with two costs: **latency** (the event lands on the broker after a poll interval or CDC lag, not instantly) and **operational weight** (a relay process or CDC pipeline to run, monitor, and keep from falling behind).

Idempotency moves downstream: every consumer must dedupe, typically via an inbox table. Ordering needs care too — a naive relay can reorder events; preserve order with a monotonic sequence and per-key processing where it matters.

Finally, watch the outbox table's growth. Mark-and-keep is simplest for auditing but the table grows unbounded; add a retention job (or `DELETE` on publish) so it doesn't become a performance problem.

## Related Patterns

- **Event-Driven Architecture:** The outbox is *how* a producer reliably emits the domain events an event-driven system runs on. Without it, the producer's dual write is the weak link in the whole design.
- **Saga:** Choreographed sagas depend on each step's event actually being published; the outbox guarantees that the local commit and its triggering event are atomic, so the saga can't silently stall.
- **Event Sourcing:** Related but distinct. Event sourcing makes events the source of truth *inside* the service; the outbox reliably gets events *out* to other services. They're often used together.
- **Pub/Sub:** The outbox feeds the broker that pub/sub topics are built on. Outbox solves reliable *production*; pub/sub solves *distribution* to multiple subscribers.
- **Retry:** The relay is a retry loop: it re-attempts delivery until the broker acknowledges, which is what makes the guarantee at-least-once.
