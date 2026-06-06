---
title: Test-Driven Development
description: The red/green/refactor loop in Go, and how design pressure naturally produces patterns.
---

# Test-Driven Development

Write a failing test. Make it pass. Refactor. Go's tooling makes this loop faster and more pleasant than in most languages: `go test ./...` needs no configuration, implicit interfaces eliminate the need for mocking frameworks, and table-driven tests keep test cases as data rather than duplicated functions. More importantly, the design pressure TDD creates naturally produces the small interfaces and clean boundaries that patterns like [Strategy](/go/patterns/behavioral/strategy), [Repository](/go/patterns/architectural/repository), and [Observer](/go/patterns/behavioral/observer) formalize. You often arrive at the pattern without setting out to implement it.

## The red / green / refactor loop

TDD is not "write tests." It's a design discipline with three steps, always in order:

- **Red:** Write a test for behavior that doesn't exist yet. Run it. Watch it fail. This proves the test is meaningful; it actually checks something.
- **Green:** Write the smallest amount of production code that makes the test pass. Don't optimise, don't generalize. Just make the red go green.
- **Refactor:** Now that you have a green test as a safety net, clean up. Extract functions, rename, remove duplication. The test tells you immediately if you break anything.

The discipline is in the order. You never write production code without a failing test first. You never refactor without green tests. This prevents both over-engineering ("I might need this") and under-testing ("I'll add tests later").

## Why Go makes TDD pleasant

### go test: zero configuration

No test runner to install, no configuration files. Put a `_test.go` file next to your code, write functions starting with `Test`, and run `go test ./...`. The convention is the configuration.

### Table-driven tests

Go's most important testing idiom. Define test cases as a slice of structs, iterate with `t.Run`. Adding a new case is one line, not a new function. The test output names each subtest clearly.

```go
// amount_test.go
func TestParseAmount(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    int64
        wantErr bool
    }{
        {name: "whole dollars",    input: "42",     want: 4200},
        {name: "with cents",       input: "19.99",  want: 1999},
        {name: "leading zero",     input: "0.50",   want: 50},
        {name: "empty string",     input: "",        wantErr: true},
        {name: "not a number",     input: "abc",    wantErr: true},
        {name: "negative",         input: "-10.00", want: -1000},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := ParseAmount(tt.input)
            if tt.wantErr {
                if err == nil {
                    t.Fatal("expected error, got nil")
                }
                return
            }
            if err != nil {
                t.Fatalf("unexpected error: %v", err)
            }
            if got != tt.want {
                t.Errorf("ParseAmount(%q) = %d, want %d", tt.input, got, tt.want)
            }
        })
    }
}
```

### Subtests and t.Parallel()

`t.Run` creates named subtests that can be filtered with `-run` and parallelised with `t.Parallel()`. This encourages granular test cases without function-per-case sprawl.

### Interfaces as natural test seams

Because Go interfaces are satisfied implicitly, you don't need a mocking framework. Define a small interface where you need a seam, and write a simple struct that implements it for tests. No codegen, no reflection, no magic.

```go
// alert_test.go

// In production code — accepts an interface
type Sender interface {
    Send(to, body string) error
}

type AlertService struct {
    sender Sender
}

func (a *AlertService) Alert(user User, msg string) error {
    return a.sender.Send(user.Email, msg)
}

// In test — a simple fake, not a mock framework
type fakeSender struct {
    calls []struct{ to, body string }
}

func (f *fakeSender) Send(to, body string) error {
    f.calls = append(f.calls, struct{ to, body string }{to, body})
    return nil
}

func TestAlertService(t *testing.T) {
    fs := &fakeSender{}
    svc := &AlertService{sender: fs}

    err := svc.Alert(User{Email: "a@b.com"}, "server down")
    if err != nil {
        t.Fatal(err)
    }
    if len(fs.calls) != 1 {
        t.Fatalf("expected 1 call, got %d", len(fs.calls))
    }
    if fs.calls[0].to != "a@b.com" {
        t.Errorf("sent to %q, want %q", fs.calls[0].to, "a@b.com")
    }
}
```

### Fuzzing

Go 1.18 added native fuzzing. Write a `Fuzz` function, seed it with a few cases, and Go generates randomised inputs looking for panics, crashes, or assertion failures. Particularly valuable for parsers and serializers.

## Worked example: TDD driving out a Strategy pattern

Let's build a small discount calculator, driven from a failing test, and watch how TDD pressure naturally produces a clean strategy-based design.

### Step 1: Red, write the failing test

We want to calculate order discounts. Start with the simplest case: no discount.

```go
// discount_test.go
package discount

import "testing"

func TestNoDiscount(t *testing.T) {
    calc := NewCalculator(nil) // no discount strategy
    got := calc.FinalPrice(10000) // price in cents
    if got != 10000 {
        t.Errorf("FinalPrice(10000) = %d, want 10000", got)
    }
}
```

This doesn't compile. `NewCalculator` doesn't exist. Good. Red.

### Step 2: Green, make it pass with minimum code

