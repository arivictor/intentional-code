---
title: "Rate Limiting"
description: "Cap the rate of operations using a token bucket so a service protects itself and its dependencies from overload, shedding or shaping excess load instead of collapsing under it."
---

# Rate Limiting

Rate limiting caps how many operations are allowed per unit of time. Where a [Circuit Breaker](/go/patterns/architectural/circuit-breaker) reacts to a dependency that is *already* failing, a rate limiter is proactive: it bounds load before anything breaks. The canonical algorithm in Go is the **token bucket** — a bucket holds up to `capacity` tokens and refills at a steady rate; each operation costs one token, and when the bucket is empty, requests are rejected or made to wait. The burst capacity absorbs short spikes while the refill rate enforces the long-run average.

Go's standard-library-adjacent `golang.org/x/time/rate` implements exactly this and is the production default. The hand-rolled version below exists to show the mechanism.

## Scenario

Your service calls a third-party payments API that allows 10 requests per second. During a traffic spike you fire requests as fast as they arrive. The provider starts returning `429 Too Many Requests`, then temporarily bans your API key. The problem isn't your dependency being slow — it's you exceeding a budget you were given.

```go
// No limit — every inbound request becomes an outbound call immediately.
// A burst of 500 inbound requests means 500 outbound calls in a blink,
// blowing past the provider's 10 req/s quota and getting you throttled.
func (s *PaymentService) Charge(ctx context.Context, req ChargeRequest) error {
    return s.provider.Charge(ctx, req)
}
```

## Solution

Put a token bucket in front of the call. Refill at the rate the dependency permits and size the bucket for the burst you want to tolerate. Requests that find an empty bucket are rejected (load shedding) or block until a token is available (throttling).

```text:title="diagram"
   refill: N tokens/sec
        │
        ▼
   ┌──────────┐
   │ ●●●○○    │  bucket (capacity = burst)
   └────┬─────┘
        │ take 1 token
        ▼
   request ──token available?──► yes ──► proceed
                  │
                  └── no ──► reject (429) or wait
```

The token bucket below takes the current time explicitly, which keeps it deterministic and trivial to test:

```go:title="main.go":run=true:editable=true
package main

import (
	"fmt"
	"math"
	"sync"
	"time"
)

// TokenBucket is a rate limiter. It holds up to `capacity` tokens and refills
// at `refillRate` tokens per second. Each allowed request costs one token.
// Time is passed in explicitly so the limiter is deterministic and testable.
type TokenBucket struct {
	mu         sync.Mutex
	tokens     float64
	capacity   float64
	refillRate float64
	last       time.Time
}

func NewTokenBucket(capacity, refillRate float64, now time.Time) *TokenBucket {
	return &TokenBucket{
		tokens:     capacity,
		capacity:   capacity,
		refillRate: refillRate,
		last:       now,
	}
}

// Allow reports whether a request at time `now` may proceed, consuming a token
// if so. It first credits tokens accrued since the last call.
func (tb *TokenBucket) Allow(now time.Time) bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	elapsed := now.Sub(tb.last).Seconds()
	tb.tokens = math.Min(tb.capacity, tb.tokens+elapsed*tb.refillRate)
	tb.last = now

	if tb.tokens >= 1 {
		tb.tokens--
		return true
	}
	return false
}

func main() {
	// Burst of 3, refilling 1 token per second.
	t0 := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	lim := NewTokenBucket(3, 1, t0)

	// Five requests arrive at once: the bucket only has 3 tokens.
	for i := 1; i <= 5; i++ {
		fmt.Printf("t=0s req %d: allowed=%v\n", i, lim.Allow(t0))
	}

	// Two seconds later, 2 tokens have refilled.
	t2 := t0.Add(2 * time.Second)
	for i := 1; i <= 3; i++ {
		fmt.Printf("t=2s req %d: allowed=%v\n", i, lim.Allow(t2))
	}
}
```

```
// Output:
// t=0s req 1: allowed=true
// t=0s req 2: allowed=true
// t=0s req 3: allowed=true
// t=0s req 4: allowed=false
// t=0s req 5: allowed=false
// t=2s req 1: allowed=true
// t=2s req 2: allowed=true
// t=2s req 3: allowed=false
```

For production, reach for `golang.org/x/time/rate`. It uses real time, supports both non-blocking checks and blocking waits, and lets a single request reserve multiple tokens:

```go
// using golang.org/x/time/rate
import "golang.org/x/time/rate"

// 10 events/sec, burst of 30.
lim := rate.NewLimiter(rate.Limit(10), 30)

// Non-blocking: shed load when over budget.
if !lim.Allow() {
    http.Error(w, "rate limited", http.StatusTooManyRequests)
    return
}

// Blocking: throttle the caller until a token frees up (or ctx expires).
if err := lim.Wait(ctx); err != nil {
    return fmt.Errorf("rate limit wait: %w", err)
}
```

For limits that must be shared across many instances of your service, keep the counter in a shared store — typically Redis with an atomic `INCR` plus expiry, or a Lua script implementing a sliding window. A per-instance limiter only bounds that one process.

## When to Use

- You must respect a downstream quota (third-party API, database connection budget) and exceeding it gets you throttled or banned.
- You want to protect your own service from overload — cap requests per client/IP/API key to stop one caller starving the rest.
- You need to smooth bursty traffic into a steady rate before it hits an expensive or fragile resource.
- You're implementing fair-use tiers (free vs paid) where different callers get different budgets.

## When Not to Use

- The work is cheap and the resource is effectively unbounded. A limiter just adds latency and a failure mode you didn't need.
- You actually need *bounded concurrency*, not a bounded rate — "at most 20 in flight at once" is a [Semaphore](/go/patterns/concurrency/semaphore), not a token bucket.
- The constraint is a slow or failing dependency rather than too many calls. That's a [Circuit Breaker](/go/patterns/architectural/circuit-breaker).
- A single hard cap is too blunt for your fairness requirements and you'd be better served by a queue with priorities.

## Tradeoffs

The hard choice is **shed vs. throttle**. Rejecting excess requests (`Allow` returning false → `429`) keeps latency bounded and pushes back-pressure to the caller, but some requests fail. Throttling (`Wait`) accepts everything but trades it for latency, and unbounded waiting can pile up goroutines and memory — the very failure you were avoiding. Always bound the wait with a context deadline.

Tuning the burst is the other lever: too small and legitimate bursts get rejected; too large and you let through spikes big enough to overwhelm the thing you're protecting. Pick the refill rate from the real budget and the burst from how much spikiness the downstream can absorb.

Finally, a per-instance limiter does not enforce a global rate. Under horizontal scaling, N instances each allowing R requests/sec permits up to N×R. If the budget is global, the counter must be too.

## Related Patterns

- **Circuit Breaker:** Complementary resilience patterns. The limiter prevents overload proactively; the breaker reacts once a dependency is already failing. Production clients often stack both — limit outbound rate, and trip a breaker if the dependency still misbehaves.
- **Retry:** A dangerous pair without care. Retries multiply load exactly when a system is struggling; a rate limiter (plus jittered backoff) keeps a retry storm from becoming a self-inflicted denial of service.
- **Semaphore:** The concurrency analogue. A semaphore bounds *how many* operations run at once; a rate limiter bounds *how often* they start. Use a semaphore for resource pools, a limiter for quotas.
- **Worker Pool:** A pool bounds concurrency by construction; a rate limiter shapes how fast jobs enter it. The two compose: limit the enqueue rate, pool the execution.
- **Backends for Frontends / Microservices:** API gateways and BFFs are the natural home for per-client rate limiting, applied at the system edge before requests fan out to internal services.
