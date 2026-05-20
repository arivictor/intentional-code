---
title: "Facade"
category: structural
intent: "Provide a simple, unified interface to a complex subsystem, shielding clients from internal complexity."
goIdiomSummary: "A struct exposing a small API over several subsystem packages."
relatedSlugs: ["adapter", "mediator"]
tags: [interfaces, composition, testability, dependency-inversion]
isFeatured: true
---

# Facade

Facade is the pattern for orchestration code that gets duplicated. When an HTTP handler, a CLI tool, and a batch processor all repeat the same multi-step sequence — validate, charge, reserve, notify — that sequence belongs in one struct, not scattered across entry points. In Go, a facade struct accepts its subsystems as interfaces (making them testable and swappable) and exposes one or a few high-level methods that cover the common case.

## Problem

You're building an e-commerce checkout. The process involves validating the cart, checking inventory, processing payment, sending a confirmation email, and updating analytics. Each subsystem has its own package with its own API. Orchestrating all of them in every handler that needs "checkout" logic is verbose and error-prone.

```go
// checkout_scattered.go
package handler

func HandleCheckout(w http.ResponseWriter, r *http.Request) {
    cart := cartpkg.Load(r)
    if err := cartpkg.Validate(cart); err != nil { /* ... */ }
    for _, item := range cart.Items {
        if !inventory.Check(item.SKU, item.Qty); err != nil { /* ... */ }
    }
    txn, err := payment.Charge(cart.CustomerID, cart.Total())
    if err != nil { /* ... */ }
    inventory.Reserve(cart.Items)
    email.SendConfirmation(cart.CustomerEmail, txn.ID)
    analytics.Track("checkout", map[string]string{"txn": txn.ID})
    // Every handler that needs checkout must repeat this dance
}
```

This orchestration logic is duplicated wherever checkout happens — the HTTP handler, a CLI tool, a batch processor. Change the sequence (e.g., add fraud checking) and you must find and update every copy.

## Solution

Create a `Checkout` facade struct that encapsulates the multi-step process. Callers get one method; the facade coordinates the subsystems.

```
                  ┌────────────────────┐
    Handler ─────►│   CheckoutFacade   │
    CLI    ─────►│                    │
    Batch  ─────►│ PlaceOrder(cart)   │
                  └───────┬────────────┘
                          │ coordinates
            ┌─────────────┼─────────────────┐
            │             │                 │
      ┌─────▼────┐  ┌─────▼────┐   ┌───────▼──────┐
      │ Inventory │  │ Payment  │   │ Email/Analyt.│
      └──────────┘  └──────────┘   └──────────────┘
```

```go
// checkout.go
package checkout

import "fmt"

// Dependencies as interfaces — testable, swappable.
type InventoryChecker interface {
    Available(sku string, qty int) bool
    Reserve(sku string, qty int) error
}

type PaymentProcessor interface {
    Charge(customerID string, amount int64) (string, error)
}

type Mailer interface {
    SendConfirmation(email, txnID string) error
}

type CartItem struct {
    SKU string
    Qty int
}

type Cart struct {
    CustomerID    string
    CustomerEmail string
    Items         []CartItem
    Total         int64
}

// Facade coordinates the checkout process.
type Facade struct {
    inventory InventoryChecker
    payment   PaymentProcessor
    mailer    Mailer
}

func NewFacade(inv InventoryChecker, pay PaymentProcessor, mail Mailer) *Facade {
    return &Facade{inventory: inv, payment: pay, mailer: mail}
}

func (f *Facade) PlaceOrder(cart Cart) (string, error) {
    for _, item := range cart.Items {
        if !f.inventory.Available(item.SKU, item.Qty) {
            return "", fmt.Errorf("item %s not available", item.SKU)
        }
    }

    txnID, err := f.payment.Charge(cart.CustomerID, cart.Total)
    if err != nil {
        return "", fmt.Errorf("payment failed: %w", err)
    }

    for _, item := range cart.Items {
        if err := f.inventory.Reserve(item.SKU, item.Qty); err != nil {
            return "", fmt.Errorf("reservation failed: %w", err)
        }
    }

    f.mailer.SendConfirmation(cart.CustomerEmail, txnID)

    return txnID, nil
}
```

```go
// main.go
package main

import "fmt"

func main() {
    facade := checkout.NewFacade(
        &warehouse.InventoryService{},
        &stripe.PaymentService{APIKey: "sk_live_..."},
        &sendgrid.Mailer{APIKey: "SG...."},
    )

    cart := checkout.Cart{
        CustomerID:    "cust_42",
        CustomerEmail: "alice@example.com",
        Items:         []checkout.CartItem{{SKU: "WIDGET-7", Qty: 2}},
        Total:         4999,
    }

    txnID, err := facade.PlaceOrder(cart)
    if err != nil {
        fmt.Println("checkout failed:", err)
        return
    }
    fmt.Println("Order placed:", txnID)
}
```

Output:

```
Order placed: txn_abc123
```

## When to Use

- Multiple subsystems must be coordinated in a specific sequence, and that sequence is needed in more than one place.
- You want to isolate clients from subsystem complexity.
- You're wrapping a third-party library or legacy system with a cleaner API.

## When Not to Use

- The subsystem is already simple. A facade over one function is just indirection.
- Different callers need different orchestration sequences. The facade becomes a god object with many methods.
- You're hiding complexity that callers actually need to understand and control.

## Advantages

- Simplifies client code — one method instead of a multi-step dance.
- Changes to the process happen in one place.
- Subsystems remain independent and reusable outside the facade.

## Disadvantages

- Can become a god object if it accumulates too many operations.
- Hides subsystem capabilities that power users might need.
- Adds a layer of abstraction that may not be justified for simple workflows.

## Related Patterns

- **Adapter** — Adapter makes one incompatible type compatible with one interface; Facade simplifies a whole subsystem into a more convenient API — use Adapter when you have an interface mismatch, Facade when you have a repeated orchestration problem.
- **Mediator** — Mediator coordinates peers that know about each other and communicate through a central hub; Facade coordinates subsystems on behalf of an external caller — use Mediator when objects need to send messages to each other, Facade when callers just need a simpler entry point into complex subsystem code.
