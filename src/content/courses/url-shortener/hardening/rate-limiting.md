---
title: "Rate Limiting"
order: 1
description: "Build a per-IP token-bucket limiter behind a Limiter interface, then apply it as middleware — Strategy and Decorator working together."
---

## The Algorithm: a Token Bucket

A rate limiter answers one question — *may this request proceed right now?* — and the **token bucket** is the algorithm worth knowing because it allows short bursts while capping the sustained rate. Picture a bucket that holds up to *N* tokens and refills at *R* tokens per second. Each request spends one token; if the bucket is empty, the request is refused. A client that's been quiet builds up a full bucket and can burst; a client hammering you drains it and gets throttled to the refill rate.

The whole algorithm is a few lines, with no third-party limiter in sight — just `time` and arithmetic:

```go
package shortener

import (
	"sync"
	"time"
)

// tokenBucket holds up to capacity tokens, refilling at refillRate per
// second. Each allowed event spends one token. It is not safe for
// concurrent use on its own — the limiter below guards it.
type tokenBucket struct {
	tokens     float64
	capacity   float64
	refillRate float64 // tokens per second
	last       time.Time
}

func (b *tokenBucket) allow(now time.Time) bool {
	// Lazily refill for the time elapsed since the last check — no
	// background ticker per bucket, just math when we're asked.
	elapsed := now.Sub(b.last).Seconds()
	b.last = now
	b.tokens = min(b.capacity, b.tokens+elapsed*b.refillRate)

	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}
```

The trick is *lazy* refill: instead of a goroutine topping up every bucket on a timer, we compute how many tokens *would* have accrued since we last looked, the instant someone asks. One bucket or a million, the cost is one subtraction per request. (`min` is a Go 1.21 built-in.)

## The Strategy Interface

Token bucket is one algorithm; fixed-window counters and leaky buckets are others, each with different burst behaviour. We don't want the middleware welded to one of them, so we hide the choice behind an interface — the [Strategy pattern](/go/patterns/behavioral/strategy), the same move we made for code generation:

```go
// Limiter decides whether an event for a given key may proceed now.
// Key is usually a client IP. Implementations are interchangeable.
type Limiter interface {
	Allow(key string) bool
}
```

Our token-bucket strategy keeps one bucket per key, so every client gets its own allowance:

```go
// IPRateLimiter applies an independent token bucket per key. It satisfies
// the Limiter strategy, so the middleware never knows which algorithm runs.
type IPRateLimiter struct {
	mu         sync.Mutex
	buckets    map[string]*tokenBucket
	capacity   float64
	refillRate float64
}

var _ Limiter = (*IPRateLimiter)(nil)

func NewIPRateLimiter(ratePerSec, burst float64) *IPRateLimiter {
	return &IPRateLimiter{
		buckets:    make(map[string]*tokenBucket),
		capacity:   burst,
		refillRate: ratePerSec,
	}
}

func (l *IPRateLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[key]
	if !ok {
		b = &tokenBucket{
			tokens:     l.capacity, // start full: a client's first request always passes
			capacity:   l.capacity,
			refillRate: l.refillRate,
			last:       time.Now(),
		}
		l.buckets[key] = b
	}
	return b.allow(time.Now())
}
```

## Bounding the Bucket Map

That `buckets` map grows by one entry per unique IP and never shrinks — a slow memory leak, and a mild amplification vector if an attacker rotates source addresses. A real limiter prunes idle clients. Because an idle client's bucket refills to full, "full" is our signal to evict:

```go
// Cleanup removes buckets that have fully refilled (clients idle long
// enough to forget). Call it periodically from a goroutine.
func (l *IPRateLimiter) Cleanup() {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	for key, b := range l.buckets {
		refilled := min(b.capacity, b.tokens+now.Sub(b.last).Seconds()*b.refillRate)
		if refilled >= b.capacity {
			delete(l.buckets, key)
		}
	}
}
```

