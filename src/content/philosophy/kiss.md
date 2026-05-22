---
title: Keep It Simple
description: Complexity is the enemy. The simplest solution that correctly solves the problem is almost always the right one.
---

# Keep It Simple

*"Simplicity is the ultimate sophistication."*

KISS - Keep It Simple, Stupid - is not an insult. It's a warning about a bias every engineer carries: the pull toward clever, flexible, extensible solutions when a direct one would do. The most dangerous code is code that solves problems that don't exist yet.

Complexity has a cost that compounds. Each additional abstraction layer is a concept every future reader must hold in their head. Each additional configuration knob is a state your tests must cover. Each speculative interface is a constraint your design must honor even as requirements change. Simple code that's wrong is easy to fix. Complex code that's wrong is hard to even diagnose.

Go is opinionated toward simplicity. Explicit over implicit. Concrete over abstract. The language itself resists many complexity patterns common in other ecosystems.

---

## Over-engineering: the most common violation

```go
// BAD - a "flexible" solution to a problem that only has one case.

type Processor interface {
    Process(data []byte) ([]byte, error)
}

type ProcessorChain struct {
    processors []Processor
}

func (c *ProcessorChain) Add(p Processor) *ProcessorChain {
    c.processors = append(c.processors, p)
    return c
}

func (c *ProcessorChain) Process(data []byte) ([]byte, error) {
    var err error
    for _, p := range c.processors {
        data, err = p.Process(data)
        if err != nil {
            return nil, err
        }
    }
    return data, nil
}

// To trim whitespace from user input.
type TrimProcessor struct{}
func (t *TrimProcessor) Process(data []byte) ([]byte, error) {
    return bytes.TrimSpace(data), nil
}
```

```go
// GOOD - the actual requirement is to trim whitespace from user input.

func sanitize(input string) string {
    return strings.TrimSpace(input)
}
```

The chain exists in case there are multiple processing steps in the future. There aren't. When there are, add them. Until then, the simple version is easier to read, easier to test, and contains no bugs.

---

## Accidental complexity in error handling

```go
// BAD - custom error types for a function that can only fail one way.

type ValidationError struct {
    Field   string
    Code    string
    Message string
    Meta    map[string]any
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("[%s] %s: %s", e.Code, e.Field, e.Message)
}

func validateEmail(email string) error {
    if !strings.Contains(email, "@") {
        return &ValidationError{
            Field:   "email",
            Code:    "INVALID_FORMAT",
            Message: "must contain @",
            Meta:    map[string]any{"value": email},
        }
    }
    return nil
}
```

```go
// GOOD - return a plain error. If callers need structured data later, add it then.

func validateEmail(email string) error {
    if !strings.Contains(email, "@") {
        return fmt.Errorf("invalid email %q: must contain @", email)
    }
    return nil
}
```

---

## Simple does not mean naive

Simple code handles the actual problem correctly. It doesn't mean ignoring errors, skipping edge cases, or writing vague variable names. It means not solving problems you don't have.

```go
// Simple AND correct.

func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("cannot divide by zero")
    }
    return a / b, nil
}
```

This is simple. The edge case is real. Handling it is not complexity - it's correctness.

---

## Go's built-in pressure toward simplicity

Go's design punishes complexity in ways other languages don't:

- No generics overuse: the type system resists speculative abstraction
- Explicit error handling: you can't hide control flow in exceptions
- No inheritance: composition prevents deep hierarchies
- `go vet` and `golint`: flag common over-engineering patterns

When you find yourself fighting the language to implement a design, that's a signal the design is more complex than it needs to be.

> **Smell:** You spend more time explaining *why* the code is structured the way it is than what it actually does. A new team member needs to read three files to understand a function that accepts a string. The code has more abstraction layers than the problem has moving parts.

See also: [YAGNI](/go/philosophy/yagni), [Separation of Concerns](/go/philosophy/separation-of-concerns).
