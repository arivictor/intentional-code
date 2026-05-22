---
title: "Event Sourcing"
category: architectural
intent: "Store state as an append-only log of domain events, and derive current state by replaying them, rather than storing only the current snapshot."
idiomSummary: "Append-only event store (Postgres table or EventStoreDB); aggregate loads by replaying its event slice; periodic snapshots cap replay cost."
relatedSlugs: ["cqrs", "event-driven", "domain-driven-design"]
tags: [events, distributed, interfaces, dependency-inversion]
---

# Event Sourcing

Most systems store the current state of an entity. Event Sourcing stores the history of what happened to it instead, and derives current state by replaying that history. Instead of a row that says `balance = 420`, the account aggregate has an event log: `AccountOpened`, `MoneyDeposited(500)`, `MoneyWithdrawn(80)` — and the balance is the sum of those events.

The audit log is free. Time-travel debugging is built in. You can replay events through a new projection to answer questions you didn't think to ask when the system was built. These benefits come with real costs: queries are harder (read models need projections), replaying long histories is slow without snapshots, and schema evolution for events requires careful versioning.

Event Sourcing pairs naturally with [CQRS](/go/patterns/architectural/cqrs): the command side appends events, and the query side subscribes to the event log to build denormalized read models.

## Problem

A bank account stores only its current balance. When a dispute arises, there's no record of how that balance was reached. Adding an audit log after the fact is a separate system to maintain. Replaying "what would the balance have been at 3pm on Tuesday?" requires either expensive queries across an audit table or simply isn't possible.

```go
// account.go — current-state model; history is gone
type Account struct {
    ID      string
    Balance int
}

func (a *Account) Deposit(amount int) {
    a.Balance += amount
    // What happened, when, and why? Lost forever.
}

func (a *Account) Withdraw(amount int) error {
    if amount > a.Balance {
        return errors.New("insufficient funds")
    }
    a.Balance -= amount
    return nil
}
```

## Solution

Define domain events as immutable value types. The aggregate applies events to update in-memory state, and appends those events to the store.

```
Command           Aggregate              Event Store
   │                  │                      │
Deposit(100)──────►Apply──────AppendEvent──►[AccountOpened]
                    │                        [MoneyDeposited(500)]
                    │                        [MoneyWithdrawn(80)]
                    │                        [MoneyDeposited(100)]
                    │
                  State:
                  balance=520
```

The following is a single runnable file with the aggregate, in-memory event store, and a command handler:

