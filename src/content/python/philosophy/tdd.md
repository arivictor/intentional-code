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

## Why Go makes TDD pleasant

### go test — zero configuration

No test runner to install, no configuration files. Put a `_test.go` file next to your code, write functions starting with `Test`, and run `go test ./...`. The convention is the configuration.

### Table-driven tests

Go's most important testing idiom. Define test cases as a slice of structs, iterate with `t.Run`. Adding a new case is one line, not a new function. The test output names each subtest clearly.

```python
# amount_test.py
def test_parse_amount(t):
    tests = []struct {
    name    string
    input   string
    want    int64
    wantErr bool
    :
    :name: "whole dollars",    input: "42",     want: 4200
    :name: "with cents",       input: "19.99",  want: 1999
    :name: "leading zero",     input: "0.50",   want: 50
    :name: "empty string",     input: "",        wantErr: True
    :name: "not a number",     input: "abc",    wantErr: True
    :name: "negative",         input: "-10.00", want: -1000
for tt in tests:
    t.Run(tt.name, func(t *testing.T) :
    got, err := ParseAmount(tt.input)
    if tt.wantErr :
        if err is None :
            t.Fatal("expected error, got None")
        return
    if err is not None :
        t.Fatalf("unexpected error: %v", err)
    if got != tt.want :
        t.Errorf("ParseAmount(%q) = %d, want %d", tt.input, got, tt.want)
    )
```

### Subtests and t.Parallel()

`t.Run` creates named subtests that can be filtered with `-run` and parallelized with `t.Parallel()`. This encourages granular test cases without function-per-case sprawl.

### Interfaces as natural test seams

Because Go interfaces are satisfied implicitly, you don't need a mocking framework. Define a small interface where you need a seam, and write a simple struct that implements it for tests. No codegen, no reflection, no magic.

```python
from typing import Protocol

# alert_test.py

# In production code — accepts an interface
class Sender(Protocol):
    def send(self, to, body): ...

class AlertService:
    sender: Sender

def alert(self, user, msg):
    return a.sender.Send(user.Email, msg)

# In test — a simple fake, not a mock framework
class fakeSender:
    calls list[struct: to, body string

def send(self, to, body):
    f.calls = append(f.calls, struct: to, body string :to, body)
    return None

def test_alert_service(t):
    fs = fakeSender{}
    svc = AlertService{sender: fs}

    err = svc.Alert(User{Email: "a@b.com"}, "server down")
    if err is not None :
        t.Fatal(err)
    if len(fs.calls) != 1 :
        t.Fatalf("expected 1 call, got %d", len(fs.calls))
    if fs.calls[0].to != "a@b.com" :
        t.Errorf("sent to %q, want %q", fs.calls[0].to, "a@b.com")
```

### Fuzzing

Go 1.18 added native fuzzing. Write a `Fuzz` function, seed it with a few cases, and Go generates randomized inputs looking for panics, crashes, or assertion failures. Particularly valuable for parsers and serializers.

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
