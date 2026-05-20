---
title: "Facade"
category: structural
intent: "Provide a simple, unified interface to a complex subsystem, shielding clients from internal complexity."
idiomSummary: "Expose a small Pythonic API over a noisy or multi-step subsystem."
relatedSlugs: ["adapter", "mediator"]
tags: [interfaces, composition, testability, dependency-inversion]
isFeatured: true
---

# Facade

Facade is the pattern for orchestration code that gets duplicated. When an HTTP handler, a CLI tool, and a batch processor all repeat the same multi-step sequence — validate, charge, reserve, notify — that sequence belongs in one class, not scattered across entry points. In Python, a facade class accepts its subsystems as protocol-typed dependencies (making them testable and swappable) and exposes one or a few high-level methods that cover the common case.

## Problem

You're building an e-commerce checkout. The process involves validating the cart, checking inventory, processing payment, sending a confirmation email, and updating analytics. Each subsystem has its own module with its own API. Orchestrating all of them in every handler that needs "checkout" logic is verbose and error-prone.

```python
# checkout_scattered.py


def handle_checkout(request: dict) -> str:
    cart = load_cart(request)
    validate_cart(cart)  # raises on failure

    for item in cart["items"]:
        if not inventory.check(item["sku"], item["qty"]):
            raise ValueError(f"item {item['sku']} not available")

    txn_id = payment.charge(cart["customer_id"], cart["total"])
    inventory.reserve(cart["items"])
    email.send_confirmation(cart["customer_email"], txn_id)
    analytics.track("checkout", {"txn": txn_id})
    return txn_id
    # Every handler that needs checkout must repeat this dance
```

This orchestration logic is duplicated wherever checkout happens — the HTTP handler, a CLI tool, a batch processor. Change the sequence (e.g., add fraud checking) and you must find and update every copy.

## Solution

Create a `CheckoutFacade` class that encapsulates the multi-step process. Callers get one method; the facade coordinates the subsystems.

```
                  ┌────────────────────┐
    Handler ─────►│  CheckoutFacade    │
    CLI    ─────►│                    │
    Batch  ─────►│  place_order(cart) │
                  └───────┬────────────┘
                          │ coordinates
            ┌─────────────┼─────────────────┐
            │             │                 │
      ┌─────▼────┐  ┌─────▼────┐   ┌───────▼──────┐
      │ Inventory │  │ Payment  │   │ Email/Analyt.│
      └──────────┘  └──────────┘   └──────────────┘
```

```python
# checkout.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


# Dependencies as narrow protocols — testable and swappable.
class InventoryChecker(Protocol):
    def available(self, sku: str, qty: int) -> bool: ...
    def reserve(self, sku: str, qty: int) -> None: ...


class PaymentProcessor(Protocol):
    def charge(self, customer_id: str, amount_cents: int) -> str: ...  # returns txn_id


class Mailer(Protocol):
    def send_confirmation(self, email: str, txn_id: str) -> None: ...


@dataclass
class CartItem:
    sku: str
    qty: int


@dataclass
class Cart:
    customer_id: str
    customer_email: str
    items: list[CartItem] = field(default_factory=list)
    total_cents: int = 0


class CheckoutFacade:
    """Coordinates the full checkout process for any entry point."""

    def __init__(
        self,
        inventory: InventoryChecker,
        payment: PaymentProcessor,
        mailer: Mailer,
    ) -> None:
        self._inventory = inventory
        self._payment = payment
        self._mailer = mailer

    def place_order(self, cart: Cart) -> str:
        """Validate, charge, reserve, and notify. Returns the transaction ID."""
        for item in cart.items:
            if not self._inventory.available(item.sku, item.qty):
                raise ValueError(f"item {item.sku!r} not available")

        txn_id = self._payment.charge(cart.customer_id, cart.total_cents)

        for item in cart.items:
            self._inventory.reserve(item.sku, item.qty)

        self._mailer.send_confirmation(cart.customer_email, txn_id)

        return txn_id
```

```python
# main.py
from checkout import Cart, CartItem, CheckoutFacade
from warehouse import WarehouseInventory
from stripe_client import StripePayment
from sendgrid_client import SendGridMailer


def main() -> None:
    facade = CheckoutFacade(
        inventory=WarehouseInventory(),
        payment=StripePayment(api_key="sk_live_..."),
        mailer=SendGridMailer(api_key="SG...."),
    )

    cart = Cart(
        customer_id="cust_42",
        customer_email="alice@example.com",
        items=[CartItem(sku="WIDGET-7", qty=2)],
        total_cents=4999,
    )

    txn_id = facade.place_order(cart)
    print(f"Order placed: {txn_id}")
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
