---
title: Hard to test is the design talking — listen to it
nav_title: Listen to the tests
description: TDD is a design discipline first; the tests it leaves behind are a byproduct.
order: 7
---

# Hard to test is the design talking — listen to it

Tests call your function with nothing but the public surface, no insider knowledge, no sympathy for how the internals happen to work. So when a test is miserable to write, when it needs a wall of setup, or a mock for every collaborator, or a database spun up to check a pricing rule, that pain is the design speaking plainly: the boundaries are in the wrong place, this unit knows too much, the dependencies are concrete where they should be abstract.

> [!IMPORTANT] If you find yourself struggling to write a test, the problem is the design, not the test.

The mistake is to treat the symptom. Reaching for a heavier mocking framework to subdue a stubborn test is like turning up the radio to drown out the engine noise. The fix is upstream, in the design. Shrink the interface. Pull the side effect out of the calculation. Pass the dependency in instead of reaching for it. Do that and the test gets easy — because the design got better.

That's the whole reason testability is worth caring about: "easy to test" and "easy to change" turn out to be the same property viewed from two angles, and the test is the cheapest place to feel the difference early.

## Test-Driven Development

The tightest way to keep this feedback loop running is to write the test first: let the difficulty of the test push on the design before the code hardens around a bad shape. The common framing is that TDD is a testing practice: you do it to end up with good test coverage. That is only half true. The real product of TDD is the design pressure, the act of writing the test first forces you to shape the code well (small interfaces, injectable dependencies, clear behaviour boundaries). The test suite you end up with is a side effect, a byproduct 

TDD is a design discipline and the discipline is the order. 

1. Red (write a failing test for behaviour that doesn't exist yet),
2. Green (the smallest code that makes it pass),
3. Refactor (clean up under the safety of a green test).

You must never write production code without a failing test first; and you must never refactor without green.

> The real product of TDD is the design pressure, the act of writing the test first forces you to shape the code well

Because Go interfaces are satisfied implicitly, the pressure shows up immediately. Where you need a seam, you define a small interface and write a plain struct for it in the test. No mocking framework, no codegen.

```go
// In production code — accept a small interface where you need a seam.
type Sender interface {
    Send(to, body string) error
}

type AlertService struct {
    sender Sender
}

func (a *AlertService) Alert(user User, msg string) error {
    return a.sender.Send(user.Email, msg)
}

// In the test — a simple fake, not a mock framework.
type fakeSender struct {
    calls []struct{ to, body string }
}

func (f *fakeSender) Send(to, body string) error {
    f.calls = append(f.calls, struct{ to, body string }{to, body})
    return nil
}
```

This is the tenet running in reverse: an easy test is evidence of a good seam. The classic anti-pattern proves the same point from the other side — if a test needs a heavy mocking framework, the interface is too large. Shrink it, and the test gets simple because the design did.

See also: [Strategy](/patterns/behavioral/strategy), [Repository](/patterns/architectural/repository).

## Functional Programming

The other way to make code testable is to give it less to hide. A pure function — output determined entirely by its inputs, no reaching into shared state, no clock, no I/O — is testable by construction: no setup, no mocks, no order-dependence. Go isn't a functional language, but the ideas that make code predictable port directly.

```go
// IMPURE — depends on external state, result varies with time.
func isExpiredSession(s Session) bool {
    return time.Now().After(s.ExpiresAt) // hidden input: time.Now()
}

// PURE — expiry is a parameter. The function is deterministic.
// In tests, pass any time you like.
func isExpiredAt(s Session, now time.Time) bool {
    return now.After(s.ExpiresAt)
}
```

The impure version forces a test to manipulate the clock; the pure one takes the moment as an argument and becomes trivially testable. The same instinct drives immutability and higher-order functions: the less hidden state a function touches, the less a test (or a future reader) has to reconstruct. Take the ideas that make code clearer and leave the rest; immutability is a tool.

> **Smell:** A function returns different results when called twice with the same arguments. A method mutates a field another goroutine reads without a lock. You must set up global state before calling a function in a test.

See also: [Composition over Inheritance](/philosophy/borrowed-abstraction#composition-over-inheritance), [TDD](/philosophy/listen-to-the-tests#test-driven-development).
