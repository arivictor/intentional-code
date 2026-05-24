---
title: "Circuit Breaker"
category: architectural
intent: "Prevent cascading failures by wrapping remote calls in a state machine that fails fast when a downstream service is unhealthy and probes for recovery."
idiomSummary: "A CircuitBreaker struct with Closed/Open/HalfOpen states; wraps any func() error call; uses sync/atomic or a mutex for thread-safe state transitions."
relatedSlugs: ["proxy", "decorator"]
tags: [state, concurrency, distributed, performance]
recognitionHook: "One slow downstream service degrades your whole system; errors cascade instead of isolating."
---

# Circuit Breaker

The Circuit Breaker protects a service from cascading failures when a dependency is slow or unavailable. It wraps calls to the dependency in a state machine: **Closed** (calls pass through normally), **Open** (calls fail immediately without hitting the dependency), and **Half-Open** (a probe request tests whether the dependency has recovered). When failures exceed a threshold, the breaker opens and fast-fails all calls until a cooldown period expires.

## Problem

Your service calls an external API to fetch weather data. The API starts timing out. Every request to your service now blocks for 30 seconds waiting for the timeout. Your goroutine pool fills up. Your service becomes unresponsive. Not because of a bug in your code, but because a downstream dependency is slow. The failure cascades up.

```go
// Direct call — a slow dependency blocks the caller
func (s *WeatherService) CurrentTemp(ctx context.Context, city string) (float64, error) {
    // If the upstream API hangs for 30s, this call hangs for 30s.
    // Under load, goroutines pile up waiting and the whole service stalls.
    return s.apiClient.FetchTemp(ctx, city)
}
```

## Solution

Wrap the call in a circuit breaker. The breaker tracks failures and opens after a threshold, fast-failing all requests. After a cooldown, it allows one probe request through. If the probe succeeds, the circuit closes; if it fails, the cooldown resets.

```
            ┌──────────────────────────────────────────────────────────┐
            │                    Circuit Breaker                       │
            │                                                          │
  Request ──►  State?  ──Closed──► call dependency ──success──► return │
            │    │                        │                            │
            │    │                        └──failure count++──────────►│
            │    │                           (threshold exceeded)      │
            │    ├──Open──► return ErrCircuitOpen (fast fail)          │
            │    │          (after cooldown → HalfOpen)                │
            │    │                                                      │
            │    └──HalfOpen──► one probe call ──success──► Closed     │
            │                                   └──failure──► Open     │
            └──────────────────────────────────────────────────────────┘
```

A minimal circuit breaker and weather service, merged into a single runnable file:

```go
package main

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// --- Circuit Breaker ---

var ErrCircuitOpen = errors.New("circuit breaker is open")

type State int

const (
	StateClosed   State = iota // normal operation
	StateOpen                  // fast-failing
	StateHalfOpen              // one probe allowed
)

type Breaker struct {
	mu          sync.Mutex
	state       State
	failures    int
	threshold   int
	cooldown    time.Duration
	lastFailure time.Time
}

func NewBreaker(threshold int, cooldown time.Duration) *Breaker {
	return &Breaker{
		threshold: threshold,
		cooldown:  cooldown,
		state:     StateClosed,
	}
}

func (b *Breaker) Do(fn func() error) error {
	b.mu.Lock()
	switch b.state {
	case StateOpen:
		if time.Since(b.lastFailure) < b.cooldown {
			b.mu.Unlock()
			return ErrCircuitOpen
		}
		// Cooldown expired, allow one probe
		b.state = StateHalfOpen
	}
	b.mu.Unlock()

	err := fn()

	b.mu.Lock()
	defer b.mu.Unlock()

	if err != nil {
		b.failures++
		b.lastFailure = time.Now()
		if b.state == StateHalfOpen || b.failures >= b.threshold {
			b.state = StateOpen
		}
		return err
	}

	// Success
	b.failures = 0
	b.state = StateClosed
	return nil
}

func (b *Breaker) BreakerState() State {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.state
}

// --- Weather Service ---

type TempAPI interface {
	FetchTemp(ctx context.Context, city string) (float64, error)
}

type WeatherService struct {
	api     TempAPI
	breaker *Breaker
}

func NewWeatherService(api TempAPI) *WeatherService {
	return &WeatherService{
		api:     api,
		breaker: NewBreaker(3, 5*time.Second),
	}
}

func (s *WeatherService) CurrentTemp(ctx context.Context, city string) (float64, error) {
	var temp float64
	err := s.breaker.Do(func() error {
		var e error
		temp, e = s.api.FetchTemp(ctx, city)
		return e
	})
	if err != nil {
		if errors.Is(err, ErrCircuitOpen) {
			return 0, fmt.Errorf("weather API unavailable, please retry later")
		}
		return 0, fmt.Errorf("fetching temperature: %w", err)
	}
	return temp, nil
}

// --- Stub API (simulates a failing upstream) ---

type stubAPI struct{ calls int }

func (a *stubAPI) FetchTemp(_ context.Context, city string) (float64, error) {
	a.calls++
	if a.calls <= 4 {
		return 0, fmt.Errorf("upstream timeout")
	}
	return 22.5, nil
}

func main() {
	api := &stubAPI{}
	svc := NewWeatherService(api)
	ctx := context.Background()

	for i := 0; i < 7; i++ {
		temp, err := svc.CurrentTemp(ctx, "London")
		if err != nil {
			fmt.Printf("call %d: error: %v\n", i+1, err)
		} else {
			fmt.Printf("call %d: %.1f°C\n", i+1, temp)
		}
	}
}
```

