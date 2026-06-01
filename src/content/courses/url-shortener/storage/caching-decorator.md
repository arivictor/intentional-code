---
title: "The Caching Decorator"
order: 3
description: "Add an LRU cache as a Store that wraps a Store — the Decorator pattern — built on container/list, with an honest look at when caching helps and when it lies."
---

## A Store That Wraps a Store

Reads now hit the database. Every redirect is a `Find`, and every `Find` is a SQL query that crosses into SQLite and back — fast, but not free, and the redirect path is the hottest in the whole service. So we put a small, bounded cache of the **hot** links — the handful that get hammered — in front of the store, so the busiest codes answer straight from memory and never touch the database at all.

Here's the elegant part. We won't bolt caching *into* a store. We'll write a new `Store` whose entire job is to wrap another `Store` and add caching — and because it satisfies the same interface, it can wrap `MemoryStore`, `SQLiteStore`, or anything we build later. A component that wraps another component of the same type to add behaviour is the [Decorator pattern](/go/patterns/structural/decorator), and a cache is its perfect illustration.

```
Service ──► CachedStore ──► SQLiteStore ──► disk
            (adds caching)  (adds durability)
```

`Service` thinks it's holding a `Store`. It is — it just happens to be a cache wrapped around a database wrapped around a disk. Each layer adds one concern and preserves the interface.

## Building a Bounded LRU

A cache needs an eviction policy: when it's full, which entry goes? **Least Recently Used** is the standard answer — evict whatever hasn't been touched in the longest time, betting that hot links stay hot. The classic LRU is a hash map for O(1) lookup plus a doubly-linked list for O(1) recency ordering. Go ships a doubly-linked list in `container/list`, so we assemble rather than invent.

```go
package shortener

import (
	"container/list"
	"sync"
)

// lru is a bounded, goroutine-safe least-recently-used cache. The map
// gives O(1) lookup; the list tracks recency so eviction is O(1) too.
type lru struct {
	mu       sync.Mutex
	capacity int
	ll       *list.List               // front = most recent, back = least
	items    map[string]*list.Element // code -> its node in the list
}

type entry struct {
	key  string
	link Link
}

func newLRU(capacity int) *lru {
	if capacity < 1 {
		capacity = 1
	}
	return &lru{
		capacity: capacity,
		ll:       list.New(),
		items:    make(map[string]*list.Element),
	}
}
```

A lookup moves the hit to the front (most-recently-used); a miss is just a miss:

```go
func (c *lru) get(key string) (Link, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	el, ok := c.items[key]
	if !ok {
		return Link{}, false
	}
	c.ll.MoveToFront(el) // touched, so it's now the most recent
	return el.Value.(*entry).link, true
}
```

An add inserts at the front and evicts from the back if we've grown past capacity:

```go
func (c *lru) add(key string, link Link) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[key]; ok {
		c.ll.MoveToFront(el)
		el.Value.(*entry).link = link
		return
	}
	el := c.ll.PushFront(&entry{key: key, link: link})
	c.items[key] = el
	if c.ll.Len() > c.capacity {
		back := c.ll.Back() // the least-recently-used node
		if back != nil {
			c.ll.Remove(back)
			delete(c.items, back.Value.(*entry).key)
		}
	}
}
```

Every path holds the cache's own mutex. The cache is touched on *every* read, so its locking is independent of — and finer-grained than — the store it fronts.

## The Decorator Itself

With the cache built, the decorator is almost trivial — which is the sign the boundaries are right:

```go
// CachedStore decorates any Store with an LRU read cache. It is itself a
// Store, so callers can't tell they're talking to a cache.
type CachedStore struct {
	inner Store
	cache *lru
}

var _ Store = (*CachedStore)(nil)

func NewCachedStore(inner Store, capacity int) *CachedStore {
	return &CachedStore{inner: inner, cache: newLRU(capacity)}
}

func (s *CachedStore) Find(code string) (Link, error) {
	if link, ok := s.cache.get(code); ok {
		return link, nil // cache hit — never touches inner
	}
	link, err := s.inner.Find(code) // miss: ask the wrapped store
	if err != nil {
		return Link{}, err // don't cache misses; ErrNotFound passes through
	}
	s.cache.add(code, link)
	return link, nil
}

func (s *CachedStore) Save(link Link) error {
	if err := s.inner.Save(link); err != nil {
		return err // durability first; only cache what actually persisted
	}
	s.cache.add(link.Code, link) // warm the cache: new links are often hit at once
	return nil
}

func (s *CachedStore) Next() uint64 { return s.inner.Next() }
```

Read `Find` and notice the discipline. A hit returns without disturbing `inner`. A miss delegates, and only caches a *successful* lookup — caching `ErrNotFound` would be a denial-of-service gift, letting one request for a bogus code poison the cache. `Save` writes through to `inner` first and only caches once persistence succeeded, so the cache can never hold a link the durable store rejected. `Next` just forwards — the decorator has no opinion about sequence numbers, so it stays out of the way.

## Stacking Layers

Because every layer is a `Store`, you compose them like function calls — and `Service` is identical no matter how deep the stack:

```go
db, err := shortener.OpenSQLiteStore("links.db")
if err != nil {
	log.Fatal(err)
}
store := shortener.NewCachedStore(db, 1024) // hot links cached; everything durable

svc := shortener.NewService(store, gen) // Service has no idea it's two layers
```

Want request logging or metrics on every store call? Write a `LoggingStore` that wraps a `Store`, and slot it into the chain. That's the Decorator dividend: new cross-cutting behaviour is a new wrapper, never an edit to the stores you already trust.

## When Caching Lies

A cache is a *second copy of the truth*, and second copies go stale. We get away with a dead-simple cache here for one specific reason: **our links are immutable.** A `Link` is written once and never edited or deleted, so a cached copy can never disagree with the store. Cache invalidation — famously one of the two hard problems in computer science — simply doesn't arise.

The instant that assumption breaks, this code becomes a bug. Add an "edit destination URL" feature and `Find` will happily serve the stale cached URL forever, because nothing tells the cache the link changed. The honest fix would be invalidation in `Save`/`Update` (evict the key so the next read reloads it) — and that's the real cost the [Decorator pattern's tradeoffs](/go/patterns/structural/decorator) warns about: each layer you stack is another place state can drift out of sync. Reach for a cache when reads dominate, the data is read-mostly, and a small staleness window is acceptable. Skip it when writes are frequent or correctness is exact — a cache you have to invalidate on every write is just overhead wearing a performance costume.

## What's Next

Storage is done: a Repository with three faces — fast in `MemoryStore`, durable in `SQLiteStore`, hot-fast in `CachedStore` — all the same interface, all composable. The engine runs; nothing can talk to it yet. The next chapter opens the doors: an HTTP API that turns `POST /shorten` and `GET /{code}` into calls on the `Service` we've quietly been building this whole time.
