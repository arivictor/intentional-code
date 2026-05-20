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
    def send(self, to, body): ...

class AlertService:
    def __init__(self, sender: Sender):
        self.sender = sender

    def alert(self, user, msg):
        self.sender.send(user.email, msg)

class FakeSender:
    def __init__(self):
        self.calls = []

    def send(self, to, body):
        self.calls.append((to, body))

def test_alert_service():
    sender = FakeSender()
    service = AlertService(sender)

    service.alert(type("User", (), {"email": "a@b.com"})(), "server down")

    assert sender.calls == [("a@b.com", "server down")]
```

### Property-style testing and fuzzing

Python has strong options here too: `hypothesis` can generate structured inputs for property-based testing, and randomized tests are especially valuable for parsers, serializers, and boundary-heavy business rules.

## Worked example: TDD driving out a Strategy pattern

Let's build a small discount calculator, driven from a failing test, and watch how TDD pressure naturally produces a clean strategy-based design.

### Step 1 — Red: write the failing test

We want to calculate order discounts. Start with the simplest case: no discount.

```python
# discount_test.py


def test_no_discount(t):
    calc = NewCalculator(None) // no discount strategy
    got = calc.FinalPrice(10000) // price in cents
    if got != 10000 :
        t.Errorf("FinalPrice(10000) = %d, want 10000", got)
```

This doesn't compile — `NewCalculator` doesn't exist. Good. Red.

### Step 2 — Green: make it pass with minimum code

```python
# discount.py

# DiscountFunc calculates a discount on a price in cents.
type DiscountFunc func(price int64) int64

class Calculator:
    discount: DiscountFunc

def new_calculator(df):
    return &Calculator{discount: df

def final_price(self, price):
    if c.discount is None :
        return price
    return price - c.discount(price)
```

Run `go test`. Green. Now we can extend.

### Step 3 — Red: add a percentage discount test

```python
# discount_test.py
def test_percentage_discount(t):
    ten_percent = func(price int64) int64 {
    return price / 10
calc = NewCalculator(tenPercent)
got = calc.FinalPrice(10000)
if got != 9000 :
    t.Errorf("FinalPrice(10000) = %d, want 9000", got)
```

Run `go test`. This already passes — our design is general enough. Green without new code.

### Step 4 — Red: composing multiple discounts

```python
# discount_test.py
def test_stacked_discounts(t):
    ten_percent = func(price int64) int64 { return price / 10 }
    flat500 = func(price int64) int64 { return 500 }

    calc = NewCalculator(Stack(tenPercent, flat500))
    # 10000 - 1000 (10%) - 500 (flat) = 8500
    got = calc.FinalPrice(10000)
    if got != 8500 :
        t.Errorf("FinalPrice(10000) = %d, want 8500", got)
```

Red — `Stack` doesn't exist.

### Step 5 — Green: implement Stack

```python
# discount.py
def stack(fns):
    return func(price int64) int64 {
    total = int64(0)
    remaining = price
    for fn in fns:
        d = fn(remaining)
        total += d
        remaining -= d
    return total
```

Green. Now refactor.

### Step 6 — Refactor: table-driven tests

```python
# discount_test.py
def test_calculator(t):
    ten_percent = func(price int64) int64 { return price / 10 }
    flat500 = func(price int64) int64 { return 500 }

    tests = []struct {
    name     string
    discount DiscountFunc
    price    int64
    want     int64
    :
    :"no discount",     None,                       10000, 10000
    :"10 percent",      tenPercent,                10000, 9000
    :"flat 500",        flat500,                   10000, 9500
    :"stacked",         Stack(tenPercent, flat500), 10000, 8500
    :"zero price",      tenPercent,                0,     0
for tt in tests:
    t.Run(tt.name, func(t *testing.T) :
    calc = NewCalculator(tt.discount)
    got = calc.FinalPrice(tt.price)
    if got != tt.want :
        t.Errorf("FinalPrice(%d) = %d, want %d", tt.price, got, tt.want)
    )
```

> **Notice what happened.** TDD pressure naturally produced a [Strategy](/python/patterns/behavioral/strategy) pattern — `DiscountFunc` is a function type that encapsulates an algorithm. We didn't set out to implement Strategy; the tests drove us toward it. This is how principles and patterns connect: good tests push you toward good design.

## TDD anti-patterns to avoid

- **Testing implementation, not behavior.** Don't assert that a private function was called. Assert the output given an input.
- **Heavy mocking.** If you need a mocking framework, your interfaces are probably too large. Shrink the interface; write a simple fake.
- **Test-after.** Writing tests after the code is done gives you tests, but not the design pressure. You lose the most valuable part of TDD.
- **Skipping refactor.** Green is not done. If you skip refactoring, you accumulate the exact technical debt TDD is meant to prevent.
