---
title: You Aren't Gonna Need It
description: Don't build features, abstractions, or flexibility you don't need today. The cost is always higher than it looks.
---

# You Aren't Gonna Need It

> *"Always implement things when you actually need them, never when you just foresee that you need them."* Ron Jeffries

YAGNI is a practice from Extreme Programming with a specific, narrow claim: don't implement a feature until it is required. Not "keep it in mind." Not "leave a hook for it." Don't build it.

This sounds obvious. It isn't. The pull toward speculative design is strong; it *feels* like good engineering to plan ahead, to leave room for extension, to avoid painting yourself into a corner. But speculative features have real costs: they take time to write, time to test, time to maintain, and they constrain future design based on requirements that were never real.

The code you didn't write has no bugs.

---

## The classic trap: speculative parameters

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

```go:title="main.go":run=true
package main

import "fmt"

// Implement what callers actually use. No speculative options struct.
func FetchPage(url string) (string, error) {
    // Stand in for an HTTP fetch so the example runs without network access.
    return "200 OK <" + url + ">", nil
}

func main() {
    body, err := FetchPage("https://example.com")
    if err != nil {
        fmt.Println("error:", err)
        return
    }
    fmt.Println(body)
}
```

---

## Speculative interfaces

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

## The hidden cost of unused code

Unused code isn't free:

- **Tests must cover it.** A speculative code path still needs tests to stay green as the codebase evolves.
- **It becomes load-bearing.** Six months later, someone assumes the hook is there for a reason and builds on top of it.
- **It rots.** Code that isn't used isn't tested in practice. It quietly breaks.
- **It signals false requirements.** New engineers treat existing code as documentation of intent.

---

## When to actually build ahead

YAGNI has a boundary. Some structural decisions are genuinely hard to reverse:

- **Data formats.** If you're defining a wire format or a storage schema, think about versioning. Not because you'll definitely need it, but because changing it later is disproportionately expensive.
- **Public APIs.** If you're shipping a library, the interface is a contract. Breaking it has real cost.
- **Performance headroom.** If you know from measurement (not intuition) that a naive approach will hit a wall, address it.

These are exceptions. The default is: don't.

> **Smell:** You search for usages of a function and find exactly one caller: the test. Or a config struct with eight fields where every caller sets the same six. Or an interface defined in the same package as its only implementation.

See also: [KISS](/go/philosophy/kiss), [DRY](/go/philosophy/dry).
