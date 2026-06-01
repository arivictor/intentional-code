---
title: "Design the Core"
order: 2
description: "The Link type and the one decision the whole course rests on: separate code generation, storage, and transport behind interfaces."
---

## Three Jobs, Not One

The toy from the last step does three different jobs in two functions: it *generates* a code, it *stores* a mapping, and it *speaks HTTP*. Those three jobs change for completely different reasons.

- You'll change **code generation** when sequential IDs leak your growth rate and you switch to random codes.
- You'll change **storage** when an in-memory map loses everything on restart and you move to a file.
- You'll change **transport** when you add JSON error envelopes or a second route.

When three things that change independently live in one function, every change risks breaking the other two. The fix is the oldest idea in software design: [Separation of Concerns](/go/philosophy/separation-of-concerns). Give each job its own boundary, and let a thin coordinator wire them together.

Here's the whole architecture on one screen:

```
HTTP handlers  ──►  Service  ──►  Generator   (how do we make a code?)
 (transport)      (coordinator)└─►  Store       (where do links live?)
```

The handlers know nothing about how codes are made or where links are stored. The `Service` knows the *order of operations* but not the details. The `Generator` and `Store` are interfaces — swappable, testable, ignorant of HTTP. That boundary is the entire reason the rest of this course is easy.

## The Domain Type

Start with the noun the whole system is about: a `Link`. Everything else is a verb acting on it.

```go
package shortener

import "time"

// Link is a single shortened URL. It's the one type that crosses every
// boundary — generators produce its Code, stores persist it, handlers
// serialise it. Keep it small and free of any storage or HTTP detail.
type Link struct {
	Code      string    // the short code, e.g. "9aX2"
	URL       string    // the original long URL
	CreatedAt time.Time // when it was shortened
}
```

Notice what's *absent*. There's no `gorm.Model`, no JSON tags forcing a wire format, no database ID. `Link` is a plain domain type that doesn't know it will be stored in a file or sent over HTTP. That ignorance is deliberate — it's what lets the same type flow through all three layers without dragging one layer's concerns into another. This is the heart of [Clean Architecture](/go/patterns/architectural/clean-architecture): dependencies point *inward*, toward the domain, never out.

## The Two Interfaces

Now name the two jobs that have multiple implementations. Each becomes a small interface.

**Generating a code.** Given a fresh sequence number and the target URL, produce a short code. Different strategies use different inputs — that's the point, and we'll build three of them in the next chapter.

```go
// Generator turns a freshly-assigned sequence number and the target URL
// into a short code. Implementations choose what to use: the sequential
// strategy uses seq; the random strategy uses neither; the hash strategy
// uses url. One method, many strategies — see the Strategy pattern.
type Generator interface {
	Generate(seq uint64, url string) (string, error)
}
```

**Storing a link.** Persist a link, look one up by code, and hand out sequence numbers. The store owns identity because it owns durability — it's the only component that knows what already exists.

```go
import "errors"

var ErrNotFound = errors.New("shortener: code not found")
var ErrCodeExists = errors.New("shortener: code already exists")

// Store persists links and retrieves them by code. It is the Repository:
// the rest of the system asks for links by their domain identity (the
// code) and never knows whether they live in a map, a file, or a cache.
type Store interface {
	Save(link Link) error          // ErrCodeExists if the code is taken
	Find(code string) (Link, error) // ErrNotFound if it isn't there
	Next() uint64                  // a monotonically increasing sequence number
}
```

That `Store` interface is the [Repository pattern](/go/patterns/architectural/repository) in three methods. The two sentinel errors are part of the contract: callers branch on `ErrNotFound` without caring whether the miss came from a map or a missing file. We'll build a `MemoryStore`, then a `FileStore`, then a caching wrapper — all satisfying this one interface.

## The Coordinator

The `Service` is the thin layer that knows the *recipe*: get a sequence number, ask the generator for a code, build the link, save it — and retry if two requests happen to collide on a random code.

```go
// Service coordinates generation and storage. It is the only place that
// knows the order of operations; it depends on interfaces, not concrete
// types, so any Generator or Store drops in unchanged.
type Service struct {
	store Store
	gen   Generator
}

func NewService(store Store, gen Generator) *Service {
	return &Service{store: store, gen: gen}
}

// Shorten creates a link for url, retrying on the rare code collision
// that random and hash strategies can produce.
func (s *Service) Shorten(url string) (Link, error) {
	const maxAttempts = 5
	for attempt := 0; attempt < maxAttempts; attempt++ {
		code, err := s.gen.Generate(s.store.Next(), url)
		if err != nil {
			return Link{}, err
		}
		link := Link{Code: code, URL: url, CreatedAt: time.Now()}
		switch err := s.store.Save(link); {
		case err == nil:
			return link, nil
		case errors.Is(err, ErrCodeExists):
			continue // collision — try a new code
		default:
			return Link{}, err
		}
	}
	return Link{}, errors.New("shortener: could not allocate a unique code")
}

// Resolve looks up the original URL for a code.
func (s *Service) Resolve(code string) (Link, error) {
	return s.store.Find(code)
}
```

Read `Shorten` and notice it mentions neither base62 nor files nor HTTP. It's pure orchestration. The collision retry lives here — not in the generator (which shouldn't know about storage) and not in the store (which shouldn't know about generation strategies). It belongs to the coordinator, because collision handling is a fact about *combining* the two, and the coordinator is the only thing that sees both.

## Why This Is Worth the Ceremony

It's fair to ask whether three types are overkill for "a map and two handlers." For the toy, yes. For what we're building, the boundaries pay for themselves almost immediately:

- In Chapter 2 we write three `Generator` implementations. `Service` doesn't change.
- In Chapter 3 we swap `MemoryStore` for `FileStore`, then wrap it in a cache. `Service` doesn't change, and neither do the handlers.
- In Chapter 4 we add HTTP handlers that call `Shorten` and `Resolve`. They never touch a code or a map.

Each later change lands in exactly one place. That's the dividend Separation of Concerns pays: not fewer lines today, but *isolated* changes tomorrow.

## When This Is a Mistake

The same honesty from the last step applies to architecture. Three interfaces for a script you'll throw away after one run is [over-engineering](/go/philosophy/yagni) — the toy map is correct for a toy. The boundaries earn their keep only when a component genuinely has more than one implementation or genuinely needs to be tested in isolation. We're confident here because we've already named the second and third implementations of each interface; we're not speculating that we *might* need them. Add a boundary when you can name what's on the other side of it, not before.

## What's Next

The skeleton is standing: a `Link`, a `Generator` interface, a `Store` interface, and a `Service` that wires them. Every one of those is a hole waiting for a real implementation. We'll fill the first hole next — turning a sequence number into a short code — and discover that "which algorithm?" is a question best answered with the [Strategy pattern](/go/patterns/behavioral/strategy).
