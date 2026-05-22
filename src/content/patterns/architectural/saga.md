---
title: "Saga"
category: architectural
intent: "Coordinate a multi-step distributed transaction as a sequence of local transactions, each publishing an event or message that triggers the next step, with compensating transactions to undo completed steps on failure."
idiomSummary: "Two styles: choreography (each service listens for events and reacts) and orchestration (a saga coordinator struct drives the workflow). Compensating transactions must be idempotent and always succeed."
relatedSlugs: ["event-driven", "event-sourcing", "cqrs"]
tags: [distributed, events, interfaces, concurrency]
---

# Saga

A distributed system can't use a database transaction to span multiple services. The Saga pattern solves this by breaking a cross-service operation into a sequence of local transactions. Each step in the sequence succeeds independently; if any step fails, previously completed steps are reversed by compensating transactions.

There are two coordination styles:

**Choreography:** Each service publishes an event on success. Other services subscribe to that event and execute their own step. No central coordinator; the workflow emerges from the event flow. Simple to implement; harder to reason about as the number of steps grows.

**Orchestration:** A saga coordinator (a struct or a service) drives the workflow explicitly — call step 1, wait for result, call step 2, and so on. Easier to reason about and monitor; the coordinator is a single point of failure and complexity.

## Problem

Placing an order requires three steps across three services: reserve inventory, charge the customer, and schedule shipping. If the charge fails after inventory is reserved, the inventory reservation must be released. A database transaction can't span these three services.

```go
// Without Saga — this is NOT how you should do it
func (h *OrderHandler) PlaceOrder(ctx context.Context, req PlaceOrderRequest) error {
    // What happens if charge fails after inventory is reserved?
    // What happens if shipping fails after the charge succeeds?
    // There is no rollback mechanism here.
    if err := h.inventory.Reserve(ctx, req.ItemID, req.Qty); err != nil {
        return err
    }
    if err := h.billing.Charge(ctx, req.CustomerID, req.Amount); err != nil {
        // inventory is now reserved but charge failed — inconsistent state
        return err
    }
    if err := h.shipping.Schedule(ctx, req.OrderID); err != nil {
        // inventory reserved, customer charged, but shipping failed
        return err
    }
    return nil
}
```

## Solution

**Orchestration Saga:**

Define a saga coordinator that drives steps sequentially and calls compensating transactions on failure.

```
OrderSaga coordinator
      │
      ├─1. ReserveInventory ──► success
      │         │ failure → (no compensation needed)
      │
      ├─2. ChargeCustomer ────► success
      │         │ failure → ReleaseInventory (compensate step 1)
      │
      ├─3. ScheduleShipping ──► success
      │         │ failure → RefundCustomer (compensate step 2)
      │                    → ReleaseInventory (compensate step 1)
      │
      └─► Saga Complete
```

The following is a single runnable file with an orchestration saga coordinator and stub service implementations:

