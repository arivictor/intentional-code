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

The smallest scale at which this tenet shows up is the everyday act of writing a function. "Clean Code" is usually handed down as a set of rules, then argued about as if the rules were the point. They aren't. The audience for clarity is the next person who reads this, not the compiler, and they will spend more time reading it than you spent writing it. No rule can settle for you what *that person* needs to understand. Take the most consequential example, naming:

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

No rule produced `hasField`. A style guide can hand you `camelCase` and "boolean functions read as questions," but it cannot tell you that this function is best named for the question it answers. That last step is judgment, and it is the same judgment, scaled down, that decides where a boundary goes or whether a package should exist. Clarity is decided per reader, never per rulebook. (The neighbouring idea that a function should do only one thing belongs to [making the next change local](/go/philosophy/keep-changes-local#solid); the point here is narrower.)

> **Smell:** You have to read a function three times to know what it does. A variable named `data`, `result`, `temp`, or `x` at package scope. A comment that starts with "this function..."
