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

The temporal version of this tenet has a name from Extreme Programming: *You Aren't Gonna Need It*. It's the discipline of not building a thing until it's actually required — and it's harder than it sounds, because speculative design *feels* like good engineering. The claim is narrow: not "keep it in mind," not "leave a hook for it." Don't build it. The code you didn't write has no bugs, no tests to carry, and constrains no future design.

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

YAGNI has a boundary, and naming it is the judgment. The decisions that are genuinely hard to reverse earn forethought even before you "need" them: wire formats and storage schemas (think versioning), public APIs (the signature is a contract), and performance you have *measured* will hit a wall. Everything else: don't.

> **Smell:** You search for usages of a function and find exactly one caller: the test. A config struct with eight fields where every caller sets the same six. An interface defined in the same package as its only implementation.

See also: [KISS](/go/philosophy/no-pattern#kiss), [DRY](/go/philosophy/wrong-abstraction#dry).

## KISS

Where YAGNI is about *when* you build, KISS is about *how much* you build once you've decided to. Keep it simple: the simplest solution that correctly solves the real problem is almost always the right one. The bias it fights is the pull toward clever, flexible, extensible designs when a direct one would do.

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

The chain exists in case there are ever more steps. There aren't; when there are, add them. Simple is not the same as naive, though: the simplest version still has to handle the real edge cases — a divide-by-zero check is correctness, not complexity. The only thing you're cutting is the machinery aimed at problems you don't have yet.

> **Smell:** You spend more time explaining *why* the code is shaped the way it is than what it does. A newcomer reads three files to understand a function that takes a string. The code has more abstraction layers than the problem has moving parts.

See also: [YAGNI](/go/philosophy/no-pattern#yagni), [Separation of Concerns](/go/philosophy/keep-changes-local#separation-of-concerns).
