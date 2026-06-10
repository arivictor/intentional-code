---
title: "Event Sourcing"
description: "Store state as an append-only log of domain events, and derive current state by replaying them, rather than storing only the current snapshot."
---

# Event Sourcing

**Buys a built-in audit trail and time-travel via replay; pays in projection complexity, eventually consistent reads, and forever-backward-compatible event schemas.**

Most systems store only the latest state of an entity. Event Sourcing stores the full history of changes, then rebuilds the current state by replaying that history. Instead of one row that says `balance = 420`, an account has an event stream like `AccountOpened`, `MoneyDeposited(500)`, `MoneyWithdrawn(80)`. The current balance is calculated from those events.

This gives you an audit trail by default. It also gives you built-in time-travel debugging, because you can rebuild state as it looked at an earlier point in time. You can also replay old events into a new projection to answer questions you did not plan for when the system was first designed. But there are real costs: reads are more complex (you usually need projection tables), replay can be slow for long streams unless you use snapshots, and event schema changes need careful versioning.

Event Sourcing fits naturally with [CQRS](/patterns/architectural/cqrs): commands append events to the stream, and the query side consumes that stream to build denormalised read models.

## Scenario

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
                    │                       [MoneyDeposited(500)]
                    │                       [MoneyWithdrawn(80)]
                    │                       [MoneyDeposited(100)]
                    │
                  State: balance=520
```

Define the events and the aggregate:

```go
// domain/events.go
package domain

import "time"

type EventType string

const (
    EventAccountOpened   EventType = "AccountOpened"
    EventMoneyDeposited  EventType = "MoneyDeposited"
    EventMoneyWithdrawn  EventType = "MoneyWithdrawn"
)

type Event struct {
    Type      EventType
    OccuredAt time.Time
    Data      any
}

type AccountOpenedData  struct{ InitialBalance int }
type MoneyDepositedData struct{ Amount int }
type MoneyWithdrawnData struct{ Amount int }
```

```go
// domain/account.go
package domain

import (
    "errors"
    "time"
)

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

func (a *Account) Changes() []Event { return a.changes }
func (a *Account) ClearChanges()    { a.changes = nil }
```

Here's the core idea as one runnable program — commands append events, and the current balance is derived by replaying the stored stream rather than reading a saved total:

```go:title="main.go":run=true:editable=true
package main

import (
	"errors"
	"fmt"
	"time"
)

// --- Domain events: immutable facts ---

type EventType string

const (
	EventAccountOpened  EventType = "AccountOpened"
	EventMoneyDeposited EventType = "MoneyDeposited"
	EventMoneyWithdrawn EventType = "MoneyWithdrawn"
)

type Event struct {
	Type       EventType
	OccurredAt time.Time
	Amount     int
}

// --- Aggregate: applies events to derive state ---

type Account struct {
	ID      string
	Balance int
	changes []Event
}

func NewAccount(id string, initial int) *Account {
	a := &Account{ID: id}
	a.apply(Event{Type: EventAccountOpened, OccurredAt: time.Now(), Amount: initial})
	return a
}

func (a *Account) Deposit(amount int) {
	a.apply(Event{Type: EventMoneyDeposited, OccurredAt: time.Now(), Amount: amount})
}

func (a *Account) Withdraw(amount int) error {
	if amount > a.Balance {
		return errors.New("insufficient funds")
	}
	a.apply(Event{Type: EventMoneyWithdrawn, OccurredAt: time.Now(), Amount: amount})
	return nil
}

// apply mutates in-memory state and records the event for persistence.
func (a *Account) apply(e Event) {
	switch e.Type {
	case EventAccountOpened:
		a.Balance = e.Amount
	case EventMoneyDeposited:
		a.Balance += e.Amount
	case EventMoneyWithdrawn:
		a.Balance -= e.Amount
	}
	a.changes = append(a.changes, e)
}

func (a *Account) Changes() []Event { return a.changes }

// ReplayAccount rebuilds current state from a stored event stream.
func ReplayAccount(id string, events []Event) *Account {
	a := &Account{ID: id}
	for _, e := range events {
		a.apply(e)
	}
	return a
}

func main() {
	// Commands append events to the stream.
	acc := NewAccount("acc-1", 0)
	acc.Deposit(500)
	if err := acc.Withdraw(80); err != nil {
		fmt.Println("error:", err)
		return
	}
	acc.Deposit(100)

	// The event log is the source of truth; persist the changes.
	log := acc.Changes()
	fmt.Printf("stored %d events:\n", len(log))
	for _, e := range log {
		fmt.Printf("  %s amount=%d\n", e.Type, e.Amount)
	}

	// Current state is derived by replaying the log — no stored balance row.
	rebuilt := ReplayAccount("acc-1", log)
	fmt.Printf("replayed balance: %d\n", rebuilt.Balance)
}
```

```
// Output:
// stored 4 events:
//   AccountOpened amount=0
//   MoneyDeposited amount=500
//   MoneyWithdrawn amount=80
//   MoneyDeposited amount=100
// replayed balance: 520
```

The event store persists and loads events:

```go
// store/event_store.go
package store

import "myapp/domain"

type EventStore interface {
    Append(ctx context.Context, aggregateID string, events []domain.Event) error
    Load(ctx context.Context, aggregateID string) ([]domain.Event, error)
}

func ReplayAccount(events []domain.Event) *domain.Account {
    a := &domain.Account{}
    for _, e := range events {
        a.ApplyEvent(e) // version of apply that doesn't record to changes
    }
    return a
}
```

Command handler: load by replaying, execute command, persist new events:

```go
// app/account_commands.go
package app

import "myapp/domain"

type DepositCommand struct {
    AccountID string
    Amount    int
}

