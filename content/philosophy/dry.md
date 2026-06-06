---
title: Don't Repeat Yourself
description: Every piece of knowledge should have a single, authoritative representation. Here's why that's harder than it sounds.
---

# Don't Repeat Yourself

*"Every piece of knowledge must have a single, unambiguous, authoritative representation within a system."*

DRY is not about avoiding duplicated lines of code. It's about avoiding duplicated *knowledge*: business rules, validation logic, configuration values, data shapes. Two functions that happen to look similar are not necessarily a DRY violation. Two places that independently encode the same business rule absolutely are.

The practical test: when the rule changes, how many places do you have to update? One is DRY. More than one is a liability, and the second update you forget is a bug.

---

## The failure mode: accidental similarity vs. duplicated knowledge

Avoid reflexively extracting code just because it looks the same. Two loops that iterate over different things for different reasons happen to share syntax; merging them couples unrelated logic. The question is always: *do these represent the same knowledge?*

```go
// Two functions that look similar but encode independent knowledge.
// Do NOT merge these. They will diverge.

func validateUserAge(age int) error {
    if age < 18 {
        return errors.New("user must be 18 or older")
    }
    return nil
}

func validateDriverAge(age int) error {
    if age < 16 {
        return errors.New("driver must be 16 or older")
    }
    return nil
}
```

These look like duplication. They are not. The rules are independent. If the driving age changes, you don't want it to affect user registration. A shared `validateAge(min int)` wrapper would hide that they're different rules entirely.

---

## Real duplication: the same rule in multiple places

```go
// BAD — order status logic duplicated across the codebase.
// Every new status requires touching three functions.

func CanCancel(o Order) bool {
    return o.Status == "pending" || o.Status == "processing"
}

func CanRefund(o Order) bool {
    return o.Status == "pending" || o.Status == "processing"
}

func IsActive(o Order) bool {
    return o.Status == "pending" || o.Status == "processing"
}
```

```go
// GOOD — the knowledge lives in one place.
// The rule changes in exactly one location.

func IsMutable(o Order) bool {
    return o.Status == "pending" || o.Status == "processing"
}

func CanCancel(o Order) bool { return IsMutable(o) }
func CanRefund(o Order) bool { return IsMutable(o) }
func IsActive(o Order) bool  { return IsMutable(o) }
```

Here it is as a small runnable program:

```go:title="main.go":run=true:editable=true
package main

import "fmt"

type Order struct {
    Status string
}

// The knowledge lives in one place. The rule changes in exactly one location.
func IsMutable(o Order) bool {
    return o.Status == "pending" || o.Status == "processing"
}

func CanCancel(o Order) bool { return IsMutable(o) }
func CanRefund(o Order) bool { return IsMutable(o) }
func IsActive(o Order) bool  { return IsMutable(o) }

func main() {
    for _, o := range []Order{{"pending"}, {"shipped"}, {"processing"}} {
        fmt.Printf("%-12s cancel=%-5v refund=%-5v active=%-5v\n",
            o.Status, CanCancel(o), CanRefund(o), IsActive(o))
    }
}
```

---

## Configuration duplication

Magic values are a common DRY violation. When a value appears in multiple places, a change requires a search-and-replace; one missed instance is a silent bug.

```go
// BAD — the session duration is scattered across the codebase.

func NewSession(userID string) Session {
    return Session{Expires: time.Now().Add(24 * time.Hour)}
}

func IsExpired(s Session) bool {
    return time.Since(s.CreatedAt) > 24*time.Hour
}

func RefreshSession(s Session) Session {
    return Session{Expires: time.Now().Add(24 * time.Hour)}
}
```

```go
// GOOD — one authoritative constant.

const sessionTTL = 24 * time.Hour

func NewSession(userID string) Session {
    return Session{Expires: time.Now().Add(sessionTTL)}
}

func IsExpired(s Session) bool {
    return time.Since(s.CreatedAt) > sessionTTL
}

func RefreshSession(s Session) Session {
    return Session{Expires: time.Now().Add(sessionTTL)}
}
```

---

## The Rule of Three

Don't extract on the first duplication. Wait for three. The first instance is just code. The second is a coincidence. The third is a pattern worth naming.

Premature abstraction is its own problem: you create an abstraction before you understand the full shape of the rule, and you paint yourself into a corner. Three instances give you enough signal to design the right abstraction.

---

## DRY and generated code

Generated code is an exception. If a struct is generated from a schema, and a corresponding SQL table definition also comes from that schema, the *source of truth* is the schema, not the two outputs. The outputs can look identical without violating DRY because neither encodes the knowledge; the generator does.

The principle is about knowledge, not bytes.

> **Smell:** A business rule changes and you update it in one place, but a bug report comes in two weeks later because a second copy of the rule was missed. Or: you grep for a constant value and find it hardcoded in five files.

See also: [Single Responsibility Principle](/go/philosophy/solid), [Strategy](/go/patterns/behavioral/strategy) for encapsulating variable algorithms in one place.
