---
title: Architecture is a philosophy, not a rule
nav_title: A philosophy, not a rule
description: Every codebase has architecture. The only choice is whether you shaped it on purpose. Principles are lenses, not laws.
order: 1
---

# Architecture is a philosophy, not a rule

Every codebase has architecture, the shape is already there in the boundaries, in the direction dependencies travel, in the contracts people lean on when they touch code they didn't write. The only choice you actually get is whether that shape happened on purpose or by accident.

So the first tenet is a refusal. Architecture is not a checklist you apply or a rulebook you obey. It is a way of thinking about code, a continuous process of listening for pressure and adjusting boundaries, not a one-time act of decoration. Every principle on this site is a *lens* for seeing that pressure more clearly. None of them is a law, and the moment you treat one as a law is the moment a good idea curdles into cargo cult.

Tending software is closer to gardening than to pouring a foundation. You plant, water, prune, and let things grow. You don't need to know exactly how the garden will look in a year; you need to create conditions where it can thrive, and keep tending it. A small decision today becomes a hard constraint later, so the work is never really "done."

## When architecture helps

Architecture earns its keep when change pressure is already in the room:

- the project has outlived its life as a prototype
- several people need a shared structure to work inside
- requirements shift often
- infrastructure details are likely to change
- correctness and reliability genuinely matter

At that point boundaries stop being theory. They keep one change from spilling into six files, and they let two people work in parallel without colliding all afternoon.

## When architecture hurts

Architecture turns to ceremony when it arrives before the work does:

- throwaway prototypes and experiments
- one-off scripts with a clear expiry date
- simple, stable requirements
- a team that doesn't understand the domain yet

You can read it in the symptoms: extra interfaces nobody can explain, folders named for a future that never arrived, review comments defending structure no one has needed yet. People who do this well recognise the *names* of patterns. People who have done it for years recognise the *pressure* that asks for them.

## Clean Code

The smallest scale at which this tenet shows up is the everyday act of writing a function. "Clean Code" is usually handed down as a set of rules — and then argued about as if the rules were the point. They aren't. Clarity is a judgment call about the next person who has to read this, and it is a feature, not a preference.

Code is read by humans. Compilers don't care about names, structure, or clarity; developers do, and they'll spend far more time reading your code than you spent writing it. Clean code communicates its intent so clearly that the next reader can work with it safely, without reverse-engineering what it does.

Go's culture pushes hard in this direction: short functions, clear names, explicit error handling, standard formatting via `gofmt`. The language doesn't prevent bad code, but it removes many of the excuses for it.

---

### Naming: the most impactful decision you make

A good name makes a variable, function, or type self-documenting. A bad name forces every reader to trace execution to understand what a thing *is*.

```go
// BAD — names that say nothing.

func p(d []byte, t string) bool {
    var m map[string]any
    if err := json.Unmarshal(d, &m); err != nil {
        return false
    }
    _, ok := m[t]
    return ok
}
```

```go
// GOOD — names that explain intent without a comment.

func hasField(jsonData []byte, fieldName string) bool {
    var parsed map[string]any
    if err := json.Unmarshal(jsonData, &parsed); err != nil {
        return false
    }
    _, exists := parsed[fieldName]
    return exists
}
```

**Go naming conventions:**
- Short names for short-lived variables in tight scopes (`i`, `b`, `err`)
- Descriptive names for package-level declarations and exported symbols
- Avoid redundant prefixes: `user.UserID` becomes `user.ID`
- Boolean functions read as questions: `isExpired`, `hasPermission`, `canRetry`

---

### Functions: one thing, done well

A function should do one thing. If you find yourself writing "and" in a function name, that's two functions.

```go
// BAD — this function does three things.

func processOrder(o Order) error {
    // 1. validate
    if o.Total <= 0 {
        return errors.New("order total must be positive")
    }
    if o.UserID == "" {
        return errors.New("order must have a user")
    }

    // 2. persist
    if _, err := db.Exec("INSERT INTO orders ...", o.ID, o.Total); err != nil {
        return fmt.Errorf("saving order: %w", err)
    }

    // 3. notify
    msg := fmt.Sprintf("Order %s confirmed. Total: $%.2f", o.ID, float64(o.Total)/100)
    return mailer.Send(o.Email, msg)
}
```

```go
// GOOD — each function does exactly one thing.

func validateOrder(o Order) error {
    if o.Total <= 0 {
        return errors.New("order total must be positive")
    }
    if o.UserID == "" {
        return errors.New("order must have a user")
    }
    return nil
}

func saveOrder(o Order) error {
    _, err := db.Exec("INSERT INTO orders ...", o.ID, o.Total)
    return fmt.Errorf("saving order: %w", err)
}

func notifyOrderConfirmed(o Order) error {
    msg := fmt.Sprintf("Order %s confirmed. Total: $%.2f", o.ID, float64(o.Total)/100)
    return mailer.Send(o.Email, msg)
}

func processOrder(o Order) error {
    if err := validateOrder(o); err != nil {
        return err
    }
    if err := saveOrder(o); err != nil {
        return err
    }
    return notifyOrderConfirmed(o)
}
```

---

### Avoid noise: comments that restate code

Comments should explain *why*, not *what*. If a comment is just prose for the code directly below it, the code needs better names, not a comment.