type AccountCommandHandler struct {
    store store.EventStore
}

func (h *AccountCommandHandler) HandleDeposit(ctx context.Context, cmd DepositCommand) error {
    events, err := h.store.Load(ctx, cmd.AccountID)
    if err != nil {
        return err
    }
    account := store.ReplayAccount(events)
    account.Deposit(cmd.Amount)
    return h.store.Append(ctx, cmd.AccountID, account.Changes())
}
```

Snapshots cap replay cost when event histories grow long:

```go
// store/snapshot.go — store a state snapshot every N events
type Snapshot struct {
    AggregateID string
    Balance     int
    EventCount  int
}

func (h *AccountCommandHandler) HandleDepositWithSnapshot(ctx context.Context, cmd DepositCommand) error {
    snap, _ := h.snapshots.Load(ctx, cmd.AccountID)
    events, err := h.store.LoadFrom(ctx, cmd.AccountID, snap.EventCount)
    if err != nil {
        return err
    }
    account := &domain.Account{Balance: snap.Balance}
    for _, e := range events {
        account.ApplyEvent(e)
    }
    account.Deposit(cmd.Amount)
    if err := h.store.Append(ctx, cmd.AccountID, account.Changes()); err != nil {
        return err
    }
    if len(events)+len(account.Changes()) > 100 {
        h.snapshots.Save(ctx, Snapshot{
            AggregateID: cmd.AccountID,
            Balance:     account.Balance,
            EventCount:  snap.EventCount + len(events) + len(account.Changes()),
        })
    }
    return nil
}
```

## Concurrency and Optimistic Locking

When two commands modify the same aggregate concurrently, the second write must detect that the first has already changed the stream. Without a check, both commands load the same events, both produce new events at the same version, and both append. The second write silently overwrites the first.

The fix is optimistic locking: `Append` accepts an `expectedVersion` (the length of events loaded), and the store rejects writes where the stream has advanced beyond that version:

```go
// store/event_store.go
var ErrVersionConflict = errors.New("optimistic lock conflict: stream was modified")

type EventStore interface {
    // expectedVersion is the number of events loaded before the command ran.
    // Append fails with ErrVersionConflict if the stream has more events than that.
    Append(ctx context.Context, aggregateID string, expectedVersion int, events []domain.Event) error
    Load(ctx context.Context, aggregateID string) ([]domain.Event, error)
}
```

The command handler passes `len(events)` as the expected version:

```go
func (h *AccountCommandHandler) HandleDeposit(ctx context.Context, cmd DepositCommand) error {
    events, err := h.store.Load(ctx, cmd.AccountID)
    if err != nil {
        return err
    }
    account := store.ReplayAccount(events)
    account.Deposit(cmd.Amount)

    err = h.store.Append(ctx, cmd.AccountID, len(events), account.Changes())
    if errors.Is(err, store.ErrVersionConflict) {
        // Another command won the race. Retry from the top.
        return h.HandleDeposit(ctx, cmd)
    }
    return err
}
```

The store checks the current stream length before appending:

```go
// postgres implementation — append atomically if version matches
func (s *PostgresEventStore) Append(ctx context.Context, aggregateID string, expectedVersion int, events []domain.Event) error {
    var currentVersion int
    err := s.db.QueryRowContext(ctx,
        "SELECT COUNT(*) FROM events WHERE aggregate_id = $1",
        aggregateID,
    ).Scan(&currentVersion)
    if err != nil {
        return err
    }
    if currentVersion != expectedVersion {
        return store.ErrVersionConflict
    }
    // insert new events...
    return nil
}
```

Optimistic locking works well when conflicts are rare. A deposit and a withdrawal hitting the same account within milliseconds is uncommon. For high-contention aggregates, a retry loop is acceptable; for truly write-heavy paths, consider sharding or a different aggregate boundary.

## When to Use

- You need a full audit trail as a first-class requirement (financial systems, healthcare records, legal contracts).
- You need temporal queries: "what was the state at time T?"
- You have multiple read models with different shapes that evolve over time and can be rebuilt by replaying the log.
- You're using [CQRS](/patterns/architectural/cqrs) and want the event log to drive read-side projections.

## When Not to Use

- Simple CRUD where history doesn't matter. An accounts table is simpler than an event log.
- The team isn't ready for eventual consistency in read models and the operational complexity of projection rebuilds.
- The aggregate's event history grows unboundedly fast (millions of events per aggregate per day); snapshots alone won't save you.
- You need simple point-in-time queries and a soft-delete column would do the job.

## The Decision

The biggest advantage is that audit history is built in. You do not need a separate logging system, and you cannot accidentally forget to record important changes. Time-travel debugging is also practical, and you can rebuild projections for new reporting or analytics needs.

The costs are also real. To load one aggregate, you usually run a query and replay events, not just fetch one current-state row (snapshots help reduce this replay cost). Read models are eventually consistent, so a projection can lag behind the event stream by milliseconds or seconds. Event schemas must stay backward compatible for a long time, because past events are part of your source of truth and cannot be edited. Evolving schemas with techniques like upcasting old events at read time, or introducing explicit event versions, adds operational discipline that current-state storage often does not require.

## Related Patterns

- **CQRS:** The natural partner. Commands produce events appended to the store; read-side projections consume those events to build query-optimised views. Event Sourcing gives CQRS its event log.
- **Event-Driven Architecture:** Event Sourcing focuses on aggregate state inside a bounded context; Event-Driven Architecture focuses on asynchronous communication between services. The two are complementary: an aggregate's persisted events can also be published to a broker for cross-service consumption.
- **Domain-Driven Design:** Domain Events in DDD are the events in Event Sourcing. Aggregates emit events during state transitions; the application layer persists and dispatches them.
