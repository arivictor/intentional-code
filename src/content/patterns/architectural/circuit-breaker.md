# Circuit Breaker

The Circuit Breaker protects a service from cascading failures when a dependency is slow or unavailable. It wraps calls to the dependency in a state machine: **Closed** (calls pass through normally), **Open** (calls fail immediately without hitting the dependency), and **Half-Open** (a probe request tests whether the dependency has recovered). When failures exceed a threshold, the breaker opens and fast-fails all calls until a cooldown period expires.

## Problem

Your API calls a payment service. The payment service starts timing out. Every request to your API now blocks for 30 seconds waiting for the timeout. Your goroutine pool fills up. Your service becomes unresponsive — not because of a bug in your code, but because a downstream dependency is slow. The failure cascades up.

```go
// Direct call — a slow dependency blocks the caller
func (s *OrderService) ChargeCustomer(ctx context.Context, customerID string, amount int64) error {
    // If payment service hangs for 30s, this call hangs for 30s
    // Under load, goroutines pile up waiting — the whole service stalls
    return s.paymentClient.Charge(ctx, customerID, amount)
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

A minimal circuit breaker implementation:

```go
// circuitbreaker/breaker.go
package circuitbreaker

import (
    "errors"
    "sync"
    "time"
)

var ErrCircuitOpen = errors.New("circuit breaker is open")

type State int

const (
    StateClosed   State = iota // normal operation
    StateOpen                  // fast-failing
    StateHalfOpen              // one probe allowed
)

type Breaker struct {
    mu           sync.Mutex
    state        State
    failures     int
    threshold    int
    cooldown     time.Duration
    lastFailure  time.Time
}

func New(threshold int, cooldown time.Duration) *Breaker {
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
        // Cooldown expired — allow one probe
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

func (b *Breaker) State() State {
    b.mu.Lock()
    defer b.mu.Unlock()
    return b.state
}
```

Wrap any external call through the breaker:

```go
// service/order.go
package service

import (
    "context"
    "fmt"
    "myapp/circuitbreaker"
    "time"
)

type PaymentClient interface {
    Charge(ctx context.Context, customerID string, amount int64) error
}

type OrderService struct {
    payment PaymentClient
    breaker *circuitbreaker.Breaker
}

func NewOrderService(payment PaymentClient) *OrderService {
    return &OrderService{
        payment: payment,
        breaker: circuitbreaker.New(5, 10*time.Second),
    }
}

func (s *OrderService) ChargeCustomer(ctx context.Context, customerID string, amount int64) error {
    err := s.breaker.Do(func() error {
        return s.payment.Charge(ctx, customerID, amount)
    })
    if err != nil {
        if err == circuitbreaker.ErrCircuitOpen {
            return fmt.Errorf("payment service unavailable, please retry later")
        }
        return fmt.Errorf("charging customer: %w", err)
    }
    return nil
}
```

Expose breaker state for health checks and metrics:

```go
// adapter/http/health_handler.go
package httpadapter

import (
    "encoding/json"
    "myapp/circuitbreaker"
    "net/http"
)

type HealthHandler struct {
    paymentBreaker *circuitbreaker.Breaker
}

func (h *HealthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    state := "closed"
    if h.paymentBreaker.State() == circuitbreaker.StateOpen {
        state = "open"
        w.WriteHeader(503)
    } else if h.paymentBreaker.State() == circuitbreaker.StateHalfOpen {
        state = "half-open"
    }
    json.NewEncoder(w).Encode(map[string]string{
        "payment_circuit": state,
    })
}
```

For production use, prefer a well-tested library like `sony/gobreaker`:

```go
// using github.com/sony/gobreaker
import "github.com/sony/gobreaker"

cb := gobreaker.NewCircuitBreaker(gobreaker.Settings{
    Name:        "payment-service",
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

result, err := cb.Execute(func() (interface{}, error) {
    return paymentClient.Charge(ctx, customerID, amount)
})
```

## When to Use

- You call an external service (payment gateway, third-party API, another microservice) that can be slow or unreliable.
- A slow dependency would otherwise block goroutines and exhaust your thread pool.
- You want fail-fast behaviour rather than long timeouts under load.
- You need a way to automatically recover when the dependency comes back online.

## When Not to Use

- The call is to your own database or a dependency that must succeed — fail fast is not the right behaviour, you want retries or errors.
- The operation is idempotent and cheap to retry — a simple retry with backoff may be sufficient.
- You control both sides (in-process calls, same service). Circuit breakers are for network boundaries.
- The failure mode you're protecting against isn't latency or unavailability — circuit breakers don't help with data corruption or logic errors.

## Advantages

- Prevents cascade failures — a slow downstream can't exhaust your goroutine pool.
- Fast failure is better UX than a 30-second wait followed by an error.
- Automatic recovery — the half-open state tests the dependency without manual intervention.
- Centralised failure policy — one place to tune thresholds and cooldowns.

## Disadvantages

- Adds complexity to what would otherwise be a direct function call.
- Threshold tuning is environment-specific — too sensitive opens under normal jitter, too lenient opens too late.
- Half-open state means some requests still fail during recovery — callers must handle `ErrCircuitOpen`.
- Distributed circuit breakers (multiple instances of your service) don't share state without a coordination layer.

## Related Patterns

- **Event-Driven Architecture** — Use a dead-letter queue when a circuit opens rather than dropping events entirely.
- **Hexagonal Architecture** — The circuit breaker wraps a driven adapter (external API client); the application core is unaware of it.
- **Repository** — Circuit breakers can wrap repository calls to external datastores, protecting the application from slow queries.
- **Layered Architecture** — Place the circuit breaker in the Infrastructure layer — the Service layer calls the repository interface, the infrastructure implementation wraps it in the breaker.
