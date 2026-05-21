---
title: "Microservices"
category: architectural
intent: "Structure an application as a collection of small, independently deployable services, each owning its own data and communicating over well-defined APIs."
idiomSummary: "Each service is a separate Go binary with its own go.mod, database schema, and deployment unit. Services communicate via HTTP/gRPC or message queues. Start with a well-structured monolith; extract services when independent scalability or deployment becomes a genuine constraint."
relatedSlugs: ["event-driven", "saga", "strangler-fig", "hexagonal", "circuit-breaker"]
tags: [distributed, interfaces, separation-of-concerns, dependency-inversion]
---

# Microservices

Microservices is an architectural style in which an application is built as a collection of small, independently deployable services. Each service owns a single bounded domain, runs as a separate process, manages its own data store, and communicates with other services over a network API. Services are deployed, scaled, and failed independently.

The promise of microservices is organizational as much as technical: teams can own, release, and scale their service without coordinating with other teams. The cost is the distributed systems tax — network calls fail, services become unavailable, data is eventually consistent across service boundaries, and debugging a request that spans five services requires distributed tracing infrastructure.

**Start with a monolith.** Extract services when independent scaling or deployment becomes a real constraint, not a hypothetical one. A monolith built with clean internal boundaries (hexagonal architecture, domain packages) is much easier to decompose than one that isn't.

## Problem

A growing e-commerce application lives in one binary. The checkout service is CPU-intensive during flash sales, but scaling the whole binary for one hot path means scaling the unrelated inventory and customer services too. The mobile team deploys 20 times per day; the payments team needs a two-week audit review before any release. In a monolith, the mobile team's rapid deploys and the payments team's review cycle must use the same release pipeline.

## Solution

Extract independent domains into separate services with explicit API boundaries:

```
                        ┌──────────────────┐
                        │  API Gateway     │
                        │  (routing, auth) │
                        └───────┬──────────┘
                                │
          ┌─────────────────────┼──────────────────────┐
          │                     │                      │
          ▼                     ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Order Service   │  │ Inventory Service│  │ Customer Service │
│  (Go binary)     │  │  (Go binary)     │  │  (Go binary)     │
│  orders_db       │  │  inventory_db    │  │  customers_db    │
└──────────────────┘  └──────────────────┘  └──────────────────┘
          │
          │ publishes events
          ▼
┌──────────────────┐
│  Message Broker  │
│  (NATS / Kafka)  │
└──────────────────┘
          │
          ├──► Notification Service
          └──► Analytics Service
```

Each service is a standalone Go binary:

```go
// cmd/order-service/main.go
package main

import (
    "myapp/internal/orderservice/app"
    "myapp/internal/orderservice/infra/postgres"
    "myapp/internal/orderservice/infra/nats"
)

func main() {
    repo := postgres.NewOrderRepo(os.Getenv("DATABASE_URL"))
    publisher := nats.NewPublisher(os.Getenv("NATS_URL"))
    svc := app.NewOrderService(repo, publisher)

    srv := &http.Server{
        Addr:    ":8080",
        Handler: api.NewRouter(svc),
    }
    srv.ListenAndServe()
}
```

Services communicate synchronously via gRPC or HTTP for request/response:

```go
// clients/inventory_client.go — typed client hides network details
package clients

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
)

type InventoryClient struct {
    base   string
    client *http.Client
}

type ReservationResult struct {
    Reserved bool
    Reason   string
}

func (c *InventoryClient) Reserve(ctx context.Context, itemID string, qty int) (ReservationResult, error) {
    url := fmt.Sprintf("%s/inventory/%s/reserve?qty=%d", c.base, itemID, qty)
    req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
    resp, err := c.client.Do(req)
    if err != nil {
        return ReservationResult{}, fmt.Errorf("inventory reserve: %w", err)
    }
    defer resp.Body.Close()
    var result ReservationResult
    json.NewDecoder(resp.Body).Decode(&result)
    return result, nil
}
```

And asynchronously via events for work that doesn't require an immediate response:

```go
// events/order_events.go — shared event schema (versioned carefully)
package events

const OrderPlaced = "order.placed"

type OrderPlacedEvent struct {
    OrderID    string    `json:"order_id"`
    CustomerID string    `json:"customer_id"`
    Items      []Item    `json:"items"`
    Total      float64   `json:"total"`
    PlacedAt   time.Time `json:"placed_at"`
    Version    int       `json:"version"` // schema version for evolution
}
```

Service boundaries follow domain boundaries, not technical layers:

```
Good: order-service, inventory-service, payment-service, notification-service
Bad: data-service, api-service, logic-service (technical layers, not domains)
```

Each service has its own database and schema — no shared tables:

```
order-service  → orders_db  (orders, order_items tables)
inventory-service → inventory_db (products, stock_levels tables)
customer-service → customers_db (customers, addresses tables)

// Services NEVER query each other's databases directly.
// Cross-service reads go through the owning service's API.
```

## Service Discovery and API Versioning

**Service Discovery**

Services need to locate each other at runtime. Two approaches:

- **Client-side discovery**: the client resolves a DNS name or queries a registry (Consul, etcd) to get healthy addresses and picks one. The client is responsible for load balancing.
- **Server-side discovery**: an API gateway or service mesh (Istio, Linkerd) intercepts calls and routes to healthy instances transparently. The application code uses a stable DNS name; the infrastructure handles routing and load balancing.

With a service mesh, the `InventoryClient` uses a DNS name the mesh resolves to a healthy pod:

```go
// No client-side load balancing needed — the mesh handles it.
func NewInventoryClient() *InventoryClient {
    return &InventoryClient{
        base:   os.Getenv("INVENTORY_SERVICE_URL"), // e.g., "http://inventory-service:8080"
        client: &http.Client{Timeout: 5 * time.Second},
    }
}
```

**API Versioning**

Services evolve independently; their APIs must change without breaking existing consumers. Two common strategies:

- **URL versioning** (`/v1/inventory/reserve`): visible, explicit, easy to route and test. Recommended for public or external APIs.
- **Header versioning** (`Accept: application/vnd.myapp.v2+json`): cleaner URLs but harder to test and cache. Better for internal APIs where all clients are controlled.

```go
// URL versioning — version is part of the route path
http.HandleFunc("/v1/inventory/reserve", v1ReserveHandler)
http.HandleFunc("/v2/inventory/reserve", v2ReserveHandler)
```

For event schemas, the `Version` field enables consumers to handle old and new shapes simultaneously. Schema evolution rules: add fields additively (never remove or rename existing fields), use pointer types for optional new fields (`*string`) so producers that omit the field don't break consumers that expect it, and bump `Version` when a structural change is unavoidable:

```go
type OrderPlacedEvent struct {
    Version     int       `json:"version"`    // bump for breaking changes
    OrderID     string    `json:"order_id"`
    CustomerID  string    `json:"customer_id"`
    Items       []Item    `json:"items"`
    Total       float64   `json:"total"`
    PlacedAt    time.Time `json:"placed_at"`
    PromotionID *string   `json:"promotion_id,omitempty"` // added in v2; old producers omit it
}
```

## When to Use

- Teams need to deploy independently, and a shared release pipeline creates real organizational bottlenecks.
- One domain has radically different scaling requirements than others (a recommendation engine vs. a customer settings page).
- Different parts of the system have different reliability, compliance, or security requirements.
- The domain is well-understood and boundaries are stable — extracting a service before the domain is understood leads to wrong boundaries that are expensive to fix later.

## When Not to Use

- The team is small (fewer than ~8 people). Conway's Law works against microservices at small team sizes; a monolith with clean internal structure will outperform it.
- The domain is not yet well-understood. Wrong service boundaries are nearly as expensive as a distributed monolith.
- You don't have the infrastructure for distributed tracing, centralized logging, and service discovery. Without these, debugging becomes guesswork.
- The application is simple. Microservices add a distributed systems tax upfront; if the application doesn't need it, you're paying the tax for nothing.

## Tradeoffs

Independent deployment and scaling are genuine advantages. Teams that own a service end-to-end — design, build, operate — move faster than teams that share a monolith with complex coordination overhead. The distributed systems tax is real: every network call can fail, timeout, or return stale data; services need circuit breakers; cross-service operations need sagas instead of transactions; data consistency is eventual across service boundaries. The operational floor is higher: you need container orchestration, service discovery, distributed tracing, centralized logging, and health-check infrastructure from day one. These tools are mature now (Kubernetes, Jaeger, OpenTelemetry), but they add cognitive load. Teams that succeed with microservices usually have strong platform engineering support; teams without it often end up with a distributed monolith — all the complexity of microservices with none of the isolation benefits.

## Related Patterns

- **Event-Driven Architecture** — Services communicate asynchronously via events. A failing consumer can't block the producer, and new consumers can subscribe without changing the producer.
- **Saga** — Multi-step operations that span services need sagas instead of distributed transactions. Choreography or orchestration; both require idempotent compensating transactions.
- **Circuit Breaker** — Wrap every synchronous service call in a circuit breaker. When the downstream service is slow or unavailable, fail fast rather than letting goroutines pile up.
- **Strangler Fig** — The migration path from monolith to microservices. Route covered paths to the new service; uncovered paths fall through to the monolith. Remove the monolith incrementally.
- **Hexagonal Architecture** — Apply hexagonal architecture inside each microservice to keep the domain logic isolated from network and database adapters. This makes individual services testable and their infrastructure swappable.