```go
package main

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// --- Domain events ---

type EventType string

const (
	EventAccountOpened  EventType = "AccountOpened"
	EventMoneyDeposited EventType = "MoneyDeposited"
	EventMoneyWithdrawn EventType = "MoneyWithdrawn"
)

type Event struct {
	Type      EventType
	OccuredAt time.Time
	Data      any
}

type AccountOpenedData struct{ InitialBalance int }
type MoneyDepositedData struct{ Amount int }
type MoneyWithdrawnData struct{ Amount int }

// --- Aggregate ---

type Account struct {
	ID      string
	Balance int
	changes []Event // uncommitted events
}

func NewAccount(id string, initial int) *Account {
	a := &Account{ID: id}
	a.apply(Event{
		Type:      EventAccountOpened,
		OccuredAt: time.Now(),
		Data:      AccountOpenedData{InitialBalance: initial},
	})
	return a
}

func (a *Account) Deposit(amount int) {
	a.apply(Event{
		Type:      EventMoneyDeposited,
		OccuredAt: time.Now(),
		Data:      MoneyDepositedData{Amount: amount},
	})
}

func (a *Account) Withdraw(amount int) error {
	if amount > a.Balance {
		return errors.New("insufficient funds")
	}
	a.apply(Event{
		Type:      EventMoneyWithdrawn,
		OccuredAt: time.Now(),
		Data:      MoneyWithdrawnData{Amount: amount},
	})
	return nil
}

// apply updates in-memory state and records the event for persistence.
func (a *Account) apply(e Event) {
	switch d := e.Data.(type) {
	case AccountOpenedData:
		a.Balance = d.InitialBalance
	case MoneyDepositedData:
		a.Balance += d.Amount
	case MoneyWithdrawnData:
		a.Balance -= d.Amount
	}
	a.changes = append(a.changes, e)
}

// ApplyEvent replays a persisted event without recording it to changes.
func (a *Account) ApplyEvent(e Event) {
	switch d := e.Data.(type) {
	case AccountOpenedData:
		a.Balance = d.InitialBalance
	case MoneyDepositedData:
		a.Balance += d.Amount
	case MoneyWithdrawnData:
		a.Balance -= d.Amount
	}
}

func (a *Account) Changes() []Event { return a.changes }
func (a *Account) ClearChanges()    { a.changes = nil }

// --- In-memory event store ---

type EventStore interface {
	Append(ctx context.Context, aggregateID string, events []Event) error
	Load(ctx context.Context, aggregateID string) ([]Event, error)
}

type MemEventStore struct {
	mu     sync.Mutex
	events map[string][]Event
}

func NewMemEventStore() *MemEventStore {
	return &MemEventStore{events: make(map[string][]Event)}
}

func (s *MemEventStore) Append(_ context.Context, id string, events []Event) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events[id] = append(s.events[id], events...)
	return nil
}

func (s *MemEventStore) Load(_ context.Context, id string) ([]Event, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Event(nil), s.events[id]...), nil
}

func ReplayAccount(events []Event) *Account {
	a := &Account{}
	for _, e := range events {
		a.ApplyEvent(e)
	}
	return a
}

// --- Command handler ---

type DepositCommand struct {
	AccountID string
	Amount    int
}

type WithdrawCommand struct {
	AccountID string
	Amount    int
}

type AccountCommandHandler struct {
	store EventStore
}

func (h *AccountCommandHandler) HandleDeposit(ctx context.Context, cmd DepositCommand) error {
	events, err := h.store.Load(ctx, cmd.AccountID)
	if err != nil {
		return err
	}
	account := ReplayAccount(events)
	account.Deposit(cmd.Amount)
	return h.store.Append(ctx, cmd.AccountID, account.Changes())
}

func (h *AccountCommandHandler) HandleWithdraw(ctx context.Context, cmd WithdrawCommand) error {
	events, err := h.store.Load(ctx, cmd.AccountID)
	if err != nil {
		return err
	}
	account := ReplayAccount(events)
	if err := account.Withdraw(cmd.Amount); err != nil {
		return err
	}
	return h.store.Append(ctx, cmd.AccountID, account.Changes())
}

func main() {
	ctx := context.Background()
	store := NewMemEventStore()

	// Bootstrap: open account by seeding the event store with its first event.
	seed := NewAccount("acc-1", 500)
	store.Append(ctx, "acc-1", seed.Changes())

	handler := &AccountCommandHandler{store: store}

	handler.HandleDeposit(ctx, DepositCommand{AccountID: "acc-1", Amount: 200})
	handler.HandleWithdraw(ctx, WithdrawCommand{AccountID: "acc-1", Amount: 80})

	// Replay from scratch to get current state
	events, _ := store.Load(ctx, "acc-1")
	account := ReplayAccount(events)
	fmt.Printf("account acc-1 balance: %d\n", account.Balance)
	fmt.Printf("event log (%d events):\n", len(events))
	for _, e := range events {
		fmt.Printf("  %s %+v\n", e.Type, e.Data)
	}

	// Withdrawal beyond balance
	if err := handler.HandleWithdraw(ctx, WithdrawCommand{AccountID: "acc-1", Amount: 10000}); err != nil {
		fmt.Println("withdrawal error:", err)
	}
}
```

```
// Output:
// account acc-1 balance: 620
// event log (3 events):
//   AccountOpened {InitialBalance:500}
//   MoneyDeposited {Amount:200}
//   MoneyWithdrawn {Amount:80}
// withdrawal error: insufficient funds
```

Snapshots cap replay cost when event histories grow long (illustrative):

```go
// Illustrative only — shows the snapshot strategy. In production, store snapshots
// in a database table and load them before replaying only the events that follow.
//
// type Snapshot struct {
//     AggregateID string
//     Balance     int
//     EventCount  int // how many events are represented by this snapshot
// }
//
// func (h *AccountCommandHandler) HandleDepositWithSnapshot(ctx context.Context, cmd DepositCommand) error {
//     snap, _ := h.snapshots.Load(ctx, cmd.AccountID)
//     events, err := h.store.LoadFrom(ctx, cmd.AccountID, snap.EventCount)
//     if err != nil { return err }
//     account := &Account{Balance: snap.Balance}
//     for _, e := range events { account.ApplyEvent(e) }
//     account.Deposit(cmd.Amount)
//     if err := h.store.Append(ctx, cmd.AccountID, account.Changes()); err != nil { return err }
//     if len(events)+len(account.Changes()) > 100 {
//         h.snapshots.Save(ctx, Snapshot{
//             AggregateID: cmd.AccountID,
//             Balance:     account.Balance,
//             EventCount:  snap.EventCount + len(events) + len(account.Changes()),
//         })
//     }
//     return nil
// }
```

