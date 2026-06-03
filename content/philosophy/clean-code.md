---
title: Clean Code
description: Code is read far more than it is written. Clarity is a feature, not a preference.
---

# Clean Code

Code is read by humans. Compilers don't care about names, structure, or clarity; developers do, and they'll spend far more time reading your code than you spent writing it. Clean code communicates its intent so clearly that the next reader can work with it safely, without reverse-engineering what it does.

Go's culture pushes hard in this direction: short functions, clear names, explicit error handling, standard formatting via `gofmt`. The language doesn't prevent bad code, but it removes many of the excuses for it.

---

## Naming: the most impactful decision you make

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

## Functions: one thing, done well

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

## Avoid noise: comments that restate code

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

## Error messages as documentation

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

## Consistency

A codebase is clean when it reads as if it were written by one person with a single style. Inconsistency forces context-switching: the reader has to re-orient every time style shifts.

In Go, `gofmt` handles formatting. Everything else (error handling patterns, naming conventions, struct layout) comes from team discipline. Pick conventions and follow them everywhere. The *which* matters less than the *always*.

> **Smell:** You have to read a function three times to understand what it does. A variable named `data`, `result`, `temp`, or `x` at package scope. A function whose name is a verb and a noun joined by "and." A comment that starts with "this function..."

---

## Error handling idioms

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

## Guard clauses

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

See also: [SOLID](/go/philosophy/solid), [Separation of Concerns](/go/philosophy/separation-of-concerns), [TDD](/go/philosophy/tdd).
