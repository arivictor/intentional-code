---
title: Every abstraction is borrowed against the future
nav_title: Borrowed abstraction
description: An abstraction is a loan for flexibility now in exchange for indirection forever. Only borrow what you'll actually spend.
order: 5
---

# Every abstraction is borrowed against the future

An abstraction is a loan. You borrow flexibility, the ability to swap an implementation, add a case, vary a behaviour, and the interest is indirection: every reader from now on has to step through the abstraction to find out what actually happens. Sometimes that's a bargain. Often it's a loan taken out against a future that never arrives, and you service the debt forever in exchange for flexibility you never spend.

So the question to ask before you abstract is "will I spend this flexibility, and soon enough so that paying interest in the meantime is worth it?" If the answer is a confident yes, borrow. If it's a hopeful maybe, you're speculating, and the [wrong abstraction costs more than the duplication it replaces](/philosophy/wrong-abstraction).

The corollary is that abstractions should be *cheap to take on and cheap to unwind*. A small interface defined at the point you actually need it is a short-term loan. A deep inheritance hierarchy is a thirty-year mortgage on coupling, and Go, wisely, won't even sell it to you.

## Composition over Inheritance

Go made the central decision here for you: there is no inheritance. What you get instead is embedding and interfaces, exactly the cheap, repayable abstractions this tenet asks for. You compose behaviour from small pieces at the point of use, and you can pull a piece out again without unwinding an ancestry. Types are grouped by what they *do*, not what they *are*, and you declare that grouping at the call site with an interface rather than a base class:

```go
// BAD (hypothetical inheritance) — behaviour welded on through ancestry.
// Notifier → RetryingNotifier → SlackNotifier
// Notifier → AuditedNotifier  → SlackNotifier  (impossible — only one parent)

// GOOD — compose behaviour through small interfaces.

type Sender interface {
    Send(msg string) error
}

type HealthChecker interface {
    Healthy() bool
}

// SlackNotifier satisfies both — no base class, no inheritance.
type SlackNotifier struct {
    webhook string
}

func (s SlackNotifier) Send(msg string) error { /* POST to s.webhook */ return nil }
func (s SlackNotifier) Healthy() bool          { /* ping s.webhook */ return true }

// Each function asks for exactly the behaviour it needs.
func Alert(s Sender, msg string) error {
    return s.Send(msg)
}

func ReadyCheck(h HealthChecker) bool {
    return h.Healthy()
}
```

A `SlackNotifier` works wherever a `Sender` or a `HealthChecker` is expected, with no shared base class, and an `EmailNotifier` that implements either interface needs no change to `Alert` or `ReadyCheck`. That is the borrowed abstraction repaying itself: each interface is a small loan, taken exactly where it's spent. Struct embedding does the same for reuse, letting a retrying sender embed a `Sender` and wrap it with backoff (`has-a`, not `is-a`) without the mortgage of a hierarchy.

> **Smell:** A type embeds another and overrides most of its methods, replacing rather than extending it. A hierarchy more than two levels deep. You embed a large type just to reach one method.

See also: [Strategy](/patterns/behavioral/strategy), [Decorator](/patterns/structural/decorator), [SOLID](/philosophy/keep-changes-local#solid).