```
// Output:
// call 1: error: fetching temperature: upstream timeout
// call 2: error: fetching temperature: upstream timeout
// call 3: error: fetching temperature: upstream timeout
// call 4: error: weather API unavailable, please retry later
// call 5: error: weather API unavailable, please retry later
// call 6: error: weather API unavailable, please retry later
// call 7: error: weather API unavailable, please retry later
```

For production use, prefer a well-tested library like `sony/gobreaker`:

```go
// using github.com/sony/gobreaker
import (
    "log"
    "time"
    "github.com/sony/gobreaker"
)

cb := gobreaker.NewCircuitBreaker(gobreaker.Settings{
    Name:        "weather-api",
    MaxRequests: 1,                   // probes in half-open
    Interval:    10 * time.Second,    // counts reset interval
    Timeout:     30 * time.Second,    // open → half-open cooldown
    ReadyToTrip: func(counts gobreaker.Counts) bool {
        return counts.ConsecutiveFailures > 5
    },
    OnStateChange: func(name string, from, to gobreaker.State) {
        log.Printf("circuit %s: %s → %s", name, from, to)
    },
})
```

## When to Use

- You call an external service (third-party API, another microservice) that can be slow or unreliable.
- A slow dependency would otherwise block goroutines and exhaust your thread pool.
- You want fail-fast behavior rather than long timeouts under load.
- You need a way to automatically recover when the dependency comes back online.

## When Not to Use

- The call is to your own database or a dependency that must succeed. Fail-fast is the wrong behavior there, and you probably want retries or a normal error path instead.
- The operation is idempotent and cheap to retry, so a simple retry with backoff may be enough.
- You control both sides (in-process calls, same service). Circuit breakers are for network boundaries.
- The failure mode you're protecting against isn't latency or unavailability. Circuit breakers don't help with data corruption or logic errors.

## Tradeoffs

The breaker adds complexity to what would otherwise be a direct function call, so only apply it at actual network boundaries. Threshold tuning is the persistent pain point: too sensitive and the breaker opens on normal jitter and starts degrading a healthy system; too lenient and it opens too late to stop the goroutine pile-up you were trying to prevent. The half-open state means some requests still fail during recovery, so every caller must handle `ErrCircuitOpen` explicitly. This error path is the one code reviews most often skip. In multi-instance deployments, each instance carries its own breaker state with no shared coordination, so the same upstream can appear "open" to some instances and "closed" to others. When consistent circuit state across all instances is required, consider a Redis-backed shared breaker (store failure counts and state in Redis with atomic increments) or delegate circuit breaking entirely to a service mesh (Istio, Linkerd) that applies it at the network layer, outside your application code, consistent across all pods without any application-level coordination.

## Related Patterns

- **Proxy:** Circuit Breaker is commonly implemented as a Proxy. It wraps a dependency behind the same interface the application already uses, intercepting calls to apply the state machine without changing the call site.
- **Decorator:** An alternative implementation strategy. If the dependency interface is simple, a decorator that adds breaker behavior to any `func() error` is lighter than a full proxy struct.
- **Event-Driven Architecture:** When a circuit opens, route events to a dead-letter queue instead of dropping them, then replay them once the circuit closes. The async nature of event-driven systems makes them more tolerant of short open periods.
- **Hexagonal Architecture:** Put the circuit breaker inside the driven adapter (the infrastructure layer), not in the application core. The application calls the port interface without caring that a breaker is operating underneath.
- **Layered Architecture:** The circuit breaker belongs in the Infrastructure layer. Service layer code calls repository interfaces normally, and the infrastructure implementation wraps outbound network calls in the breaker.
