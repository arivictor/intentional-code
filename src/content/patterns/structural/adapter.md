# Adapter

Adapter wraps an existing type so it satisfies a different interface. In Go, this is a struct that holds a reference to the "adaptee" and implements the target interface by delegating calls with any necessary translation.

This is one of the most commonly used patterns in Go, often without being recognized as a pattern. Any time you write a wrapper struct to make one package's type compatible with another package's interface, you're using Adapter.

## Problem

You're integrating a third-party payment gateway. Your application works with a `PaymentProcessor` interface, but the gateway's SDK has a completely different method signature. You can't modify the SDK, and you don't want to change your application's interface — it's used in dozens of places.

```go
// mismatch.go
package payment

// Your application's interface
type PaymentProcessor interface {
    Charge(customerID string, amountCents int64) (transactionID string, err error)
}

// Third-party SDK — you can't change this
type StripeGateway struct {
    APIKey string
}

func (s *StripeGateway) CreateCharge(params map[string]interface{}) (map[string]interface{}, error) {
    // Completely different signature: map-based, amount in dollars, different naming
    // Your PaymentProcessor interface expects (string, int64) → (string, error)
    // These don't match. Now what?
    return map[string]interface{}{"id": "ch_123"}, nil
}
```

The SDK's method takes a map and returns a map. Your interface takes typed parameters and returns a string. You can't change either side. Without an adapter, you'd scatter type conversions and map building throughout your codebase.

## Solution

Create a wrapper struct that holds the SDK client and implements your interface, translating between the two APIs in one place.

```
┌──────────────────────────┐
│    PaymentProcessor      │
│    <<interface>>          │
│──────────────────────────│
│ Charge(id, amt) (txn, e) │
└────────────┬─────────────┘
             │ implements
     ┌───────▼───────┐         ┌──────────────────┐
     │StripeAdapter  │────────►│  StripeGateway   │
     │               │ has-a   │  (third-party)   │
     │ Charge(...)   │         │ CreateCharge(...) │
     └───────────────┘         └──────────────────┘
```

The adapter struct wraps the SDK and translates the call:

```go
// adapter.go
package payment

import "fmt"

// StripeAdapter adapts StripeGateway to the PaymentProcessor interface.
type StripeAdapter struct {
    gateway *StripeGateway
}

func NewStripeAdapter(apiKey string) *StripeAdapter {
    return &StripeAdapter{
        gateway: &StripeGateway{APIKey: apiKey},
    }
}

func (a *StripeAdapter) Charge(customerID string, amountCents int64) (string, error) {
    params := map[string]interface{}{
        "customer": customerID,
        "amount":   amountCents,
        "currency": "usd",
    }
    result, err := a.gateway.CreateCharge(params)
    if err != nil {
        return "", fmt.Errorf("stripe charge failed: %w", err)
    }
    txnID, ok := result["id"].(string)
    if !ok {
        return "", fmt.Errorf("unexpected response format")
    }
    return txnID, nil
}
```

Application code uses the interface — no knowledge of Stripe:

```go
// main.go
package main

import (
    "fmt"
    "payment"
)

func processOrder(pp payment.PaymentProcessor, customerID string, total int64) {
    txn, err := pp.Charge(customerID, total)
    if err != nil {
        fmt.Printf("Payment failed: %v\n", err)
        return
    }
    fmt.Printf("Payment successful: %s\n", txn)
}

func main() {
    processor := payment.NewStripeAdapter("sk_test_xxx")
    processOrder(processor, "cust_42", 4999)
}
```

Output:

```
Payment successful: ch_123
```

## When to Use

- You need to use a type whose interface doesn't match what your code expects.
- You're integrating a third-party library and want to isolate its API from your domain.
- You're writing a compatibility layer between two subsystems with different conventions.

## When Not to Use

- You can change the target interface to match — modifying the interface is simpler than wrapping.
- The adaptation is trivial (just renaming a method). Go's implicit interface satisfaction might mean you don't need a wrapper at all.
- You're adapting for hypothetical future flexibility. Only adapt when the mismatch is real.

## Advantages

- Single Responsibility: translation logic lives in one place, not scattered across callers.
- Open/Closed: add new adapters for new SDKs without modifying existing code.
- Testable: your code tests against the interface, not the SDK.

## Disadvantages

- Adds a layer of indirection — one more type to navigate.
- If the adapted API changes, the adapter must be updated (though this is better than updating every caller).
- Can mask performance issues if the translation is costly.

## Related Patterns

- **Bridge** — Bridge separates abstraction from implementation upfront; Adapter retrofits compatibility.
- **Decorator** — Decorator adds behavior while keeping the same interface; Adapter changes the interface.
- **Facade** — Facade simplifies a complex API; Adapter makes an incompatible API compatible.
- **Proxy** — Proxy provides the same interface to control access; Adapter provides a different interface.
