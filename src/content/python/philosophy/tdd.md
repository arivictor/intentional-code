---
title: Test-Driven Development
description: The red/green/refactor loop in Python — and how design pressure naturally produces patterns.
---

# Test-Driven Development

Write a failing test. Make it pass. Refactor. Python makes this loop approachable: `pytest` or `python -m unittest` gives quick feedback, dependency injection keeps collaborators easy to fake, and parameterized tests let you treat examples as data instead of duplicating test functions. More importantly, the design pressure TDD creates naturally produces the small protocols and clean boundaries that patterns like [Strategy](/python/patterns/behavioral/strategy), [Repository](/python/patterns/architectural/repository), and [Observer](/python/patterns/behavioral/observer) formalize — you often arrive at the pattern without setting out to implement it.

## The red / green / refactor loop

TDD is not "write tests." It's a design discipline with three steps, always in order:

- **Red:** Write a test for behavior that doesn't exist yet. Run it. Watch it fail. This proves the test is meaningful — it actually checks something.
- **Green:** Write the smallest amount of production code that makes the test pass. Don't optimize, don't generalize. Just make the red go green.
- **Refactor:** Now that you have a green test as a safety net, clean up. Extract functions, rename, remove duplication. The test tells you immediately if you break anything.

The discipline is in the order. You never write production code without a failing test first. You never refactor without green tests. This prevents both over-engineering ("I might need this") and under-testing ("I'll add tests later").

## Why Python makes TDD pleasant

### Fast feedback with pytest or unittest

No heavy harness is required. Put tests next to the code, run `pytest` or `python -m unittest`, and tighten the loop until failing tests turn green quickly. The convention is light, and the tooling is mature.

### Parameterized tests

Python's version of table-driven tests is parameterization. Define the examples as data, let the test runner expand them, and keep the behavior under test more visible than the test scaffolding.

```python
import pytest

from payments import parse_amount


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("42", 4200),
        ("19.99", 1999),
        ("0.50", 50),
        ("-10.00", -1000),
    ],
)
def test_parse_amount(raw, expected):
    assert parse_amount(raw) == expected


@pytest.mark.parametrize("raw", ["", "abc"])
def test_parse_amount_rejects_invalid_values(raw):
    with pytest.raises(ValueError):
        parse_amount(raw)
```

### Focused tests and selective runs

Python test runners make it easy to isolate behavior. You can filter by test name, file, marker, or class, and keep expensive integration tests separate from the fast unit tests that drive design.

### Protocols as natural test seams

Because Python works well with duck typing and small protocols, you rarely need a heavyweight mocking framework. Define a narrow protocol where you need a seam, and hand-roll a tiny fake for the test. No code generation, no reflection tricks, no brittle setup.

```python
from typing import Protocol

# alert_test.py

class Sender(Protocol):
    def send(self, to: str, body: str) -> None: ...

class AlertService:
    def __init__(self, sender: Sender) -> None:
        self._sender = sender

    def alert(self, email: str, msg: str) -> None:
        self._sender.send(email, msg)

class FakeSender:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def send(self, to: str, body: str) -> None:
        self.calls.append((to, body))

def test_alert_service() -> None:
    sender = FakeSender()
    service = AlertService(sender)
    service.alert("a@b.com", "server down")
    assert sender.calls == [("a@b.com", "server down")]
```

### Property-based testing

Python has strong options here too: `hypothesis` can generate structured inputs for property-based testing, and randomized tests are especially valuable for parsers, serializers, and boundary-heavy business rules.

## Worked example: TDD driving out a Strategy pattern

Let's build a small discount calculator, driven from a failing test, and watch how TDD pressure naturally produces a clean strategy-based design.

### Step 1 — Red: write the failing test

We want to calculate order discounts. Start with the simplest case: no discount.

```python
# test_discount.py

def test_no_discount():
    calc = Calculator(discount=None)  # no discount strategy
    assert calc.final_price(10_000) == 10_000  # price in cents
```

Running `pytest` now fails with `NameError: name 'Calculator' is not defined`. Good. Red.

### Step 2 — Green: make it pass with minimum code

```python
# discount.py
from typing import Callable, Optional

# A DiscountFn takes a price in cents and returns the discount amount.
DiscountFn = Callable[[int], int]


class Calculator:
    def __init__(self, discount: Optional[DiscountFn] = None) -> None:
        self._discount = discount

    def final_price(self, price: int) -> int:
        if self._discount is None:
            return price
        return price - self._discount(price)
```

Run `pytest`. Green. Now we can extend.

### Step 3 — Red: add a percentage discount test

```python
# test_discount.py

def test_percentage_discount():
    ten_percent: DiscountFn = lambda price: price // 10
    calc = Calculator(discount=ten_percent)
    assert calc.final_price(10_000) == 9_000
```

This already passes — our design is general enough. Green without new code.

### Step 4 — Red: composing multiple discounts

```python
# test_discount.py

def test_stacked_discounts():
    ten_percent: DiscountFn = lambda price: price // 10
    flat_500: DiscountFn = lambda price: 500

    calc = Calculator(discount=stack(ten_percent, flat_500))
    # 10_000 - 1_000 (10 %) - 500 (flat) = 8_500
    assert calc.final_price(10_000) == 8_500
```

Red — `stack` doesn't exist yet.

### Step 5 — Green: implement stack

```python
# discount.py  (addition)

def stack(*fns: DiscountFn) -> DiscountFn:
    """Combine multiple discount functions, applying each to the remaining price."""
    def combined(price: int) -> int:
        total_discount = 0
        remaining = price
        for fn in fns:
            d = fn(remaining)
            total_discount += d
            remaining -= d
        return total_discount
    return combined
```

Green. Now refactor.

### Step 6 — Refactor: parameterized tests

```python
# test_discount.py
import pytest
from discount import Calculator, DiscountFn, stack

_ten_percent: DiscountFn = lambda price: price // 10
_flat_500: DiscountFn = lambda price: 500


@pytest.mark.parametrize(
    ("discount", "price", "expected"),
    [
        (None,                               10_000, 10_000),
        (_ten_percent,                       10_000,  9_000),
        (_flat_500,                          10_000,  9_500),
        (stack(_ten_percent, _flat_500),     10_000,  8_500),
        (_ten_percent,                            0,      0),
    ],
    ids=["no discount", "10 percent", "flat 500", "stacked", "zero price"],
)
def test_calculator(discount: DiscountFn | None, price: int, expected: int) -> None:
    calc = Calculator(discount=discount)
    assert calc.final_price(price) == expected
```

> **Notice what happened.** TDD pressure naturally produced a [Strategy](/python/patterns/behavioral/strategy) pattern — `DiscountFn` is a callable type alias that encapsulates an algorithm. We didn't set out to implement Strategy; the tests drove us toward it. This is how principles and patterns connect: good tests push you toward good design.

## TDD anti-patterns to avoid

- **Testing implementation, not behavior.** Don't assert that a private method was called. Assert the output given an input.
- **Heavy mocking.** If you need `unittest.mock` to patch deep internals, your abstractions are probably too large. Shrink the protocol; write a simple fake.
- **Test-after.** Writing tests after the code is done gives you tests, but not the design pressure. You lose the most valuable part of TDD.
- **Skipping refactor.** Green is not done. If you skip refactoring, you accumulate the exact technical debt TDD is meant to prevent.
