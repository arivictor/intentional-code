---
title: "The Repository"
order: 1
description: "Implement the Store interface in memory — a concurrency-safe map behind the Repository pattern, with a read/write split and a lock-free sequence counter."
---

## The Interface, Revisited

Chapter 1 defined the contract; here it is again, because everything in this chapter implements it:

```go
type Store interface {
	Save(link Link) error          // ErrCodeExists if the code is taken
	Find(code string) (Link, error) // ErrNotFound if it isn't there
	Next() uint64                  // a monotonically increasing sequence number
}
```

That's the [Repository pattern](/go/patterns/architectural/repository) distilled: the rest of the system asks for links by their domain identity — the code — and never learns whether they live in a map, a file, or across a network. We'll honour that promise by building three implementations that are indistinguishable from the outside.

Start with the simplest one that's actually correct under load: an in-memory store.

## A Map Is Almost Enough

The toy used a bare `map[string]string`. The problem isn't the map — it's that a Go map is **not safe for concurrent use**, and an HTTP server hands every request to its own goroutine. Two simultaneous `Save` calls racing on the same map is a data race that will, eventually, crash the process. Run the toy under `go test -race` and Go tells you so in red.

The fix is a mutex guarding the map. But not just any mutex — a `sync.RWMutex`, because a URL shortener's traffic is wildly read-heavy. Every redirect is a `Find`; only the comparatively rare "shorten this" request is a `Save`. An `RWMutex` lets unlimited readers proceed in parallel and only serialises the occasional writer.

```go
package shortener

import (
	"sync"
	"sync/atomic"
)

// MemoryStore is an in-memory Repository. It is safe for concurrent use:
// an RWMutex guards the map (many readers OR one writer) and an atomic
// counter hands out sequence numbers without taking the lock at all.
type MemoryStore struct {
	mu    sync.RWMutex
	links map[string]Link
	seq   atomic.Uint64
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{links: make(map[string]Link)}
}

// Verify at compile time that we satisfy the interface.
var _ Store = (*MemoryStore)(nil)
```

That last line is a habit worth keeping: `var _ Store = (*MemoryStore)(nil)` is a compile-time assertion that `*MemoryStore` implements `Store`. If a method signature drifts, the build fails *here*, with a clear message, instead of at some distant call site.

## Reads, Writes, and the Critical Section

`Find` takes a **read** lock — many redirects can resolve codes simultaneously:

```go
func (s *MemoryStore) Find(code string) (Link, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	link, ok := s.links[code]
	if !ok {
		return Link{}, ErrNotFound
	}
	return link, nil
}
```

`Save` takes a **write** lock, and the check-then-insert must happen *inside the same locked section*:

```go
func (s *MemoryStore) Save(link Link) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.links[link.Code]; exists {
		return ErrCodeExists
	}
	s.links[link.Code] = link
	return nil
}
```

This is the subtle part. It's tempting to "optimise" by checking existence under a cheap read lock and only taking the write lock to insert. That's a **time-of-check-to-time-of-use** bug: between releasing the read lock and taking the write lock, another goroutine can insert the same code, and now you've silently overwritten a link. The check and the insert are one atomic decision — "is this code free, and if so claim it" — so they live under one lock. Correctness first; the write path is rare anyway.

## A Counter Without a Lock

`Next` hands out sequence numbers. It *could* live under the same mutex, but it doesn't need to — incrementing a counter is exactly what atomics are for:

```go
func (s *MemoryStore) Next() uint64 {
	return s.seq.Add(1) // first call returns 1; lock-free and goroutine-safe
}
```

`atomic.Uint64.Add` is a single hardware instruction with no lock contention. Keeping `Next` off the map's mutex means generating a sequence number never blocks a `Find` or `Save`. It's a small thing, but it's the right instinct: take the narrowest synchronisation that's still correct.

Note that `Next` and `Save` aren't bundled into one transaction — `Service.Shorten` calls `Next`, then `Generate`, then `Save` as separate steps. That's fine: a sequence number that gets generated but never saved (because generation failed) just leaves a harmless gap in the sequence. We're handing out *unique* numbers, not *gapless* ones.

## Proving It's Safe

The whole reason for the mutex is concurrency, so the test that matters hammers it from many goroutines under the race detector:

```go
func TestMemoryStoreConcurrent(t *testing.T) {
	s := NewMemoryStore()
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			code := base62.Encode(s.Next()) // unique per goroutine
			if err := s.Save(Link{Code: code, URL: "https://example.com"}); err != nil {
				t.Errorf("Save: %v", err)
			}
			if _, err := s.Find(code); err != nil {
				t.Errorf("Find after Save: %v", err)
			}
		}()
	}
	wg.Wait()
}
```

```
$ go test -race ./...
ok  	example/urlshortener	0.041s
```

`-race` is non-negotiable for code like this. It instruments memory access and fails the moment two goroutines touch the same location without synchronisation. A green race-detector run is your evidence that the locking is actually correct — not just that it happened to work this time.

## When In-Memory Is the Right Answer

It's worth saying that `MemoryStore` isn't a throwaway step toward the "real" store. For a cache layer (next step but one), for tests, for an ephemeral preview environment, an in-memory Repository is exactly right — fast, zero-dependency, no cleanup. The Repository pattern's quiet win is that "in memory" and "on disk" are the same shape, so you pick per-environment without the calling code knowing.

What in-memory *can't* do is survive a restart. Kill the process and every link is gone. For a real service that's fatal — which is the next step's whole job.

## What's Next

We have a correct, concurrent, lock-savvy Repository that forgets everything on exit. Next we make storage durable — and instead of hand-rolling a file format, we hand persistence to SQLite behind the very same three-method `Store` interface. Watch what happens to the locking: the database enforces uniqueness itself, so the mutex and the check-then-insert dance both disappear. Reads, though, now cross into a real database — which is exactly what makes the cache in the chapter after it earn its keep.