## Concurrency and Optimistic Locking

When two commands modify the same aggregate concurrently, the second write must detect that the first has already changed the stream. Without a check, both commands load the same events, both produce new events at the same version, and both append — the second write silently overwrites the first.

The fix is optimistic locking: `Append` accepts an `expectedVersion` (the length of events loaded), and the store rejects writes where the stream has advanced beyond that version (illustrative — shows the interface extension):

```go
// Illustrative — extends the EventStore interface with optimistic locking.
// var ErrVersionConflict = errors.New("optimistic lock conflict: stream was modified")
//
// type EventStore interface {
//     // Append fails with ErrVersionConflict if the stream has more events than expectedVersion.
//     Append(ctx context.Context, aggregateID string, expectedVersion int, events []Event) error
//     Load(ctx context.Context, aggregateID string) ([]Event, error)
// }
```

The command handler passes `len(events)` as the expected version:

```go
// Illustrative — command handler with optimistic-locking retry.
// func (h *AccountCommandHandler) HandleDeposit(ctx context.Context, cmd DepositCommand) error {
//     events, err := h.store.Load(ctx, cmd.AccountID)
//     if err != nil { return err }
//     account := ReplayAccount(events)
//     account.Deposit(cmd.Amount)
//     err = h.store.Append(ctx, cmd.AccountID, len(events), account.Changes())
//     if errors.Is(err, ErrVersionConflict) {
//         return h.HandleDeposit(ctx, cmd) // retry from the top
//     }
//     return err
// }
```

The store checks the current stream length before appending (illustrative — PostgreSQL implementation):

```go
// Illustrative only — requires a real PostgreSQL connection to run.
// func (s *PostgresEventStore) Append(ctx context.Context, id string, expectedVersion int, events []Event) error {
//     var currentVersion int
//     err := s.db.QueryRowContext(ctx,
//         "SELECT COUNT(*) FROM events WHERE aggregate_id = $1", id,
//     ).Scan(&currentVersion)
//     if err != nil { return err }
//     if currentVersion != expectedVersion { return ErrVersionConflict }
//     // insert new events...
//     return nil
// }
```

Optimistic locking works well when conflicts are rare — a deposit and a withdrawal hitting the same account within milliseconds is uncommon. For high-contention aggregates, a retry loop is acceptable; for truly write-heavy paths, consider sharding or a different aggregate boundary.

## When to Use

- You need a full audit trail as a first-class requirement — financial systems, healthcare records, legal contracts.
- You need temporal queries: "what was the state at time T?"
- You have multiple read models with different shapes that evolve over time and can be rebuilt by replaying the log.
- You're using [CQRS](/go/patterns/architectural/cqrs) and want the event log to drive read-side projections.

## When Not to Use

- Simple CRUD where history doesn't matter. An accounts table is simpler than an event log.
- The team isn't ready for eventual consistency in read models and the operational complexity of projection rebuilds.
- The aggregate's event history grows unboundedly fast (millions of events per aggregate per day) — snapshots alone won't save you.
- You need simple point-in-time queries and a soft-delete column would do the job.

## Tradeoffs

The audit log is a consequence of the storage strategy, not an add-on — you can't accidentally skip it. Time-travel and projection rebuilding are genuinely powerful for debugging and analytics. The costs are real: loading an aggregate requires a database query and a replay loop instead of a single row fetch (mitigated by snapshots), read models are eventually consistent (a projection may lag the event log by milliseconds to seconds), and event schemas must be backward-compatible forever because you can't change historical events. Schema evolution strategies — upcasting old events at read time, versioned event types — add operational discipline that current-state storage doesn't require.

## Related Patterns

- **CQRS** — The natural partner: commands produce events appended to the store; read-side projections consume those events to build query-optimized views. Event Sourcing gives CQRS its event log.
- **Event-Driven Architecture** — Event Sourcing focuses on aggregate state inside a bounded context; Event-Driven Architecture focuses on asynchronous communication between services. The two are complementary: an aggregate's persisted events can also be published to a broker for cross-service consumption.
- **Domain-Driven Design** — Domain Events in DDD are the events in Event Sourcing. Aggregates emit events during state transitions; the application layer persists and dispatches them.