```go
package main

import (
	"context"
	"fmt"
)

// --- Service interfaces and stub implementations ---

type InventoryService interface {
	Reserve(ctx context.Context, itemID string, qty int) error
	Release(ctx context.Context, itemID string, qty int) error
}

type BillingService interface {
	Charge(ctx context.Context, customerID string, amount int) error
	Refund(ctx context.Context, customerID string, amount int) error
}

type ShippingService interface {
	Schedule(ctx context.Context, orderID string) error
	Cancel(ctx context.Context, orderID string) error
}

// Stub inventory — fails for a specific item to demonstrate compensation.
type stubInventory struct{ log []string }

func (s *stubInventory) Reserve(_ context.Context, itemID string, qty int) error {
	s.log = append(s.log, fmt.Sprintf("reserve %s x%d", itemID, qty))
	return nil
}
func (s *stubInventory) Release(_ context.Context, itemID string, qty int) error {
	s.log = append(s.log, fmt.Sprintf("COMPENSATE: release %s x%d", itemID, qty))
	return nil
}

// Stub billing — fails for a specific customer to demonstrate compensation.
type stubBilling struct {
	failFor string
	log     []string
}

func (s *stubBilling) Charge(_ context.Context, customerID string, amount int) error {
	if customerID == s.failFor {
		return fmt.Errorf("card declined for %s", customerID)
	}
	s.log = append(s.log, fmt.Sprintf("charge %s $%d", customerID, amount))
	return nil
}
func (s *stubBilling) Refund(_ context.Context, customerID string, amount int) error {
	s.log = append(s.log, fmt.Sprintf("COMPENSATE: refund %s $%d", customerID, amount))
	return nil
}

type stubShipping struct{ log []string }

func (s *stubShipping) Schedule(_ context.Context, orderID string) error {
	s.log = append(s.log, fmt.Sprintf("schedule shipping for %s", orderID))
	return nil
}
func (s *stubShipping) Cancel(_ context.Context, orderID string) error {
	s.log = append(s.log, fmt.Sprintf("COMPENSATE: cancel shipping for %s", orderID))
	return nil
}

// --- Orchestration Saga coordinator ---

type PlaceOrderRequest struct {
	OrderID    string
	ItemID     string
	CustomerID string
	Qty        int
	Amount     int
}

type OrderSaga struct {
	inventory InventoryService
	billing   BillingService
	shipping  ShippingService
}

func (s *OrderSaga) Execute(ctx context.Context, req PlaceOrderRequest) error {
	// Step 1: Reserve inventory
	if err := s.inventory.Reserve(ctx, req.ItemID, req.Qty); err != nil {
		return fmt.Errorf("reserve inventory: %w", err)
	}

	// Step 2: Charge customer; compensate step 1 on failure
	if err := s.billing.Charge(ctx, req.CustomerID, req.Amount); err != nil {
		s.inventory.Release(ctx, req.ItemID, req.Qty) // compensate
		return fmt.Errorf("charge customer: %w", err)
	}

	// Step 3: Schedule shipping; compensate steps 1 and 2 on failure
	if err := s.shipping.Schedule(ctx, req.OrderID); err != nil {
		s.billing.Refund(ctx, req.CustomerID, req.Amount) // compensate step 2
		s.inventory.Release(ctx, req.ItemID, req.Qty)     // compensate step 1
		return fmt.Errorf("schedule shipping: %w", err)
	}

	return nil
}

func main() {
	ctx := context.Background()
	inv := &stubInventory{}
	bill := &stubBilling{}
	ship := &stubShipping{}
	saga := &OrderSaga{inventory: inv, billing: bill, shipping: ship}

	fmt.Println("--- Happy path ---")
	err := saga.Execute(ctx, PlaceOrderRequest{
		OrderID: "ord-1", ItemID: "item-A", CustomerID: "cust-1", Qty: 2, Amount: 100,
	})
	if err != nil {
		fmt.Println("error:", err)
	}
	for _, entry := range append(inv.log, append(bill.log, ship.log...)...) {
		fmt.Println(" ", entry)
	}

	// Reset logs
	inv.log, bill.log, ship.log = nil, nil, nil
	bill.failFor = "cust-bad"

	fmt.Println("\n--- Billing failure (compensation triggered) ---")
	err = saga.Execute(ctx, PlaceOrderRequest{
		OrderID: "ord-2", ItemID: "item-B", CustomerID: "cust-bad", Qty: 1, Amount: 200,
	})
	if err != nil {
		fmt.Println("saga error:", err)
	}
	for _, entry := range append(inv.log, append(bill.log, ship.log...)...) {
		fmt.Println(" ", entry)
	}
}
```

```
// Output:
// --- Happy path ---
//   reserve item-A x2
//   charge cust-1 $100
//   schedule shipping for ord-1
//
// --- Billing failure (compensation triggered) ---
// saga error: charge customer: card declined for cust-bad
//   reserve item-B x1
//   COMPENSATE: release item-B x1
```

**Choreography Saga** (illustrative — shows the event-driven alternative, not directly runnable without a full event bus):

```go
// Each service reacts to events from the previous step.
// No central coordinator; the workflow emerges from the event flow.
//
// InventoryService listens for "order.created", publishes "inventory.reserved"
// func (s *InventoryHandler) OnOrderCreated(ctx context.Context, evt OrderCreatedEvent) {
//     if err := s.reserve(ctx, evt.ItemID, evt.Qty); err != nil {
//         s.bus.Publish(ctx, "inventory.reserve.failed", ...)
//         return
//     }
//     s.bus.Publish(ctx, "inventory.reserved", InventoryReservedEvent{...})
// }
//
// BillingService listens for "inventory.reserved", publishes "payment.charged"
// func (s *BillingHandler) OnInventoryReserved(ctx context.Context, evt InventoryReservedEvent) {
//     if err := s.charge(ctx, evt.CustomerID, evt.Amount); err != nil {
//         s.bus.Publish(ctx, "payment.failed", ...)  // triggers inventory compensation
//         return
//     }
//     s.bus.Publish(ctx, "payment.charged", ...)
// }
```

Compensating transactions must be idempotent — if the refund message is delivered twice, the second call must be safe:

```go
// Idempotent compensation: check before acting.
// func (s *BillingService) Refund(ctx context.Context, customerID string, amount int) error {
//     if s.alreadyRefunded(ctx, customerID, amount) {
//         return nil // safe to re-deliver
//     }
//     return s.processRefund(ctx, customerID, amount)
// }
```

## Making Sagas Durable

An orchestration saga that crashes between steps leaves the workflow in an unknown state. On restart, there's no record of which steps completed and which compensations are needed. Without durability, every process restart risks data inconsistency.

Persist saga state to a database table before and after each step:

