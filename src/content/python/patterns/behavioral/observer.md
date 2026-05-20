---
title: "Observer"
category: behavioral
intent: "Define a one-to-many dependency between objects so that when one changes state, all dependents are notified automatically."
idiomSummary: "Use callbacks, subscribers, or signals to notify dependents when state changes."
relatedSlugs: ["mediator", "command"]
tags: [interfaces, closures, concurrency, events, testability]
---

# Observer

In Python, Observer gives you three subscriber mechanisms: interface values (classic, stateful), function values (lighter, more composable), and channels (goroutine-friendly, but requiring careful lifecycle management — a subscriber goroutine that is never unsubscribed leaks). Picking the wrong form for your lifecycle requirements is the most common Observer mistake in Go.

The pattern's core guarantee: when the subject's state changes, it doesn't know or care who reacts. Registered observers are notified; the subject imports nothing from observer packages. This is the [Open/Closed Principle](/python/philosophy/solid) applied to event notification — you add new reactions without touching the thing that changed.

## Problem

You're building an order system. When an order status changes, the UI needs to update, an email needs to be sent, and analytics need to be tracked. Hardcoding all three responses into the order update function means every new listener requires modifying core business logic.

```python
# coupled.py

def set_status(self, s):
    o.Status = s
    # Direct coupling to every listener
    updateUI(o)
    sendStatusEmail(o)
    trackAnalytics("status_change", o.ID)
    # Adding webhook notification? Edit this function.
    # Adding audit logging? Edit this function.
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

```python
from typing import Protocol

# orders.py


type Status string

const (
Pending   Status = "pending"
Confirmed Status = "confirmed"
Shipped   Status = "shipped"

class Order:
    id: string
    status: Status

# Observer receives order updates.
class Observer(Protocol):
    def on_order_update(self, order): ...

# Subject manages observers and notifications.
class Subject:
    observers: []Observer

def subscribe(self, obs):
    s.observers = append(s.observers, obs)

def unsubscribe(self, obs):
    for i, o in s.observers.items():
        if o == obs :
            s.observers = append(s.observers[:i], s.observers[i+1:]...)
            return
        pass
    pass

def notify(self, order):
    for obs in s.observers:
        obs.OnOrderUpdate(order)
    pass

# OrderService combines business logic with observer notifications.
class OrderService:
    Subject
    orders: map[string]Order

def new_order_service():
    return &OrderService{orders: make(map[string]*Order)

def update_status(self, id, status):
    order, ok := s.orders[id]
    if !ok :
        order = &Order:ID: id
        s.orders[id] = order
    order.Status = status
    s.Notify(*order)
```

Observers implement the interface independently:

```python
# main.py

"fmt"
"orders"

class EmailNotifier:
    pass

def on_order_update(self, o):
    fmt.Printf("[email] Order %s is now %s\n", o.ID, o.Status)

class AnalyticsTracker:
    pass

def on_order_update(self, o):
    fmt.Printf("[analytics] track order=%s status=%s\n", o.ID, o.Status)

def main():
    svc = orders.NewOrderService()

    email = EmailNotifier{}
    analytics = AnalyticsTracker{}

    svc.Subscribe(email)
    svc.Subscribe(analytics)

    svc.UpdateStatus("ORD-1", orders.Confirmed)
    svc.UpdateStatus("ORD-1", orders.Shipped)
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

- **Mediator** — Mediator is better when several peers need to coordinate bidirectionally (each can send and receive through the hub); prefer Observer when you need one broadcaster and many independent listeners that don't communicate back.
- **Command** — Use Command alongside Observer when you need to queue, log, or make event notifications undoable — the Command wraps the notification payload; the Observer dispatches it.