```go
// At startup, run cleanup on a ticker:
go func() {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for range t.C {
		limiter.Cleanup()
	}
}()
```

Evicting a full bucket is safe: the very next request from that IP just recreates a full one, which is exactly the state we deleted. No client is ever wrongly throttled by cleanup.

## Applying It as Middleware

Now the limiter becomes a gate in front of the handlers. An HTTP middleware *wraps* a handler and returns a handler of the same type — that's the [Decorator pattern](/go/patterns/structural/decorator) — and one that can *refuse to call* the wrapped handler is also [Chain of Responsibility](/go/patterns/behavioral/chain-of-responsibility). A rate limiter is both at once:

```go
import (
	"net"
	"net/http"
)

// RateLimit wraps a handler, rejecting requests once a client outruns the
// limiter. It returns the same JSON error envelope as every other failure.
func RateLimit(limiter Limiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !limiter.Allow(clientIP(r)) {
				w.Header().Set("Retry-After", "1")
				writeError(w, &apiError{
					Status:  http.StatusTooManyRequests,
					Code:    "rate_limited",
					Message: "too many requests, please slow down",
				})
				return // short-circuit: next never runs
			}
			next.ServeHTTP(w, r)
		})
	}
}

// clientIP extracts the client address. RemoteAddr is "ip:port".
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
```

Wiring it in is one line, because middleware composes by wrapping:

```go
func (s *Server) Routes(limiter Limiter) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("POST /shorten", handler(s.handleShorten))
	mux.Handle("GET /{code}", handler(s.handleRedirect))
	mux.Handle("GET /healthz", handler(s.handleHealth))
	return RateLimit(limiter)(mux) // every route now passes the gate
}
```

Reusing `writeError` and the `apiError` envelope means a throttled client gets the *same* `{"error": {...}}` shape as a validation failure — consistency we get for free because we centralised errors two steps ago. In production you'd exempt `GET /healthz` (a load balancer shouldn't be throttled) by limiting only the two real routes; we keep it simple here and note the seam.

## Seeing It Throttle

With a limiter of 5 requests/second and a burst of 5:

```go
limiter := shortener.NewIPRateLimiter(5, 5)
http.ListenAndServe(":8080", srv.Routes(limiter))
```

```
$ for i in $(seq 1 8); do
    curl -s -o /dev/null -w "%{http_code} " -X POST localhost:8080/shorten -d '{"url":"https://go.dev"}'
  done
201 201 201 201 201 429 429 429
```

Five succeed (the burst), then the bucket's empty and the rest get `429 Too Many Requests` until tokens refill.

## Tradeoffs

A per-IP, in-memory limiter is the right *first* limiter, and wrong for some real situations — name them so you know when you've outgrown it:

- **Shared IPs.** An office or mobile carrier behind one NAT looks like a single hammering client. Keying on an API token instead of an IP fixes it where you have authenticated users.
- **Spoofable forwarded headers.** Behind a proxy, the real client IP is in `X-Forwarded-For` — but clients can forge that header, so you may only trust it from *known* proxy addresses. Defaulting to `RemoteAddr` is the safe baseline.
- **Single node only.** Each instance has its own buckets, so three replicas allow roughly 3× the limit. True distributed limiting needs shared state (a Redis counter) — a different architecture, and a dependency we're not taking.
- **Resets on restart.** Buckets live in memory; a deploy forgives everyone. Usually fine for abuse control; not fine if you're enforcing a paid quota.

None of these makes the token bucket wrong. They mark the line where "protect one box from abuse" becomes "enforce a global quota" — a genuinely harder problem you should reach for only when you have it.

## What's Next

The service now refuses abuse. The other production hazard is subtler: we want to *count* clicks, but the redirect is our hottest path and must stay fast. Next we move click-counting off the request entirely, onto a background [Worker Pool](/go/patterns/concurrency/worker-pool) — so the redirect fires back instantly while the counting happens out of sight.
