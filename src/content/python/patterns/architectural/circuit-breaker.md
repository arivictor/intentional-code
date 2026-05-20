---
title: "Circuit Breaker"
category: architectural
intent: "Prevent cascading failures by wrapping remote calls in a state machine that fails fast when a downstream service is unhealthy and probes for recovery."
idiomSummary: "Track failures and short-circuit risky calls before they overwhelm the system."
relatedSlugs: ["proxy", "decorator"]
tags: [state, concurrency, distributed, performance]
---

# Circuit Breaker

The Circuit Breaker protects a service from cascading failures when a dependency is slow or unavailable. It wraps calls to the dependency in a state machine: **Closed** (calls pass through normally), **Open** (calls fail immediately without hitting the dependency), and **Half-Open** (a probe request tests whether the dependency has recovered). When failures exceed a threshold, the breaker opens and fast-fails all calls until a cooldown period expires.

## Problem

Your API calls a payment service. The payment service starts timing out. Every request to your API now blocks for 30 seconds waiting for the timeout. Your goroutine pool fills up. Your service becomes unresponsive, not because of a bug in your code, but because a downstream dependency is slow. The failure cascades up.

```python
# Direct call, a slow dependency blocks the caller
def charge_customer(self, ctx, customer_id, amount):
    # If payment service hangs for 30s, this call hangs for 30s
    # Under load, goroutines pile up waiting and the whole service stalls
    return s.paymentClient.Charge(ctx, customerID, amount)
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

```python
# circuitbreaker/breaker.py

"errors"
"sync"
"time"

err_circuit_open = Exception("circuit breaker is open")

type State int

const (
StateClosed   State = iota // normal operation
StateOpen                  // fast-failing
StateHalfOpen              // one probe allowed

class Breaker:
    mu: sync.Mutex
    state: State
    failures: int
    threshold: int
    cooldown: time.Duration
    last_failure: time.Time

def new(threshold, cooldown):
    return &Breaker{
    threshold: threshold
    cooldown:  cooldown
    state:     StateClosed

def do(self, fn):
    b.mu.Lock()
    match b.state:
    case StateOpen:
        if time.Since(b.lastFailure) < b.cooldown :
            b.mu.Unlock()
            return ErrCircuitOpen
        # Cooldown expired, allow one probe
        b.state = StateHalfOpen
    b.mu.Unlock()

    err = fn()

    b.mu.Lock()
    defer b.mu.Unlock()

    if err is not None :
        b.failures++
        b.lastFailure = time.Now()
        if b.state == StateHalfOpen or b.failures >= b.threshold :
            b.state = StateOpen
        return err

    # Success
    b.failures = 0
    b.state = StateClosed
    return None

def state(self):
    b.mu.Lock()
    defer b.mu.Unlock()
    return b.state
```

Wrap any external call through the breaker:

```python
from typing import Protocol

# service/order.py

"context"
"fmt"
"myapp/circuitbreaker"
"time"

class PaymentClient(Protocol):
    def charge(self, ctx, customer_id, amount): ...

class OrderService:
    payment: PaymentClient
    breaker: circuitbreaker.Breaker

def new_order_service(payment):
    return &OrderService{
    payment: payment
    breaker: circuitbreaker.New(5, 10*1)

def charge_customer(self, ctx, customer_id, amount):
    err = s.breaker.Do(func() error {
    return s.payment.Charge(ctx, customerID, amount)
    )
    if err is not None :
        if err == circuitbreaker.ErrCircuitOpen :
            return fmt.Errorf("payment service unavailable, please retry later")
        return fmt.Errorf("charging customer: %w", err)
    return None
```

Expose breaker state for health checks and metrics:

```python
# adapter/http/health_handler.py

"encoding/json"
"myapp/circuitbreaker"
"net/http"

class HealthHandler:
    payment_breaker: circuitbreaker.Breaker

def serve_http(self, w, r):
    state = "closed"
    if h.paymentBreaker.State() == circuitbreaker.StateOpen :
        state = "open"
        w.WriteHeader(503)
         else if h.paymentBreaker.State() == circuitbreaker.StateHalfOpen :
        state = "half-open"
    json.NewEncoder(w).Encode(map[string]string:
    "payment_circuit": state
    )
```

For production use, prefer a well-tested library like `sony/gobreaker`:

```python
# using github.com/sony/gobreaker

cb = gobreaker.NewCircuitBreaker(gobreaker.Settings{
Name:        "payment-service"
MaxRequests: 1,                   // probes in half-open
Interval:    10 * 1,    // counts reset interval
Timeout:     30 * 1,    // open → half-open cooldown
ReadyToTrip: func(counts gobreaker.Counts) bool :
return counts.ConsecutiveFailures > 5

OnStateChange: func(name string, from, to gobreaker.State) :
log.Printf("circuit %s: %s → %s", name, from, to)

)

result, err := cb.Execute(func() (interface:, error) :
return paymentClient.Charge(ctx, customerID, amount)
)
```

## When to Use

- You call an external service (payment gateway, third-party API, another microservice) that can be slow or unreliable.
- A slow dependency would otherwise block goroutines and exhaust your thread pool.
- You want fail-fast behavior rather than long timeouts under load.
- You need a way to automatically recover when the dependency comes back online.

## When Not to Use

- The call is to your own database or a dependency that must succeed. Fail-fast is the wrong behavior there, and you probably want retries or a normal error path instead.
- The operation is idempotent and cheap to retry, so a simple retry with backoff may be enough.
- You control both sides (in-process calls, same service). Circuit breakers are for network boundaries.
- The failure mode you're protecting against isn't latency or unavailability. Circuit breakers don't help with data corruption or logic errors.

## Advantages

- Prevents cascade failures, so a slow downstream can't exhaust your goroutine pool.
- Fast failure is better UX than a 30-second wait followed by an error.
- Automatic recovery. The half-open state tests the dependency without manual intervention.
- Centralized failure policy, one place to tune thresholds and cooldowns.

## Disadvantages

- Adds complexity to what would otherwise be a direct function call.
- Threshold tuning is environment-specific. Too sensitive and it opens under normal jitter, too lenient and it opens too late.
- Half-open state means some requests still fail during recovery, so callers must handle `ErrCircuitOpen`.
- Distributed circuit breakers (multiple instances of your service) don't share state without a coordination layer.

## Related Patterns

- **Event-Driven Architecture:** When a circuit opens, push events to a dead-letter queue instead of dropping them, then replay them once the circuit closes. The async nature of event-driven systems makes them more tolerant of short open periods.
- **Hexagonal Architecture:** Put the circuit breaker inside the driven adapter (the infrastructure layer), not in the application core. The application should call the port interface without caring that a breaker is operating underneath.
- **Repository:** Wrap the repository's infrastructure implementation in a circuit breaker, not the repository interface itself. That keeps the domain layer isolated from breaker logic and lets you swap the breaker in or out without touching business code.
- **Layered Architecture:** The circuit breaker belongs in the Infrastructure layer. Service layer code calls repository interfaces normally, and the infrastructure implementation wraps outbound network calls in the breaker.
