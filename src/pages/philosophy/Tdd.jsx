import React from "react";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";
import CodeBlock from "@/components/content/CodeBlock";
import Callout from "@/components/content/Callout";

export default function Tdd() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Breadcrumbs />

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">
        Test-Driven Development
      </h1>
      <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-2xl">
        Write a failing test. Make it pass. Refactor. Go's tooling makes this loop faster and more
        pleasant than in most languages — and the design pressure TDD creates naturally produces
        the small interfaces and clean boundaries that patterns formalize.
      </p>

      {/* Red-Green-Refactor */}
      <section className="prose-pattern">
        <h2>The red / green / refactor loop</h2>
        <p>
          TDD is not "write tests." It's a design discipline with three steps, always in order:
        </p>
        <ul>
          <li><strong>Red:</strong> Write a test for behavior that doesn't exist yet. Run it. Watch it fail. This proves the test is meaningful — it actually checks something.</li>
          <li><strong>Green:</strong> Write the smallest amount of production code that makes the test pass. Don't optimize, don't generalize. Just make the red go green.</li>
          <li><strong>Refactor:</strong> Now that you have a green test as a safety net, clean up. Extract functions, rename, remove duplication. The test tells you immediately if you break anything.</li>
        </ul>
        <p>
          The discipline is in the order. You never write production code without a failing test first. You never refactor without green tests. This prevents both over-engineering ("I might need this") and under-testing ("I'll add tests later").
        </p>
      </section>

      {/* Go's TDD tooling */}
      <section className="prose-pattern">
        <h2>Why Go makes TDD pleasant</h2>

        <h3>go test — zero configuration</h3>
        <p>
          No test runner to install, no configuration files. Put a <code>_test.go</code> file next to your code, write functions starting with <code>Test</code>, and run <code>go test ./...</code>. The convention is the configuration.
        </p>

        <h3>Table-driven tests</h3>
        <p>
          Go's most important testing idiom. Define test cases as a slice of structs, iterate with <code>t.Run</code>. Adding a new case is one line, not a new function. The test output names each subtest clearly.
        </p>
        <CodeBlock code={`func TestParseAmount(t *testing.T) {
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
}`} filename="amount_test.go" />

        <h3>Subtests and t.Parallel()</h3>
        <p>
          <code>t.Run</code> creates named subtests that can be filtered with <code>-run</code> and parallelized with <code>t.Parallel()</code>. This encourages granular test cases without function-per-case sprawl.
        </p>

        <h3>Interfaces as natural test seams</h3>
        <p>
          Because Go interfaces are satisfied implicitly, you don't need a mocking framework. Define a small interface where you need a seam, and write a simple struct that implements it for tests. No codegen, no reflection, no magic.
        </p>
        <CodeBlock code={`// In production code — accepts an interface
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
}`} filename="alert_test.go" />

        <h3>Fuzzing</h3>
        <p>
          Go 1.18 added native fuzzing. Write a <code>Fuzz</code> function, seed it with a few cases, and Go generates randomized inputs looking for panics, crashes, or assertion failures. Particularly valuable for parsers and serializers.
        </p>
      </section>

      {/* Worked Example */}
      <section className="prose-pattern">
        <h2>Worked example: TDD driving out a Strategy pattern</h2>
        <p>
          Let's build a small discount calculator, driven from a failing test, and watch how TDD pressure naturally produces a clean strategy-based design.
        </p>

        <h3>Step 1 — Red: write the failing test</h3>
        <p>
          We want to calculate order discounts. Start with the simplest case: no discount.
        </p>
        <CodeBlock code={`package discount

import "testing"

func TestNoDiscount(t *testing.T) {
    calc := NewCalculator(nil) // no discount strategy
    got := calc.FinalPrice(10000) // price in cents
    if got != 10000 {
        t.Errorf("FinalPrice(10000) = %d, want 10000", got)
    }
}`} filename="discount_test.go" />
        <p>This doesn't compile — <code>NewCalculator</code> doesn't exist. Good. Red.</p>

        <h3>Step 2 — Green: make it pass with minimum code</h3>
        <CodeBlock code={`package discount

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
}`} filename="discount.go" />
        <p>Run <code>go test</code>. Green. Now we can extend.</p>

        <h3>Step 3 — Red: add a percentage discount test</h3>
        <CodeBlock code={`func TestPercentageDiscount(t *testing.T) {
    tenPercent := func(price int64) int64 {
        return price / 10
    }
    calc := NewCalculator(tenPercent)
    got := calc.FinalPrice(10000)
    if got != 9000 {
        t.Errorf("FinalPrice(10000) = %d, want 9000", got)
    }
}`} filename="discount_test.go" />
        <p>Run <code>go test</code>. This already passes — our design is general enough. Green without new code.</p>

        <h3>Step 4 — Red: composing multiple discounts</h3>
        <CodeBlock code={`func TestStackedDiscounts(t *testing.T) {
    tenPercent := func(price int64) int64 { return price / 10 }
    flat500 := func(price int64) int64 { return 500 }

    calc := NewCalculator(Stack(tenPercent, flat500))
    // 10000 - 1000 (10%) - 500 (flat) = 8500
    got := calc.FinalPrice(10000)
    if got != 8500 {
        t.Errorf("FinalPrice(10000) = %d, want 8500", got)
    }
}`} filename="discount_test.go" />
        <p>Red — <code>Stack</code> doesn't exist.</p>

        <h3>Step 5 — Green: implement Stack</h3>
        <CodeBlock code={`// Stack composes multiple discount functions, applying each
// to the remaining price sequentially.
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
}`} filename="discount.go" />
        <p>Green. Now refactor.</p>

        <h3>Step 6 — Refactor: table-driven tests</h3>
        <CodeBlock code={`func TestCalculator(t *testing.T) {
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
}`} filename="discount_test.go" />
      </section>

      <Callout variant="tip" title="Notice what happened">
        TDD pressure naturally produced a <strong>Strategy pattern</strong> — <code>DiscountFunc</code> is a function type that encapsulates an algorithm. We didn't set out to implement Strategy; the tests drove us toward it. This is how principles and patterns connect: good tests push you toward good design.
      </Callout>

      <section className="prose-pattern">
        <h2>TDD anti-patterns to avoid</h2>
        <ul>
          <li><strong>Testing implementation, not behavior.</strong> Don't assert that a private function was called. Assert the output given an input.</li>
          <li><strong>Heavy mocking.</strong> If you need a mocking framework, your interfaces are probably too large. Shrink the interface; write a simple fake.</li>
          <li><strong>Test-after.</strong> Writing tests after the code is done gives you tests, but not the design pressure. You lose the most valuable part of TDD.</li>
          <li><strong>Skipping refactor.</strong> Green is not done. If you skip refactoring, you accumulate the exact technical debt TDD is meant to prevent.</li>
        </ul>
      </section>

      <PrevNextNav />
    </div>
  );
}