```go
// discount.go
package discount

// DiscountFunc calculates a discount on a price in cents.
type DiscountFunc func(price int64) int64

type Calculator struct {
    discount DiscountFunc
}

func NewCalculator(df DiscountFunc) *Calculator {
    return &Calculator{discount: df}
}

func (c *Calculator) FinalPrice(price int64) int64 {
    if c.discount == nil {
        return price
    }
    return price - c.discount(price)
}
```

Run `go test`. Green. Now we can extend.

### Step 3: Red, add a percentage discount test

```go
// discount_test.go
func TestPercentageDiscount(t *testing.T) {
    tenPercent := func(price int64) int64 {
        return price / 10
    }
    calc := NewCalculator(tenPercent)
    got := calc.FinalPrice(10000)
    if got != 9000 {
        t.Errorf("FinalPrice(10000) = %d, want 9000", got)
    }
}
```

Run `go test`. This already passes; our design is general enough. Green without new code.

### Step 4: Red, composing multiple discounts

```go
// discount_test.go
func TestStackedDiscounts(t *testing.T) {
    tenPercent := func(price int64) int64 { return price / 10 }
    flat500 := func(price int64) int64 { return 500 }

    calc := NewCalculator(Stack(tenPercent, flat500))
    // 10000 - 1000 (10%) - 500 (flat) = 8500
    got := calc.FinalPrice(10000)
    if got != 8500 {
        t.Errorf("FinalPrice(10000) = %d, want 8500", got)
    }
}
```

Red. `Stack` doesn't exist.

### Step 5: Green, implement Stack

```go
// discount.go
func Stack(fns ...DiscountFunc) DiscountFunc {
    return func(price int64) int64 {
        total := int64(0)
        remaining := price
        for _, fn := range fns {
            d := fn(remaining)
            total += d
            remaining -= d
        }
        return total
    }
}
```

Green. Now refactor.

Tests run under `go test`, which the in-browser runner can't invoke; it executes `func main`. So to see the same assertions here, we drive the calculator from `main` and print each result as pass or fail:

```go:title="main.go":run=true:editable=true
package main

import "fmt"

// DiscountFunc calculates a discount on a price in cents.
type DiscountFunc func(price int64) int64

type Calculator struct {
    discount DiscountFunc
}

func NewCalculator(df DiscountFunc) *Calculator {
    return &Calculator{discount: df}
}

func (c *Calculator) FinalPrice(price int64) int64 {
    if c.discount == nil {
        return price
    }
    return price - c.discount(price)
}

func Stack(fns ...DiscountFunc) DiscountFunc {
    return func(price int64) int64 {
        total := int64(0)
        remaining := price
        for _, fn := range fns {
            d := fn(remaining)
            total += d
            remaining -= d
        }
        return total
    }
}

func check(name string, got, want int64) {
    if got == want {
        fmt.Printf("PASS %s: %d\n", name, got)
    } else {
        fmt.Printf("FAIL %s: got %d, want %d\n", name, got, want)
    }
}

func main() {
    tenPercent := func(price int64) int64 { return price / 10 }
    flat500 := func(price int64) int64 { return 500 }

    check("no discount", NewCalculator(nil).FinalPrice(10000), 10000)
    check("10 percent", NewCalculator(tenPercent).FinalPrice(10000), 9000)
    check("stacked", NewCalculator(Stack(tenPercent, flat500)).FinalPrice(10000), 8500)
}
```

### Step 6: Refactor, table-driven tests

```go
// discount_test.go
func TestCalculator(t *testing.T) {
    tenPercent := func(price int64) int64 { return price / 10 }
    flat500 := func(price int64) int64 { return 500 }

    tests := []struct {
        name     string
        discount DiscountFunc
        price    int64
        want     int64
    }{
        {"no discount",     nil,                       10000, 10000},
        {"10 percent",      tenPercent,                10000, 9000},
        {"flat 500",        flat500,                   10000, 9500},
        {"stacked",         Stack(tenPercent, flat500), 10000, 8500},
        {"zero price",      tenPercent,                0,     0},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            calc := NewCalculator(tt.discount)
            got := calc.FinalPrice(tt.price)
            if got != tt.want {
                t.Errorf("FinalPrice(%d) = %d, want %d", tt.price, got, tt.want)
            }
        })
    }
}
```

> **Notice what happened.** TDD pressure naturally produced a [Strategy](/go/patterns/behavioral/strategy) pattern. `DiscountFunc` is a function type that encapsulates an algorithm. We didn't set out to implement Strategy; the tests drove us toward it. This is how principles and patterns connect: good tests push you toward good design.

## TDD anti-patterns to avoid

- **Testing implementation, not behavior.** Don't assert that a private function was called. Assert the output given an input.
- **Heavy mocking.** If you need a mocking framework, your interfaces are probably too large. Shrink the interface; write a simple fake.
- **Test-after.** Writing tests after the code is done gives you tests, but not the design pressure. You lose the most valuable part of TDD.
- **Skipping refactor.** Green is not done. If you skip refactoring, you accumulate the exact technical debt TDD is meant to prevent.
