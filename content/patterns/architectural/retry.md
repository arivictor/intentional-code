---
title: "Retry"
description: "Recover from transient failures by re-attempting an operation with exponential backoff and jitter, while respecting context cancellation and never retrying errors that can't succeed."
---

# Retry

**Buys recovery from transient failures via bounded backoff with jitter; pays in added latency, retry amplification down a call chain, and a hard dependency on idempotency.**

Networks drop packets, databases briefly deadlock, and services restart. Many failures are *transient* — the same call would succeed a moment later. A retry loop re-attempts a failed operation a bounded number of times, waiting longer between each attempt (**exponential backoff**) and adding randomness (**jitter**) so that many clients don't retry in lockstep. The two rules that separate a safe retry from a harmful one: respect `context` cancellation, and never retry an error that can't succeed (a `400`, a validation failure, "account not found").

## Scenario

A request to a downstream service fails once with a connection reset. The operation would have worked on a second attempt, but your code surfaces the first error straight to the user. Worse, the naive "just loop" fix retries instantly and forever — turning a one-second blip into a tight loop that hammers a recovering service and ignores the caller hanging up.

```go
// Fragile — one transient blip becomes a user-facing error.
func (c *Client) Fetch(ctx context.Context, id string) (*Doc, error) {
    return c.do(ctx, id)
}

// "Fixed" — but a tight loop with no backoff, no cap, no cancellation.
// This is a denial-of-service attack on your own dependency.
func (c *Client) FetchRetry(ctx context.Context, id string) (*Doc, error) {
    for {
        doc, err := c.do(ctx, id)
        if err == nil {
            return doc, nil
        }
        // hammers the dependency; never gives up; ignores ctx
    }
}
```

## Solution

Loop a bounded number of times. On failure, decide whether the error is retryable; if so, sleep for a backoff that doubles each attempt, but cancel the wait if the context expires. A permanent error short-circuits immediately.

```text:title="diagram"
  attempt ──► fn() ──success──► done
     ▲          │
     │       failure
     │          │
     │     permanent? ──yes──► return error (no retry)
     │          │ no
     │     attempts left? ──no──► return last error
     │          │ yes
     └── wait(base·2ⁿ + jitter) ◄── unless ctx cancelled
```

```go:title="main.go":run=true:editable=true
package main

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// permanent wraps an error the caller should not retry (e.g. a 400 or a
// validation failure). Retry stops as soon as it sees one.
type permanent struct{ err error }

func (p permanent) Error() string { return p.err.Error() }
func (p permanent) Unwrap() error { return p.err }

func Permanent(err error) error {
	if err == nil {
		return nil // nothing to wrap; never hand back an error that holds nil
	}
	return permanent{err}
}

// Retry calls fn until it succeeds, exhausts attempts, hits a permanent error,
// or the context is cancelled. Backoff doubles each attempt: base, 2*base, ...
func Retry(ctx context.Context, attempts int, base time.Duration, fn func() error) error {
	if attempts < 1 {
		attempts = 1 // always make at least one attempt
	}
	var err error
	for attempt := 0; attempt < attempts; attempt++ {
		if err = fn(); err == nil {
			return nil
		}

		var p permanent
		if errors.As(err, &p) {
			return err // not worth retrying
		}
		if attempt == attempts-1 {
			break // last attempt failed; don't sleep again
		}

		backoff := base << attempt // base * 2^attempt
		// In production add jitter: backoff/2 + rand(backoff/2).
		// Use NewTimer (not time.After) so a ctx cancellation can stop the
		// timer instead of leaking it until it fires.
		timer := time.NewTimer(backoff)
		select {
		case <-timer.C:
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		}
	}
	return fmt.Errorf("after %d attempts: %w", attempts, err)
}

func main() {
	ctx := context.Background()

	// A flaky dependency that fails twice, then succeeds.
	calls := 0
	err := Retry(ctx, 5, time.Millisecond, func() error {
		calls++
		if calls < 3 {
			fmt.Printf("attempt %d: transient failure\n", calls)
			return errors.New("connection reset")
		}
		fmt.Printf("attempt %d: success\n", calls)
		return nil
	})
	fmt.Printf("result: %v\n\n", err)

	// A permanent error stops retrying immediately.
	calls = 0
	err = Retry(ctx, 5, time.Millisecond, func() error {
		calls++
		fmt.Printf("attempt %d: bad request\n", calls)
		return Permanent(errors.New("400 invalid payload"))
	})
	fmt.Printf("result: %v (after %d call)\n", err, calls)
}
```