```sql
CREATE TABLE saga_state (
    id              TEXT PRIMARY KEY,
    saga_type       TEXT NOT NULL,
    status          TEXT NOT NULL, -- pending, completed, compensating, failed
    completed_steps JSONB NOT NULL DEFAULT '[]',
    payload         JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Update the coordinator to persist state at each step boundary (illustrative — requires a database-backed `SagaStore`):

```go
// Illustrative only — requires a database-backed SagaStore to run.
// saga/durable_order_saga.go
//
// type SagaStore interface {
//     Save(ctx context.Context, state SagaState) error
//     Load(ctx context.Context, id string) (SagaState, error)
// }
//
// type SagaState struct {
//     ID             string
//     Status         string   // pending, completed, compensating, failed
//     CompletedSteps []string
//     Payload        PlaceOrderRequest
// }
//
// func (s *DurableOrderSaga) Execute(ctx context.Context, req PlaceOrderRequest) error {
//     state := SagaState{ID: req.OrderID, Status: "pending", Payload: req}
//     if err := s.store.Save(ctx, state); err != nil { return err }
//
//     if err := s.inventory.Reserve(ctx, req.ItemID, req.Qty); err != nil {
//         state.Status = "failed"; s.store.Save(ctx, state)
//         return fmt.Errorf("reserve inventory: %w", err)
//     }
//     state.CompletedSteps = append(state.CompletedSteps, "reserve_inventory")
//     s.store.Save(ctx, state)
//
//     if err := s.billing.Charge(ctx, req.CustomerID, req.Amount); err != nil {
//         state.Status = "compensating"; s.store.Save(ctx, state)
//         s.inventory.Release(ctx, req.ItemID, req.Qty)
//         state.Status = "failed"; s.store.Save(ctx, state)
//         return fmt.Errorf("charge customer: %w", err)
//     }
//     state.CompletedSteps = append(state.CompletedSteps, "charge_customer")
//     s.store.Save(ctx, state)
//     // ... continue for shipping step
//     state.Status = "completed"
//     return s.store.Save(ctx, state)
// }
```

A recovery process at startup loads all sagas in non-terminal states and re-enters at the correct step based on `completed_steps` (illustrative):

```go
// Illustrative only — recovery logic after a crash or restart.
//
// func ResumeSaga(ctx context.Context, store SagaStore, saga *DurableOrderSaga, id string) error {
//     state, err := store.Load(ctx, id)
//     if err != nil { return err }
//     if state.Status == "completed" || state.Status == "failed" { return nil }
//
//     completed := make(map[string]bool)
//     for _, step := range state.CompletedSteps { completed[step] = true }
//
//     req := state.Payload
//     if !completed["reserve_inventory"] { return saga.Execute(ctx, req) }
//     if !completed["charge_customer"] {
//         if err := saga.billing.Charge(ctx, req.CustomerID, req.Amount); err != nil {
//             saga.inventory.Release(ctx, req.ItemID, req.Qty)
//             return err
//         }
//     }
//     return saga.shipping.Schedule(ctx, req.OrderID)
// }
```

Each service call should carry an idempotency key (typically the saga ID plus the step name) so that retried calls after a crash don't double-charge or double-reserve. A saga that crashes after charging but before recording `charge_customer` will retry the charge on resume — the billing service must recognise the idempotency key and return success without charging again.

## When to Use

- A business operation spans multiple services or data stores that cannot participate in a single ACID transaction.
- You need to maintain consistency across service boundaries without distributed locking.
- The workflow has well-defined compensating actions for each step.

## When Not to Use

- All data lives in a single database — use a regular transaction.
- Compensation is not possible or meaningful (you can't "unsend" an email; use outbox pattern or accept it).
- The workflow is so short-lived that eventual consistency and compensations are overkill.

## Tradeoffs

The orchestration style puts the workflow in one place — easy to read, trace, and modify — but the coordinator is a dependency for every step and a complexity concentration point. Choreography distributes workflow across services — no single point of failure — but the sequence is implicit in the event flow, which makes it harder to trace ("which service handles `inventory.reserve.failed`?"). Both styles require compensating transactions to be idempotent, because at-least-once delivery means they will sometimes be called more than once. Compensations must never fail permanently; if a refund fails, you need a retry mechanism and dead-letter queue, not a return value nobody watches.

## Related Patterns

- **Event-Driven Architecture** — Choreography sagas are built on event-driven communication. Each service publishes facts; other services subscribe and react. The Saga pattern adds the concept of compensating transactions to the event-driven model.
- **Event Sourcing** — Saga state (which steps have completed, which compensations are needed) can be stored as events in an event log, giving you a full history of the saga's progress.
- **CQRS** — Command handlers often initiate sagas. The saga coordinates writes across services; CQRS separates the write-side command handling from the read-side query model.