```go
// BAD — the comment says exactly what the code says.

// Check if user is admin
if user.Role == "admin" {
    // Grant access
    return true
}
```

```go
// GOOD — name the concept. No comment needed.

func isAdmin(u User) bool {
    return u.Role == "admin"
}

if isAdmin(user) {
    return true
}
```

Write a comment when the code cannot express the *reason*: a non-obvious constraint, a workaround for a known bug in a dependency, a performance tradeoff with measurement results attached.

---

### Error messages as documentation

Error messages are read by developers diagnosing failures. Make them useful: include context, include values, don't just state the failure.

```go
// BAD — error tells you nothing actionable.
return errors.New("invalid input")

// GOOD — error tells you what was invalid and why.
return fmt.Errorf("invalid email %q: must contain exactly one @ sign", email)

// GOOD — wrapped errors preserve the call chain.
if err := store.Save(order); err != nil {
    return fmt.Errorf("placing order %s: %w", order.ID, err)
}
```

---

### Consistency

A codebase is clean when it reads as if it were written by one person with a single style. Inconsistency forces context-switching: the reader has to re-orient every time style shifts.

In Go, `gofmt` handles formatting. Everything else (error handling patterns, naming conventions, struct layout) comes from team discipline. Pick conventions and follow them everywhere. The *which* matters less than the *always*.

> **Smell:** You have to read a function three times to understand what it does. A variable named `data`, `result`, `temp`, or `x` at package scope. A function whose name is a verb and a noun joined by "and." A comment that starts with "this function..."

---

### Error handling idioms

Go's error handling is explicit by design. Three idioms keep it safe and debuggable:

**Wrap errors with context** using `fmt.Errorf` and the `%w` verb. The resulting error is inspectable by callers through the full wrapping chain, making debugging a production failure much faster:

```go
// Wrapping preserves the original error and adds context at each layer.
if err := store.Save(order); err != nil {
    return fmt.Errorf("placing order %s: %w", order.ID, err)
}
```

**Inspect errors structurally** with `errors.Is` and `errors.As`. Never compare `.Error()` strings:

```go
var ErrNotFound = errors.New("not found")

// BAD — string comparison breaks if the message ever changes.
if err.Error() == "not found" { ... }

// GOOD — works correctly through any wrapping chain.
if errors.Is(err, ErrNotFound) { ... }

// GOOD — unwraps to a specific error type to access its fields.
var valErr *ValidationError
if errors.As(err, &valErr) {
    fmt.Println(valErr.Field, valErr.Message)
}
```

**Define sentinel errors** as package-level variables for errors callers need to distinguish:

```go
var (
    ErrNotFound   = errors.New("not found")
    ErrConflict   = errors.New("conflict")
    ErrPermission = errors.New("permission denied")
)
```

---

### Guard clauses

A guard clause is an early return that handles a precondition at the top of a function, keeping the happy path at the left margin. Functions with nested `if` blocks force the reader to track multiple levels of indentation simultaneously.

```go
// BAD — three levels of nesting; the happy path is buried at the bottom.
func processPayment(card Card, amount Money) error {
    if card.IsValid() {
        if amount > 0 {
            if !card.IsExpired() {
                return charge(card, amount)
            } else {
                return errors.New("card is expired")
            }
        } else {
            return errors.New("amount must be positive")
        }
    } else {
        return errors.New("invalid card")
    }
}

// GOOD — guard clauses eliminate nesting; happy path is obvious.
func processPayment(card Card, amount Money) error {
    if !card.IsValid() {
        return errors.New("invalid card")
    }
    if amount <= 0 {
        return errors.New("amount must be positive")
    }
    if card.IsExpired() {
        return errors.New("card is expired")
    }
    return charge(card, amount)
}
```

Guard clauses also make adding a new precondition a one-line insert at the top of the validation block, rather than a restructuring of nested conditions.

Here it is as a small runnable program:

```go:title="main.go":run=true:editable=true
package main

import (
    "errors"
    "fmt"
)

type Card struct {
    Valid   bool
    Expired bool
}

func (c Card) IsValid() bool   { return c.Valid }
func (c Card) IsExpired() bool { return c.Expired }

func charge(card Card, amount int) error {
    fmt.Printf("charged %d cents\n", amount)
    return nil
}

// Guard clauses eliminate nesting; the happy path is obvious.
func processPayment(card Card, amount int) error {
    if !card.IsValid() {
        return errors.New("invalid card")
    }
    if amount <= 0 {
        return errors.New("amount must be positive")
    }
    if card.IsExpired() {
        return errors.New("card is expired")
    }
    return charge(card, amount)
}

func main() {
    good := Card{Valid: true}
    if err := processPayment(good, 1500); err != nil {
        fmt.Println("error:", err)
    }

    expired := Card{Valid: true, Expired: true}
    if err := processPayment(expired, 1500); err != nil {
        fmt.Println("error:", err)
    }

    if err := processPayment(good, -5); err != nil {
        fmt.Println("error:", err)
    }
}
```

See also: [SOLID](/go/philosophy/keep-changes-local#solid), [Separation of Concerns](/go/philosophy/keep-changes-local#separation-of-concerns), [TDD](/go/philosophy/listen-to-the-tests#test-driven-development).