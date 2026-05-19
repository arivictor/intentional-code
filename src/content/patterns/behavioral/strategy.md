# Strategy

Strategy defines a family of algorithms and makes them interchangeable. In Go, the most idiomatic form is a function type — you pass a function value rather than creating an interface with a single method. Use the interface form when the strategy has multiple methods or carries state.

This is one of the patterns that becomes nearly invisible in Go. When someone passes a `func` to a constructor or a `sort.Slice` call, they're using Strategy without naming it.

## Problem

You're building a payment processing system. Different payment methods (credit card, PayPal, crypto) have different processing logic. A switch on the payment type in the processing function means every new method requires modifying the core code.

```go
// switch_payment.go
func ProcessPayment(method string, amount int64) error {
    switch method {
    case "credit_card":
        return chargeCreditCard(amount)
    case "paypal":
        return chargePayPal(amount)
    case "crypto":
        return chargeCrypto(amount)
    default:
        return fmt.Errorf("unsupported: %s", method)
    }
}
```

Every new payment method means editing this function. The switch is stringly typed. And you can't test one payment method without having the code for all of them compiled in.

## Solution

In Go, the simplest strategy is a function type. Define `ProcessFunc` and pass it to whoever needs it. No interface, no struct — just a function.

```
type ProcessFunc func(amount int64) error

ProcessPayment(amount, strategy)

strategy = chargeCreditCard  ──► func(int64) error
strategy = chargePayPal      ──► func(int64) error
strategy = chargeCrypto      ──► func(int64) error
```

The function-type approach — idiomatic Go:

```go
// payment.go
package payment

import "fmt"

// ProcessFunc is a strategy for processing payments.
type ProcessFunc func(amount int64) error

func CreditCard(amount int64) error {
    fmt.Printf("Charging credit card: $%.2f\n", float64(amount)/100)
    return nil
}

func PayPal(amount int64) error {
    fmt.Printf("Charging PayPal: $%.2f\n", float64(amount)/100)
    return nil
}

func Crypto(amount int64) error {
    fmt.Printf("Charging crypto: $%.2f\n", float64(amount)/100)
    return nil
}

// ProcessPayment accepts the strategy as a function.
func ProcessPayment(amount int64, process ProcessFunc) error {
    fmt.Println("Validating payment...")
    return process(amount)
}
```

When a strategy needs state or multiple methods, use an interface instead:

```go
// gateway.go
package payment

import "fmt"

// PaymentGateway — interface form for strategies with state.
type PaymentGateway interface {
    Charge(amount int64) error
    Refund(txnID string) error
}

type StripeGateway struct {
    APIKey string
}

func (s *StripeGateway) Charge(amount int64) error {
    fmt.Printf("[Stripe] charge $%.2f\n", float64(amount)/100)
    return nil
}

func (s *StripeGateway) Refund(txnID string) error {
    fmt.Printf("[Stripe] refund %s\n", txnID)
    return nil
}
```

```go
// main.go
package main

import (
    "fmt"
    "payment"
)

func main() {
    payment.ProcessPayment(4999, payment.CreditCard)
    payment.ProcessPayment(2500, payment.PayPal)

    gw := &payment.StripeGateway{APIKey: "sk_test"}
    gw.Charge(9999)
    gw.Refund("txn_123")
}
```

Output:

```
Validating payment...
Charging credit card: $49.99
Validating payment...
Charging PayPal: $25.00
[Stripe] charge $99.99
[Stripe] refund txn_123
```

> In Go, a function type IS a strategy. `sort.Slice(data, func(i, j int) bool { ... })` is Strategy. You don't need an interface for single-method strategies — a `func` type is simpler and more idiomatic.

## When to Use

- You see a switch or if/else selecting an algorithm based on a type or configuration.
- The algorithm should be interchangeable at runtime.
- You want to test business logic independently of the algorithm choice.
- In Go: if the strategy is a single function, use a function type. If it has state or multiple methods, use an interface.

## When Not to Use

- There's only one algorithm and no expectation of alternatives. Just call the function directly.
- The algorithms are trivially different. Abstracting them adds ceremony without value.

## Advantages

- Algorithms are interchangeable without modifying the context.
- Each strategy is independently testable.
- Function types make it extremely lightweight — no struct or interface needed.

## Disadvantages

- Function types can't carry state (without closures).
- With many strategies, the caller must know which to select (the switch moves to the caller).
- Abstraction has a readability cost — direct calls are easier to trace.

## Related Patterns

- **Bridge** — Bridge separates two dimensions; Strategy varies one dimension.
- **State** — Both swap behavior at runtime. Strategy is chosen externally; State transitions internally.
- **Template Method** — Template Method uses inheritance for variation points; Strategy uses composition.
- **Command** — Both encapsulate behavior as a value. Command adds undo and queuing.
