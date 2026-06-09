---
title: "Once"
description: "Run a piece of initialisation exactly once, no matter how many goroutines race to trigger it, with sync.Once — the clean way to do lazy, thread-safe setup."
---

# Once

`sync.Once` guarantees a function runs exactly one time, even if a hundred goroutines call it simultaneously. The first goroutine to arrive runs the function; everyone else blocks until it finishes, then proceeds — all of them now seeing the completed result. It's purpose-built for lazy initialisation: set up a connection pool, parse a config file, compile a regex the first time it's actually needed, and never worry that two goroutines will do it twice or that a caller will see a half-built value.

## Scenario

You want to build something expensive lazily — only when first used — and share it across goroutines. The hand-rolled "check, then build" is a classic [data race](/go/patterns/synchronisation/data-races):

```go
// BAD — two goroutines can both see `instance == nil` and both build it.
var instance *Client

func Get() *Client {
    if instance == nil {     // goroutine A and B both read nil here
        instance = newClient() // ...and both run this
    }
    return instance          // ...and may return different clients
}
```

Adding a mutex with a double-check works but is fiddly to get right (the "double-checked locking" pattern is a notorious source of subtle bugs). `sync.Once` is the version that's correct by construction.

> **Smell:** You're guarding a one-time setup with a `nil` check, or a `bool` flag plus a mutex, and reasoning carefully about who builds it first. That whole dance is what `sync.Once` packages up correctly.

## Solution

Wrap the initialisation in `once.Do(...)`. This program fires 50 goroutines at a lazy initialiser at the same time; the expensive setup runs exactly once, and the program proves it by printing an init count of `1`:

```go:title="main.go":run=true:editable=true
package main

import (
	"fmt"
	"sync"
	"sync/atomic"
)

type Client struct {
	ID int
}

var (
	once      sync.Once
	client    *Client
	initCalls atomic.Int64 // proves the body runs exactly once
)

// Get builds the client on first call and returns the same instance forever
// after. Safe to call from any number of goroutines concurrently.
func Get() *Client {
	once.Do(func() {
		initCalls.Add(1)
		client = &Client{ID: 42} // pretend this is expensive
	})
	return client
}

func main() {
	var wg sync.WaitGroup
	ids := make([]int, 50)

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(slot int) {
			defer wg.Done()
			ids[slot] = Get().ID // every goroutine races to trigger init
		}(i)
	}

	wg.Wait()
	fmt.Println("init ran:", initCalls.Load(), "times") // init ran: 1 times
	fmt.Println("client ID seen by all:", ids[0])       // client ID seen by all: 42
}
```

Two guarantees matter here. First, the body runs **once** — `initCalls` is `1` no matter how many goroutines pile in. Second, `once.Do` doesn't return until the body has *finished*, so every goroutine that called `Get()` sees the fully-built `client`, never a `nil` or a half-initialised value. That second guarantee — the memory ordering — is what makes `sync.Once` correct where a bare flag is not.

## Once and errors: OnceFunc, OnceValue (Go 1.21+)

Plain `Once.Do` takes a function with no return. Go 1.21 added helpers that fit the common "initialise and return a value" shape more directly:

```go
// OnceValue: lazily compute a value once, return it on every call.
var config = sync.OnceValue(func() Config {
    return loadConfig() // runs on first call to config()
})

// later, anywhere, concurrently:
c := config()
```

If your initialiser can *fail*, note that `Once` itself has no error channel — the body runs once whether it succeeds or not, and a failed setup won't be retried. When you need "retry until it succeeds, then cache", `sync.Once` is the wrong tool; use a mutex-guarded build with an explicit error check, or `sync.OnceValues` (which returns `(T, error)`) only if a single permanent attempt is what you actually want.

## When to Use

- Lazy initialisation of a shared resource: connection pools, clients, parsed templates, compiled regexes — built on first use, shared thereafter.
- Exactly-once side effects: registering metrics, setting up a signal handler, printing a one-time warning.
- Making a [Singleton](/go/patterns/creational/singleton) thread-safe without hand-writing double-checked locking.

## When Not to Use

- The value is cheap and always needed — just initialise it at declaration (`var x = build()`) or in `init()`; lazy setup adds nothing.
- The initialisation can fail and you want to retry on the next call — `Once` runs once, success or not, and never retries. Use a mutex-guarded builder.
- You need to *re-run* the setup later (config reload, reconnect) — `Once` is permanent. Use an [atomic.Pointer](/go/patterns/synchronisation/atomic) swap or a [Mutex](/go/patterns/synchronisation/mutex)-guarded rebuild.

## Common Mistakes

**Expecting a retry after a failed init.** If the `Once.Do` body fails partway — a connection refused, a missing file — `Once` still considers itself done. Every later call returns immediately with the broken (or `nil`) result. If failure is possible and retry is wanted, don't use `Once`.

**Using one Once for several independent things.** A `sync.Once` fires its body exactly once, ever. If you need two separate one-time setups, use two `Once` values. Reusing one across unrelated initialisers means the second never runs.

**Copying the Once.** Like `Mutex`, a `sync.Once` must not be copied after first use — a copy has fresh state and will run the body again. Keep it as a package var or a pointer-receiver struct field, never pass it by value.

**Calling back into Get() from inside the body.** If the `Once.Do` function calls the same `Get()` that's currently running it, it deadlocks — `Do` is still in progress and the re-entrant call waits forever. Keep the initialiser self-contained.

## The Decision

**Once vs. eager initialisation.**
If a value is always needed and cheap to build, eager `var x = build()` or an `init()` function is simpler and has no first-call latency spike. `sync.Once` earns its place when construction is *expensive* and *not always needed* — you defer the cost until something actually asks, and pay it at most once. Don't make initialisation lazy by reflex; make it lazy when laziness buys you something.

**Once vs. mutex-guarded flag.**
You can replicate `Once` with a `bool` and a `Mutex`, and people do — and they introduce subtle ordering bugs doing it, because getting the memory visibility right (the body's writes must be visible to every later reader) is exactly the part that's easy to miss. `sync.Once` is that pattern, correct, in one line. Use it rather than re-deriving it.

## Related Patterns

- **[Singleton](/go/patterns/creational/singleton)**: the canonical user of `Once` — lazy, thread-safe single-instance construction.
- **[Mutex](/go/patterns/synchronisation/mutex)**: what `Once` is built on; the right tool when init can fail and must retry, or must re-run.
- **[Atomic](/go/patterns/synchronisation/atomic)**: an `atomic.Bool` flag covers "has it started?" but not "wait until it's finished" — that's what `Once` adds.
