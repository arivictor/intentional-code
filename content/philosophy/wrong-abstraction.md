---
title: Duplication is cheaper than the wrong abstraction
nav_title: The wrong abstraction
description: Repeated code is a small, visible cost. The wrong abstraction is a large, hidden one — and far harder to undo.
order: 8
---

# Duplication is cheaper than the wrong abstraction

"Don't repeat yourself" gets taught as a reflex: see two similar blocks, merge them. But the reflex skips the only question that matters — *do these two things represent the same knowledge, or do they just happen to look alike right now?* Because the moment you extract a shared abstraction from two things that merely resemble each other, you weld their futures together. When one needs to change and the other doesn't, you're stuck adding a flag, then a branch, then a second flag — slowly turning a clean function into a thicket of special cases.

That thicket is more expensive than the duplication ever was. Repeated code is a small, visible cost: you can see all the copies, and updating them is mechanical. The wrong abstraction is a large, hidden one: it actively resists the change you now need, and un-welding it is far harder than copy-paste would have been. So when you're unsure, prefer the duplication. It keeps your options open; a premature abstraction spends them.

The phrasing is Sandi Metz's, from her 2016 essay [*The Wrong Abstraction*](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction). The idea predates Go, but it lands hardest here, where implicit interfaces make an abstraction cheap to reach for and just as quietly expensive to unwind.

Read correctly, the principle was never about repeated *lines*. It's about repeated *knowledge* — a single business rule, a single source of truth — that genuinely has one home. The practical test isn't "do these look the same?" but "when this rule changes, how many places must I touch?" One is right. More than one is a liability. But two things that change for different reasons are not one rule, however alike they look today.

## DRY

The principle's real name — *Don't Repeat Yourself* — is fine; it's the misreading that's dangerous. DRY is about duplicated *knowledge*, not duplicated lines, and the most expensive mistake is merging two things that only look alike:

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

These look like duplication; they aren't. The rules are independent, and a shared `validateAge(min int)` wrapper would weld them together so that changing the driving age could break user registration. The flip side is just as real: when three functions genuinely encode the *same* rule, give it one home so the rule changes in one place. The tell is whether they change for the same reason — not whether they look alike. And when you're unsure, wait: the Rule of Three says the first instance is just code, the second a coincidence, the third a pattern worth naming. Extract before that and you're designing the abstraction before you understand its shape.

> **Smell:** A business rule changes, you update it in one place, and a bug surfaces two weeks later from a copy you missed. Or you grep a constant value and find it hardcoded in five files.

See also: [Single Responsibility Principle](/go/philosophy/keep-changes-local#solid), [Strategy](/go/patterns/behavioral/strategy).
