---
title: "Pool"
description: "Reuse short-lived allocations across goroutines with sync.Pool to cut garbage-collector pressure on hot paths — a performance tool, not a correctness one."
---

# Pool

**Buys reduced GC pressure on a measured hot path by recycling scratch objects; pays in reset-bug risk — the GC can drop items at any time, so it's not a cache.**

`sync.Pool` is a free list of reusable objects. Instead of allocating a fresh buffer (or struct, or slice) every time a hot function runs and throwing it away after, you borrow one from the pool, use it, and return it for the next caller. On a path that runs thousands of times a second, this turns a storm of short-lived allocations into a handful of reused objects, which is less work for the garbage collector and less memory churn.

Unlike everything else in this section, `sync.Pool` is not about correctness — it won't fix a [data race](/patterns/synchronisation/data-races). It's a *performance* optimisation, and a situational one. Reach for it only when allocation pressure shows up in a profile.

## Scenario

A handler serialises a response on every request, allocating a fresh `bytes.Buffer` each time. Under load that's millions of buffers a minute, all immediately garbage:

```go
// Allocates (and discards) a buffer on every single call.
func Render(w io.Writer, data Data) error {
    var buf bytes.Buffer // fresh allocation, every request
    encode(&buf, data)
    _, err := w.Write(buf.Bytes())
    return err
}
```

> **Smell:** A hot function allocates the same kind of temporary object every call, uses it briefly, and drops it. A profile (`go tool pprof` on allocs, or a high GC percentage) points at this line. The objects are interchangeable and short-lived — ideal pool candidates.

## Solution

Put a `sync.Pool` in front of the allocation. `Get()` returns a reused object (or calls `New` if the pool is empty); `Put()` hands it back. The critical discipline: **reset the object on the way out** so the next borrower doesn't see stale data. This program runs 100 goroutines through a pooled `bytes.Buffer` and deterministically sums the bytes they produce:

```go:title="main.go":run=true:editable=true
package main

import (
	"bytes"
	"fmt"
	"sync"
	"sync/atomic"
)

// New is called only when the pool is empty; otherwise Get reuses a buffer.
var bufPool = sync.Pool{
	New: func() any { return new(bytes.Buffer) },
}

func render(id int) int {
	buf := bufPool.Get().(*bytes.Buffer)
	defer func() {
		buf.Reset()      // wipe before returning, or the next caller sees our data
		bufPool.Put(buf) // hand it back for reuse
	}()

	fmt.Fprintf(buf, "request-%04d", id) // always 12 bytes: "request-NNNN"
	return buf.Len()
}

func main() {
	var total atomic.Int64
	var wg sync.WaitGroup

	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			total.Add(int64(render(id)))
		}(i)
	}

	wg.Wait()
	fmt.Println("total bytes:", total.Load()) // total bytes: 1200
}
```

The shape is always the same: `Get`, type-assert to the concrete type, `defer` a `Reset`+`Put`, then use the object. Every borrowed buffer writes exactly 12 bytes (`request-` plus a 4-digit id), so 100 goroutines always total `1200` — but along the way, far fewer than 100 buffers were actually allocated, because they're recycled.

## When to Use

- A profile shows a hot path allocating and discarding many short-lived, interchangeable objects (buffers, scratch slices, encoders).
- The objects are expensive enough to allocate, or numerous enough, that GC pressure is a measured problem.
- The objects can be cleanly reset to a zero-ish state for reuse.

## When Not to Use

- You haven't profiled. `sync.Pool` adds complexity and a whole class of reset-related bugs; don't add it on a hunch. Most code never needs it.
- The objects are long-lived, or you need to *keep* them — a pool is for transient, returned-immediately scratch space.
- You need a guarantee the object survives — the pool can drop any item at any time (see below). It is not a cache.
- The object is tied to a specific goroutine or carries per-request identity you can't fully reset.

## Common Mistakes

**Forgetting to reset.** A pooled object comes back with whatever the last user left in it. Pull a `bytes.Buffer` without `Reset()` and you'll prepend the previous request's bytes to this one — a data-leak bug that's nasty in exactly the high-throughput code where pools live. Reset on `Put` (as above) or immediately after `Get`; pick one and be consistent.

**Treating it as a cache.** `sync.Pool` makes *no* promise to keep anything. The garbage collector clears pools on every cycle, so an object you `Put` may simply be gone next time. Never store the only copy of something in a pool, and never rely on `Get` returning a specific instance. If you need guaranteed retention, you need a real cache, not a pool.

**Pooling things that aren't worth it.** Pooling tiny, cheap objects can be *slower* than just allocating them — the pool's own synchronisation and the GC interaction have a cost. Pool large or expensive objects on genuinely hot paths; let the allocator handle the rest.

**Putting back a reference that's still in use.** If you `Put` a buffer and then keep writing to it (or hand its `.Bytes()` slice to something that reads later), another goroutine can `Get` the same buffer and corrupt it. The object is the pool's the instant you `Put` it — stop touching it.

**Storing variable-capacity objects that grow without bound.** A pooled buffer that one request grew to 10MB stays 10MB in the pool, wasting memory. For objects whose size varies wildly, cap what you put back (drop oversized ones instead of pooling them).

## The Decision

**Pool vs. just allocating.**
The Go allocator and GC are fast and getting faster; for the overwhelming majority of code, allocating a fresh object per call is the right, simple choice. `sync.Pool` is a targeted fix for a *measured* allocation hotspot — a serialiser, a parser, an encoder running on every request. The decision is entirely profile-driven: no allocation problem in the profile, no pool. Adding one speculatively trades real complexity and reset-bug risk for a speedup you haven't confirmed exists.

**Pool vs. a fixed pre-allocated set.**
If you need a *bounded* set of reusable resources with guaranteed retention — say, exactly 10 reusable workers or connections — `sync.Pool` is the wrong shape, because it can drop items and has no size control. Use a buffered channel as a [semaphore](/patterns/concurrency/semaphore)-style free list, or a [worker pool](/patterns/concurrency/worker-pool), where you own the lifecycle. `sync.Pool` is specifically for GC-pressure relief on interchangeable scratch objects, nothing more.

## Related Patterns

- **[Data Races](/patterns/synchronisation/data-races)**: `sync.Pool` is safe for concurrent use, but the objects you borrow are *yours alone* until you `Put` them back — sharing one across goroutines is still a race.
- **[Worker Pool](/patterns/concurrency/worker-pool)**: confusingly similar name, different job — that pools *goroutines* with a guaranteed lifecycle; this pools *objects* with no guarantees.
- **[Semaphore](/patterns/concurrency/semaphore)**: the right tool when you need a bounded, retained set of reusable resources.