```
// Output:
// attempt 1: transient failure
// attempt 2: transient failure
// attempt 3: success
// result: <nil>
//
// attempt 1: bad request
// result: 400 invalid payload (after 1 call)
```

**Jitter matters.** Without it, every client that failed at the same instant retries at the same instant, producing synchronised load spikes (the "thundering herd"). Full jitter — sleeping a random duration in `[0, backoff)` — spreads them out. For production, a maintained library handles backoff, jitter, and max-elapsed-time for you:

```go
// using github.com/cenkalti/backoff/v4
import "github.com/cenkalti/backoff/v4"

op := func() error {
    return client.Fetch(ctx, id) // return backoff.Permanent(err) to stop early
}

b := backoff.WithContext(backoff.NewExponentialBackOff(), ctx)
if err := backoff.Retry(op, b); err != nil {
    return fmt.Errorf("fetch failed: %w", err)
}
```

## When to Use

- The failure is genuinely transient: network timeouts, connection resets, `503`/`429`, brief deadlocks, leader elections.
- The operation is **idempotent**, or you have an idempotency key, so a duplicate attempt is safe.
- You're calling across a network boundary where occasional blips are expected and recoverable.
- A short, bounded delay is acceptable to the caller in exchange for higher success rates.

## When Not to Use

- The operation isn't idempotent and a retry could double-charge a card, send two emails, or create duplicate records. Make it idempotent first, or don't retry.
- The error is permanent: bad input, authn/authz failures, "not found". Retrying wastes time and can mask a real bug.
- The caller can't tolerate the added latency. Retries multiply worst-case response time by the attempt count.
- The dependency is already overloaded and retries would deepen the outage. Pair retries with a [Circuit Breaker](/go/patterns/architectural/circuit-breaker) and a [Rate Limiter](/go/patterns/architectural/rate-limiting).

## Tradeoffs

Retries trade latency and load for reliability. The danger is **retry amplification**: in a chain A→B→C, if each layer retries three times, a failure at C can produce up to 27 calls. Retry at one layer (usually the outermost or the one nearest the failure), not every layer, and cap total attempts and total elapsed time.

Idempotency is the precondition everyone underestimates. A retry after a *timeout* is especially treacherous: the first request may have succeeded server-side even though the client saw no response. Without an idempotency key, the retry duplicates the effect.

Finally, retries and circuit breakers want to live together. Retries handle the one-off blip; the breaker handles the sustained outage by stopping retries from piling onto a dependency that needs time to recover.

## Related Patterns

- **Circuit Breaker:** The natural counterpart. Retries cover brief, isolated failures; the breaker trips when failures are sustained, halting retries so a struggling dependency can recover instead of being hammered.
- **Rate Limiting:** Bounds the retry rate so a burst of simultaneous failures doesn't become a self-inflicted load spike. Backoff plus jitter is rate limiting applied over time.
- **Saga:** Compensating transactions are the alternative when retrying isn't safe or possible. A saga step retries the local transaction, but unwinds prior steps when retries are exhausted.
- **Transactional Outbox:** A relay that publishes events retries delivery until the broker accepts them, which is why outbox delivery is at-least-once and consumers must be idempotent.
- **Timeout and Select:** Each individual attempt needs its own timeout; the retry loop wraps those bounded attempts and adds backoff between them.
