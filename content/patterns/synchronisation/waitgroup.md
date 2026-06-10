---
title: "WaitGroup"
description: "Wait for a set of goroutines to finish with sync.WaitGroup — completion coordination, distinct from the locks that protect shared memory."
---

# WaitGroup

**Buys simple block-until-the-batch-completes coordination; pays by doing only that — no error handling or cancellation (reach for errgroup), and no streaming.**

A `sync.WaitGroup` answers one question: *have all my goroutines finished?* You tell it how many to expect with `Add`, each goroutine calls `Done` as it exits, and `Wait` blocks until the count hits zero. That's the whole job — it coordinates **completion**, not access. This is the distinction worth fixing in your head before anything else: a WaitGroup is not a lock. It does nothing to protect shared memory. If your goroutines write to the same variable, you still need a [Mutex](/go/patterns/synchronisation/mutex) or an [atomic](/go/patterns/synchronisation/atomic) — the WaitGroup just tells you when they're all done.

You've already seen it in every example in this section; this page is the primitive itself.

## Scenario

You fan out work across goroutines and need the results before continuing. Without a WaitGroup, `main` (or your function) returns while the goroutines are still running — you read results that aren't there yet, or the program exits and kills them mid-flight:

```go
// BAD — main returns immediately; the goroutines may never even run.
for _, url := range urls {
    go fetch(url) // fire and... forget? main exits, goroutines die.
}
// results are empty here
```

> **Smell:** You launch goroutines in a loop and then immediately use their results, with nothing in between that actually waits for them. A `time.Sleep` to "give them time" is the same bug wearing a disguise.

## Solution

`Add(1)` before launching each goroutine, `defer wg.Done()` as its first line, and `wg.Wait()` before you use the results. This program fans out 10 workers that each compute a partial sum, waits for all of them, then aggregates — always printing `285`:

```go:title="main.go":run=true:editable=true
package main

import (
	"fmt"
	"sync"
)

func main() {
	var wg sync.WaitGroup
	results := make([]int, 10) // each goroutine owns its own slot — no shared write

	for i := 0; i < 10; i++ {
		wg.Add(1) // register one goroutine BEFORE launching it
		go func(n int) {
			defer wg.Done() // first line: signals completion however we exit
			results[n] = n * n
		}(i)
	}

	wg.Wait() // block until all 10 have called Done

	total := 0
	for _, r := range results {
		total += r
	}
	fmt.Println(total) // always 285 (0+1+4+...+81)
}
```

Notice there's no lock anywhere — and yet no race. Each goroutine writes to `results[n]`, *its own* slot, which no other goroutine touches. That's the cleanest way to use a WaitGroup: give every goroutine disjoint data, wait for all of them, then read the combined result on one goroutine. The WaitGroup handles *when*; disjoint slots handle *safety*.

Three rules make this correct:

- **`Add` before the `go`, never inside it.** If you call `wg.Add(1)` *inside* the goroutine, `Wait` can run before the goroutine has scheduled and added itself — the count is already zero and `Wait` returns too early. Add on the launching goroutine, before you spawn.
- **`defer wg.Done()` as the first line.** It fires on every exit path — normal, early return, or panic — so the count always reaches zero and `Wait` never hangs.
- **Pass the loop variable as an argument** (`go func(n int)` … `(i)`). Before Go 1.22 a closure over `i` captured the shared variable and every goroutine saw the final value. Go 1.22 made each iteration's `i` distinct, but passing it explicitly is still the clearest form and works on every version.

## The modern form: wg.Go() (Go 1.25+)

Go 1.25 added `WaitGroup.Go`, which bundles `Add(1)`, the `go`, and `defer Done()` into one call — removing the three places the manual form goes wrong:

```go
var wg sync.WaitGroup
for i := 0; i < 10; i++ {
    wg.Go(func() {       // Add(1) + go + defer Done(), all handled
        results[i] = i * i
    })
}
wg.Wait()
```

Same semantics, fewer ways to misuse. If you're on Go 1.25 or later, prefer `wg.Go`. The manual `Add`/`Done` form above is what you'll see in most existing code and what you need to understand to read it.

## When to Use

- You launch N goroutines and must wait for *all* of them before continuing.
- The goroutines produce results you'll aggregate once they're all done.
- You're coordinating completion only, and protecting any shared state separately (or avoiding it with disjoint data).

## When Not to Use

- The goroutines can *fail* and you want to stop on the first error — use [Errgroup](/go/patterns/concurrency/errgroup), which is a WaitGroup plus error propagation plus cancellation.
- You need to *stream* results as they arrive rather than wait for the whole batch — use a channel and range over it; see [Fan-out / Fan-in](/go/patterns/concurrency/fan-out-fan-in).
- You're trying to protect shared memory — a WaitGroup does not do that. Use a [Mutex](/go/patterns/synchronisation/mutex) or [atomic](/go/patterns/synchronisation/atomic).

## Common Mistakes

**Calling `Add` inside the goroutine.** The race described above: `Wait` can observe a zero count and return before the goroutines register. Always `Add` before `go`.

**Mismatched `Add` and `Done` counts.** More `Done`s than `Add`s panics (`negative WaitGroup counter`); fewer means `Wait` blocks forever. Pair them exactly — `Add(1)` per goroutine, one `defer wg.Done()` per goroutine — and the counts can't drift.

**Forgetting that completion ≠ safety.** The most common conceptual error: assuming that because the WaitGroup serialised completion, the goroutines' writes to shared state are safe. They are not. If two goroutines wrote the *same* variable instead of disjoint slots, the example above would still be a race despite the WaitGroup. Wait coordinates timing; it provides no mutual exclusion.

**Copying the WaitGroup.** Like the other sync types, a `sync.WaitGroup` must not be copied after use. Pass `*sync.WaitGroup` to helper functions, never a value — a copied WaitGroup has its own counter, and `Done` on the copy never reaches the original's `Wait`.

**Reusing a WaitGroup before Wait returns.** Don't call `Add` for a new batch while a previous `Wait` is still in flight. Let `Wait` return, then reuse.

## The Decision

**WaitGroup vs. Errgroup.**
A WaitGroup waits; it has no opinion about failure. The moment your goroutines can return an error and a single failure should cancel the rest, [`errgroup.Group`](/go/patterns/concurrency/errgroup) is the upgrade — it *is* a WaitGroup with error collection and context cancellation built in. Use a bare WaitGroup when the work can't meaningfully fail (or when each goroutine handles its own errors and you only need to know everyone's done). Reach for errgroup when "if one fails, stop everything" is the desired behaviour.

**WaitGroup vs. a channel.**
A WaitGroup is the right tool when you want to *block until a batch completes* and then act. A channel is the right tool when you want to *stream results as they arrive* and process each immediately. If you find yourself building a "done" channel and counting sends to know when N goroutines finished, that's a WaitGroup reinvented — use the WaitGroup. If you're waiting for the whole batch only to then range over collected results, a WaitGroup plus disjoint result slots is simpler than channel plumbing.

## Related Patterns

- **[Errgroup](/go/patterns/concurrency/errgroup)**: WaitGroup plus error propagation and cancellation — the upgrade when goroutines can fail.
- **[Mutex](/go/patterns/synchronisation/mutex)** / **[Atomic](/go/patterns/synchronisation/atomic)**: what you *also* need if the goroutines share mutable state — a WaitGroup doesn't protect memory.
- **[Worker Pool](/go/patterns/concurrency/worker-pool)** and **[Fan-out / Fan-in](/go/patterns/concurrency/fan-out-fan-in)**: both use a WaitGroup internally to know when all workers have drained the queue.
