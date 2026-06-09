---
title: The best pattern is often no pattern
nav_title: Often no pattern
description: The most over-engineered code is usually solving a problem it doesn't have yet. Reach for structure when the problem asks for it.
order: 3
---

# The best pattern is often no pattern

The most dangerous code is the code that solves problems you don't have yet. It reads as diligence, planning ahead, leaving room, avoiding corners, but it's debt dressed as foresight. Every abstraction layer is a concept the next reader must hold in their head. Every configuration knob is a state your tests must cover. Every speculative interface is a constraint your design must honour even as the real requirements turn out to be different.

So the strong default is *less*. Reach for a pattern when the problem is actively asking for one, not because the pattern is the "professional" choice. A direct function that's wrong is easy to fix. A clever, flexible abstraction that's wrong is hard even to diagnose.

## Essential vs accidental complexity

Some complexity belongs to the problem itself. Billing rules, retries, ordering guarantees — these stay hard even in spotless code. That's *essential* complexity, and your job is to keep it visible, not to pretend a pattern can dissolve it.

The rest is *accidental*: circular dependencies, mystery ownership, a name that means one thing here and something else one package over. We add it ourselves, usually while trying to be clever. The work is to trim the accidental until the code says what it does without a guided tour — and never to mistake the essential kind for something structure can delete.

## YAGNI

The temporal version of this tenet has a name from Extreme Programming: *You Aren't Gonna Need It*. It's the discipline of not building a thing until it's actually required — and it's harder than it sounds, because speculative design *feels* like good engineering.

> *"Always implement things when you actually need them, never when you just foresee that you need them."* Ron Jeffries

YAGNI is a practice from Extreme Programming with a specific, narrow claim: don't implement a feature until it is required. Not "keep it in mind." Not "leave a hook for it." Don't build it.

This sounds obvious. It isn't. The pull toward speculative design is strong; it *feels* like good engineering to plan ahead, to leave room for extension, to avoid painting yourself into a corner. But speculative features have real costs: they take time to write, time to test, time to maintain, and they constrain future design based on requirements that were never real.

The code you didn't write has no bugs.

---

### The classic trap: speculative parameters

```go
// BAD — config struct added "for flexibility", used by exactly one caller,
// which always passes the same values.

type FetchOptions struct {
    Timeout    time.Duration
    Retries    int
    MaxBytes   int64
    UserAgent  string
    FollowRedir bool
}

func FetchPage(url string, opts FetchOptions) ([]byte, error) {
    // ...
}

// Every caller does this:
FetchPage(url, FetchOptions{
    Timeout:     5 * time.Second,
    Retries:     3,
    MaxBytes:    1 << 20,
    UserAgent:   "myapp/1.0",
    FollowRedir: true,
})
```

```go
// GOOD — implement what callers actually use.
// Add options when a second caller needs different values.

func FetchPage(url string) ([]byte, error) {
    client := &http.Client{Timeout: 5 * time.Second}
    resp, err := client.Get(url)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}
```

The signature is what matters: callers pass a `url` and nothing else. Here it is as a small runnable program (the fetch is stubbed so it runs without network access):

```go:title="main.go":run=true:editable=true
package main

import "fmt"

// Implement what callers actually use. No speculative options struct.
// The signature stays identical to the GOOD example above: (url) -> ([]byte, error).
func FetchPage(url string) ([]byte, error) {
    // Stand in for an HTTP fetch so the example runs without network access.
    return []byte("200 OK <" + url + ">"), nil
}

func main() {
    body, err := FetchPage("https://example.com")
    if err != nil {
        fmt.Println("error:", err)
        return
    }
    fmt.Println(string(body))
}
```

---

### Speculative interfaces

```go
// BAD — defined a plugin interface for a feature that was never built.
// The interface is never implemented except by the one real type.

type StorageBackend interface {
    Read(key string) ([]byte, error)
    Write(key string, value []byte) error
    Delete(key string) error
    List(prefix string) ([]string, error)
    Stat(key string) (StorageInfo, error)
}

// The only implementation:
type DiskStorage struct{ root string }
// ... 200 lines of implementation
```

```go
// GOOD — use the concrete type directly.
// Define an interface at the call site if and when a second implementation appears.

type DiskStorage struct{ root string }

func (s *DiskStorage) Read(key string) ([]byte, error) {
    return os.ReadFile(filepath.Join(s.root, key))
}

func (s *DiskStorage) Write(key string, value []byte) error {
    return os.WriteFile(filepath.Join(s.root, key), value, 0644)
}
```

