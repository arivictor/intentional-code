---
title: "Data Races"
description: "What a data race actually is, why counter++ isn't atomic, and how to find races with the -race detector before they find you in production."
---

# Data Races

**Buys near-zero-false-positive race detection when you run the suite under `-race` in CI; pays a test-time CPU and memory multiplier, and catches only the interleavings it actually observes.**

A data race happens when two goroutines touch the same memory at the same time, and at least one of them is writing. The result is undefined: you might get the right answer, a wrong answer, a torn value, or a crash — and which one you get can change between runs, between machines, and between compiler versions. Races are the single most common concurrency bug in Go, and the most expensive to debug, because the symptom rarely shows up where the cause lives.

This page is the foundation for the rest of this section. Every other pattern here — [Mutex](/go/patterns/synchronisation/mutex), [RWMutex](/go/patterns/synchronisation/rwmutex), [Atomic](/go/patterns/synchronisation/atomic) — exists to make a data race impossible.

## Scenario

Three goroutines each increment a shared counter 3000 times. You expect 9000. Run this and you'll often get less:

```go
// BAD — three goroutines write `counter` with no synchronisation.
var counter int
var wg sync.WaitGroup

for i := 0; i < 3; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        for j := 0; j < 3000; j++ {
            counter++ // data race
        }
    }()
}
wg.Wait()
fmt.Println(counter) // 9000? sometimes. 7421? also.
```

The bug hides in plain sight. `counter++` *looks* like one step, but it's three: read the current value, add one, write it back. When two goroutines read `8` at the same time, both compute `9`, and both write `9`. Two increments, one result. The lost update is invisible in the source — there's no line you can point at and say "the race is here," because the race is in the *interleaving*, not the code.

> **Smell:** A variable is read or written from more than one goroutine and you can't point to the lock, channel, or atomic that orders those accesses. If the only thing keeping it correct is "the goroutines probably won't collide," it's a race — it just hasn't lost yet.

## The fix

Make the read-modify-write indivisible. A [`sync.Mutex`](/go/patterns/synchronisation/mutex) does exactly that: only one goroutine holds the lock at a time, so the three steps of `counter++` can't be interleaved with anyone else's. This version always prints `9000`:

```go:title="main.go":run=true:editable=true
package main

import (
	"fmt"
	"sync"
)

func main() {
	var counter int
	var mu sync.Mutex
	var wg sync.WaitGroup

	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done() // put this first — it's a guarantee, not an afterthought
			for j := 0; j < 3000; j++ {
				mu.Lock()
				counter++
				mu.Unlock()
			}
		}()
	}

	wg.Wait()
	fmt.Println(counter) // always 9000
}
```

This is essentially the code you'd write by hand, with two small corrections worth calling out.

**`defer wg.Done()` goes at the top of the goroutine, not the bottom.** `defer` runs when the function *returns*, regardless of where the statement sits. Writing it at the end (after the loop) still works, but it reads as if `Done` happens at that line — it doesn't. Putting `defer wg.Done()` as the first line states the contract up front: *this goroutine signals completion when it exits, no matter how it exits.* If a future edit adds an early `return` or a panic-recover, the deferred `Done` still fires and `wg.Wait()` won't hang.

**The loop counter and the launch loop are independent.** A common version starts the inner loop at `1` and runs `<= 3000`; starting at `0` and running `< 3000` is the same count and the more idiomatic Go form.

## Finding races: the `-race` detector

You don't have to spot races by eye. Go ships a race detector built into the toolchain. Add `-race` to `run`, `test`, or `build` and the runtime instruments every memory access, then reports any unsynchronised read/write pair it observes at runtime:

```bash
go run -race main.go     # run a program with the detector on
go test -race ./...      # the important one — run your whole suite under -race
go build -race -o app .  # build an instrumented binary
```

On the broken version above, the detector prints exactly where the conflicting accesses happened, with both goroutine stacks:

```
==================
WARNING: DATA RACE
Read at 0x00c0000140a0 by goroutine 8:
  main.main.func1()
      /tmp/main.go:14 +0x...
Previous write at 0x00c0000140a0 by goroutine 7:
  main.main.func1()
      /tmp/main.go:14 +0x...
==================
```

Two things to internalise about the detector:

- **It only catches races it actually observes.** If a particular interleaving doesn't happen during the run, it won't be reported. That's why you run your *whole test suite* under `-race` in CI, not a one-off — more code paths exercised means more races caught.
- **It has no false positives.** If `-race` reports a race, it is a real race. There is no "but it works on my machine" rebuttal.

Wire it into CI once and it pays for itself: run `go test -race ./...` in your Makefile and GitHub Actions, and treat a race report as a build failure rather than a flaky test to retry.

## When you have a race

The fix is always one of: stop sharing the memory, or synchronise the access. In rough order of preference:

- **Don't share it.** Give each goroutine its own copy and combine results at the end. No shared write, no race. This is the channels model — see the [concurrency patterns](/go/patterns/concurrency).
- **Make the access atomic.** For a single integer or pointer, [`sync/atomic`](/go/patterns/synchronisation/atomic) is lock-free and the lightest fix.
- **Guard it with a lock.** For anything more than one word — a struct, a map, a multi-field update — a [`sync.Mutex`](/go/patterns/synchronisation/mutex) around the critical section is the standard tool.

## Common Mistakes

**Thinking a single statement is atomic.** `counter++`, `m[k] = v`, `slice = append(slice, x)`, and `p = newPtr` are all multiple machine operations. None of them are safe to run concurrently without synchronisation. "It's just one line" is not a correctness argument.

**Believing a race that "always gives the right answer" is fine.** Undefined behaviour includes *happening to work today*. The same code can corrupt memory after a compiler upgrade, on a different CPU architecture, or under load you haven't tested. A race the detector finds is a bug whether or not you've seen it misbehave.

**Reaching for a longer sleep to "fix" it.** `time.Sleep` doesn't synchronise anything; it just changes the timing so the race is harder to reproduce. The bug is still there, now better hidden.

**Racing on a map.** Concurrent map writes are special: the Go runtime detects them directly and crashes the program with `fatal error: concurrent map writes`, even without `-race`. Guard the map with a [Mutex](/go/patterns/synchronisation/mutex), or use `sync.Map` for the specific access patterns it's built for.

## The Decision

**Race detector in CI vs. catching races by review.**
You cannot reliably find races by reading code — the whole problem is that the bug lives in interleavings you can't see in source. `-race` is cheap (a CPU and memory multiplier on test runs, nothing in production since you ship the uninstrumented binary) and decisive. Running the suite under `-race` in CI is the single highest-leverage thing you can do for concurrent Go. Treat a `-race` failure as a build failure, not a warning.

**Synchronise vs. don't share.**
The fastest, simplest, most bug-resistant fix for a race is to not have shared mutable state at all. Before adding a lock, ask whether each goroutine could own its own data and hand results back through a channel or a `wg.Wait()`-then-combine step. Locks are correct, but they add contention and a new way to deadlock; unshared data has neither problem. Share memory only when the alternative is genuinely more complex — then guard every access to it.

## Related Patterns

- **[Mutex](/go/patterns/synchronisation/mutex)**: the default fix — mutual exclusion around a critical section.
- **[Atomic](/go/patterns/synchronisation/atomic)**: the lock-free fix for a single integer, flag, or pointer.
- **[WaitGroup](/go/patterns/synchronisation/waitgroup)**: coordinates *completion* (used above) but does **not** protect shared memory — a common point of confusion.
- **[Concurrency Patterns](/go/patterns/concurrency)**: the channel-first model that avoids shared memory in the first place.
