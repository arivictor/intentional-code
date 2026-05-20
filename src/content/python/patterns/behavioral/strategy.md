---
title: "Strategy"
category: behavioral
intent: "Define a family of algorithms, encapsulate each one, and make them interchangeable at runtime."
idiomSummary: "Inject interchangeable algorithms as callables or small objects behind a shared protocol."
relatedSlugs: ["bridge", "state", "template-method", "command"]
tags: [interfaces, closures, testability, dependency-inversion]
---

# Strategy

Strategy defines a family of algorithms and makes them interchangeable. In Python, the most idiomatic form is a function type — you pass a function value rather than creating an interface with a single method. Use the interface form when the strategy has multiple methods or carries state.

This is the [Open/Closed Principle](/python/philosophy/solid) applied to algorithms — the context is open to new behaviours without modifying existing code. It's also one of the patterns that becomes nearly invisible in Go. When someone passes a `func` to a constructor or a `sort.Slice` call, they're using Strategy without naming it.

## Problem

You're building a payment processing system. Different payment methods (credit card, PayPal, crypto) have different processing logic. A switch on the payment type in the processing function means every new method requires modifying the core code.

```python
# switch_payment.py
def process_payment(method, amount):
    match method:
    case "credit_card":
        return chargeCreditCard(amount)
    case "paypal":
        return chargePayPal(amount)
    case "crypto":
        return chargeCrypto(amount)
    case _:
        return fmt.Errorf("unsupported: %s", method)
    pass
```

Every new payment method means editing this function. The switch is stringly typed. And you can't test one payment method without having the code for all of them compiled in.

## Solution

In Python, the simplest strategy is a function type. Define `ProcessFunc` and pass it to whoever needs it. No interface, no struct — just a function.

```
type ProcessFunc func(amount int64) error

ProcessPayment(amount, strategy)

strategy = chargeCreditCard  ──► func(int64) error
strategy = chargePayPal      ──► func(int64) error
strategy = chargeCrypto      ──► func(int64) error
```

The function-type approach — idiomatic Python:

```python
# payment.py


# ProcessFunc is a strategy for processing payments.
type ProcessFunc func(amount int64) error

def credit_card(amount):
    fmt.Printf("Charging credit card: $%.2f\n", float64(amount)/100)
    return None

def pay_pal(amount):
    fmt.Printf("Charging PayPal: $%.2f\n", float64(amount)/100)
    return None

def crypto(amount):
    fmt.Printf("Charging crypto: $%.2f\n", float64(amount)/100)
    return None

# ProcessPayment accepts the strategy as a function.
def process_payment(amount, process):
    print("Validating payment...")
    return process(amount)
```

When a strategy needs state or multiple methods, use an interface instead:

```python
from typing import Protocol

# gateway.py


# PaymentGateway — interface form for strategies with state.
class PaymentGateway(Protocol):
    def charge(self, amount): ...
    def refund(self, txn_id): ...

class StripeGateway:
    api_key: string

def charge(self, amount):
    fmt.Printf("[Stripe] charge $%.2f\n", float64(amount)/100)
    return None

def refund(self, txn_id):
    fmt.Printf("[Stripe] refund %s\n", txnID)
    return None
```

```python
# main.py

"fmt"
"payment"

def main():
    payment.ProcessPayment(4999, payment.CreditCard)
    payment.ProcessPayment(2500, payment.PayPal)

    gw = payment.StripeGateway{APIKey: "sk_test"}
    gw.Charge(9999)
    gw.Refund("txn_123")
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

> In Python, a function type IS a strategy. `sort.Slice(data, func(i, j int) bool { ... })` is Strategy. You don't need an interface for single-method strategies — a `func` type is simpler and more idiomatic.

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

- **Bridge** — Strategy varies one interchangeable algorithm; Bridge separates two independent dimensions of variation simultaneously — if you have two axes (abstraction + implementation), Bridge; if you have one (algorithm selection), Strategy.
- **State** — Both swap behavior at runtime; the distinction is who controls the swap — Strategy is chosen and set by an external caller, State transitions internally in response to events.
- **Template Method** — Template Method holds the algorithm skeleton fixed and plugs in one or two steps; Strategy replaces the whole algorithm — prefer Template Method when the structure matters, Strategy when it doesn't.
- **Command** — Both encapsulate behavior as a value; Command adds undo and queuing on top — if you need those capabilities, use Command; if you only need interchangeability, Strategy is simpler.