---

### The hidden cost of unused code

Unused code isn't free:

- **Tests must cover it.** A speculative code path still needs tests to stay green as the codebase evolves.
- **It becomes load-bearing.** Six months later, someone assumes the hook is there for a reason and builds on top of it.
- **It rots.** Code that isn't used isn't tested in practice. It quietly breaks.
- **It signals false requirements.** New engineers treat existing code as documentation of intent.

---

### When to actually build ahead

YAGNI has a boundary. Some structural decisions are genuinely hard to reverse:

- **Data formats.** If you're defining a wire format or a storage schema, think about versioning. Not because you'll definitely need it, but because changing it later is disproportionately expensive.
- **Public APIs.** If you're shipping a library, the interface is a contract. Breaking it has real cost.
- **Performance headroom.** If you know from measurement (not intuition) that a naive approach will hit a wall, address it.

These are exceptions. The default is: don't.

> **Smell:** You search for usages of a function and find exactly one caller: the test. Or a config struct with eight fields where every caller sets the same six. Or an interface defined in the same package as its only implementation.

See also: [KISS](/go/philosophy/no-pattern#kiss), [DRY](/go/philosophy/wrong-abstraction#dry).
## KISS

Where YAGNI is about *when* you build, KISS is about *how much* you build once you've decided to. Keep it simple: the simplest solution that correctly solves the real problem is almost always the right one.

*"Simplicity is the ultimate sophistication."*

KISS (Keep It Simple, Stupid) is not an insult. It's a warning about a bias every engineer carries: the pull toward clever, flexible, extensible solutions when a direct one would do. The most dangerous code is code that solves problems that don't exist yet.

Complexity has a cost that compounds. Each additional abstraction layer is a concept every future reader must hold in their head. Each additional configuration knob is a state your tests must cover. Each speculative interface is a constraint your design must honor even as requirements change. Simple code that's wrong is easy to fix. Complex code that's wrong is hard to even diagnose.

Go is opinionated toward simplicity. Explicit over implicit. Concrete over abstract. The language itself resists many complexity patterns common in other ecosystems.

---

### Over-engineering: the most common violation

```go
// BAD — a "flexible" solution to a problem that only has one case.

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
// GOOD — the actual requirement is to trim whitespace from user input.

func sanitize(input string) string {
    return strings.TrimSpace(input)
}
```

The chain exists in case there are multiple processing steps in the future. There aren't. When there are, add them. Until then, the simple version is easier to read, easier to test, and contains no bugs.

---

### Accidental complexity in error handling

```go
// BAD — custom error types for a function that can only fail one way.

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
// GOOD — return a plain error. If callers need structured data later, add it then.

func validateEmail(email string) error {
    if !strings.Contains(email, "@") {
        return fmt.Errorf("invalid email %q: must contain @", email)
    }
    return nil
}
```

---

### Simple does not mean naive

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

This is simple. The edge case is real. Handling it is not complexity; it's correctness. Here both ideas are together in a small runnable program:

```go:title="main.go":run=true:editable=true
package main

import (
    "errors"
    "fmt"
    "strings"
)

// The actual requirement is to trim whitespace from user input.
func sanitize(input string) string {
    return strings.TrimSpace(input)
}

// Simple AND correct: the edge case is real, so handling it is correctness.
func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("cannot divide by zero")
    }
    return a / b, nil
}

func main() {
    fmt.Printf("%q\n", sanitize("   hello world  "))

    q, err := divide(10, 4)
    fmt.Println(q, err)

    _, err = divide(10, 0)
    fmt.Println(err)
}
```

---

### Go's built-in pressure toward simplicity

Go's design punishes complexity in ways other languages don't:

- No generics overuse: the type system resists speculative abstraction
- Explicit error handling: you can't hide control flow in exceptions
- No inheritance: composition prevents deep hierarchies
- `go vet` and `golint`: flag common over-engineering patterns

When you find yourself fighting the language to implement a design, that's a signal the design is more complex than it needs to be.

> **Smell:** You spend more time explaining *why* the code is structured the way it is than what it actually does. A new team member needs to read three files to understand a function that accepts a string. The code has more abstraction layers than the problem has moving parts.

See also: [YAGNI](/go/philosophy/no-pattern#yagni), [Separation of Concerns](/go/philosophy/keep-changes-local#separation-of-concerns).