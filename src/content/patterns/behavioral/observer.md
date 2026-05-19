# Observer

Observer establishes a one-to-many relationship: when one object (the subject) changes state, all registered observers are notified automatically. In Go, observers can be interface values, function values, or channels. Each approach has different trade-offs around lifecycle, concurrency, and coupling.

## Problem

You're building an order system. When an order status changes, the UI needs to update, an email needs to be sent, and analytics need to be tracked. Hardcoding all three responses into the order update function means every new listener requires modifying core business logic.

```go
// coupled.go
package orders

func (o *Order) SetStatus(s Status) {
    o.Status = s
    // Direct coupling to every listener
    updateUI(o)
    sendStatusEmail(o)
    trackAnalytics("status_change", o.ID)
    // Adding webhook notification? Edit this function.
    // Adding audit logging? Edit this function.
}
```

The order type directly calls every subsystem that cares about status changes. Adding a new listener requires modifying `SetStatus`. The order package imports UI, email, and analytics packages — a dependency mess.

## Solution

Define an `Observer` interface and let the subject maintain a list of observers. When state changes, iterate the list and notify each one. Observers register and unregister themselves.

```
┌─────────────────┐
│   OrderSubject  │
│─────────────────│
│ Subscribe(obs)  │
│ Unsubscribe(obs)│
│ Notify()        │
│ observers []Obs │
└────────┬────────┘
         │ notifies
   ┌─────┼──────┐
   │     │      │
 Email  UI   Analytics
```

```go
// orders.go
package orders

import "fmt"

type Status string

const (
    Pending   Status = "pending"
    Confirmed Status = "confirmed"
    Shipped   Status = "shipped"
)

type Order struct {
    ID     string
    Status Status
}

// Observer receives order updates.
type Observer interface {
    OnOrderUpdate(order Order)
}

// Subject manages observers and notifications.
type Subject struct {
    observers []Observer
}

func (s *Subject) Subscribe(obs Observer) {
    s.observers = append(s.observers, obs)
}

func (s *Subject) Unsubscribe(obs Observer) {
    for i, o := range s.observers {
        if o == obs {
            s.observers = append(s.observers[:i], s.observers[i+1:]...)
            return
        }
    }
}

func (s *Subject) Notify(order Order) {
    for _, obs := range s.observers {
        obs.OnOrderUpdate(order)
    }
}

// OrderService combines business logic with observer notifications.
type OrderService struct {
    Subject
    orders map[string]*Order
}

func NewOrderService() *OrderService {
    return &OrderService{orders: make(map[string]*Order)}
}

func (s *OrderService) UpdateStatus(id string, status Status) {
    order, ok := s.orders[id]
    if !ok {
        order = &Order{ID: id}
        s.orders[id] = order
    }
    order.Status = status
    s.Notify(*order)
}
```

Observers implement the interface independently:

```go
// main.go
package main

import (
    "fmt"
    "orders"
)

type EmailNotifier struct{}

func (e *EmailNotifier) OnOrderUpdate(o orders.Order) {
    fmt.Printf("[email] Order %s is now %s\n", o.ID, o.Status)
}

type AnalyticsTracker struct{}

func (a *AnalyticsTracker) OnOrderUpdate(o orders.Order) {
    fmt.Printf("[analytics] track order=%s status=%s\n", o.ID, o.Status)
}

func main() {
    svc := orders.NewOrderService()

    email := &EmailNotifier{}
    analytics := &AnalyticsTracker{}

    svc.Subscribe(email)
    svc.Subscribe(analytics)

    svc.UpdateStatus("ORD-1", orders.Confirmed)
    svc.UpdateStatus("ORD-1", orders.Shipped)
}
```

Output:

```
[email] Order ORD-1 is now confirmed
[analytics] track order=ORD-1 status=confirmed
[email] Order ORD-1 is now shipped
[analytics] track order=ORD-1 status=shipped
```

## When to Use

- Multiple independent components need to react to changes in another component.
- You want to add new reactions without modifying the thing that changes.
- The set of listeners is dynamic — subscribers come and go at runtime.

## When Not to Use

- You have exactly one listener and it won't change. A direct function call is simpler.
- Notification ordering matters — Observer doesn't guarantee order.
- The observer needs to send data back to the subject — this creates circular dependencies.

## Advantages

- Subject and observers are decoupled — the subject doesn't import observer packages.
- New observers can be added without modifying existing code.
- Dynamic subscription at runtime.

## Disadvantages

- Notification order is undefined — don't depend on it.
- Memory leaks if observers aren't unsubscribed (goroutines, long-lived objects).
- In concurrent Go, the observer list needs synchronization (`sync.Mutex` or `sync.RWMutex`).
- Debugging notification chains can be difficult — "who's listening?" isn't obvious from the code.

## Related Patterns

- **Mediator** — Mediator centralizes communication; Observer decentralizes it via pub/sub.
- **Command** — Commands can be queued as a form of event notification.
