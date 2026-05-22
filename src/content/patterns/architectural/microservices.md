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

Each service is a standalone Go binary. The following runnable example simulates two services (Order and Inventory) communicating over HTTP using `httptest`:

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"time"
)

// --- Shared event schema (versioned carefully) ---

type Item struct {
	ProductID string `json:"product_id"`
	Qty       int    `json:"qty"`
}

type OrderPlacedEvent struct {
	OrderID    string    `json:"order_id"`
	CustomerID string    `json:"customer_id"`
	Items      []Item    `json:"items"`
	Total      float64   `json:"total"`
	PlacedAt   time.Time `json:"placed_at"`
	Version    int       `json:"version"` // schema version for evolution
}

// --- Inventory Service ---

type ReservationResult struct {
	Reserved bool   `json:"reserved"`
	Reason   string `json:"reason,omitempty"`
}

// inventoryHandler simulates the inventory microservice's HTTP API.
func inventoryHandler(w http.ResponseWriter, r *http.Request) {
	// In a real service this would check and update its own database.
	result := ReservationResult{Reserved: true}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// --- Inventory Client (used by Order Service) ---

// InventoryClient hides network details from the Order Service.
type InventoryClient struct {
	base   string
	client *http.Client
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

// --- Order Service ---

type PlaceOrderRequest struct {
	CustomerID string `json:"customer_id"`
	Items      []Item `json:"items"`
	Total      float64 `json:"total"`
}

type OrderService struct {
	inventory *InventoryClient
	events    []OrderPlacedEvent // in production: publish to NATS/Kafka
}

func (s *OrderService) PlaceOrder(ctx context.Context, req PlaceOrderRequest) (string, error) {
	// Reserve inventory for each item (synchronous cross-service call)
	for _, item := range req.Items {
		result, err := s.inventory.Reserve(ctx, item.ProductID, item.Qty)
		if err != nil {
			return "", fmt.Errorf("reserving %s: %w", item.ProductID, err)
		}
		if !result.Reserved {
			return "", fmt.Errorf("item %s unavailable: %s", item.ProductID, result.Reason)
		}
	}

	orderID := fmt.Sprintf("ord-%d", time.Now().UnixNano())

	// Publish event asynchronously (notification, analytics subscribe independently)
	s.events = append(s.events, OrderPlacedEvent{
		OrderID:    orderID,
		CustomerID: req.CustomerID,
		Items:      req.Items,
		Total:      req.Total,
		PlacedAt:   time.Now(),
		Version:    1,
	})

	return orderID, nil
}

func orderHandler(svc *OrderService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req PlaceOrderRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", 400)
			return
		}
		orderID, err := svc.PlaceOrder(r.Context(), req)
		if err != nil {
			http.Error(w, err.Error(), 422)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"order_id": orderID})
	}
}

func main() {
	// Start the Inventory Service
	invSrv := httptest.NewServer(http.HandlerFunc(inventoryHandler))
	defer invSrv.Close()

	invClient := &InventoryClient{base: invSrv.URL, client: &http.Client{Timeout: 5 * time.Second}}
	orderSvc := &OrderService{inventory: invClient}

	// Start the Order Service
	orderSrv := httptest.NewServer(orderHandler(orderSvc))
	defer orderSrv.Close()

	// Place an order
	body := `{"customer_id":"cust-1","items":[{"product_id":"prod-A","qty":2}],"total":49.99}`
	resp, err := http.Post(orderSrv.URL+"/orders", "application/json", strings.NewReader(body))
	if err != nil {
		fmt.Println("error:", err)
		return
	}
	defer resp.Body.Close()
	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	fmt.Printf("order placed: %s\n", result["order_id"])
	fmt.Printf("events published: %d\n", len(orderSvc.events))
	fmt.Printf("event: orderID=%s customer=%s\n", orderSvc.events[0].OrderID, orderSvc.events[0].CustomerID)
}
```

```
// Output:
// order placed: ord-...
// events published: 1
// event: orderID=ord-... customer=cust-1
```

Service boundaries follow domain boundaries, not technical layers:

```
Good: order-service, inventory-service, payment-service, notification-service
Bad: data-service, api-service, logic-service (technical layers, not domains)
```

Each service has its own database and schema — no shared tables:

```
order-service     → orders_db     (orders, order_items tables)
inventory-service → inventory_db  (products, stock_levels tables)
customer-service  → customers_db  (customers, addresses tables)

// Services NEVER query each other's databases directly.
// Cross-service reads go through the owning service's API.
```

The entry point for a real production service binary (illustrative — requires real infrastructure):

```go
// Illustrative only — shows how a real order-service binary would wire up.
// cmd/order-service/main.go
//
// func main() {
//     repo := postgres.NewOrderRepo(os.Getenv("DATABASE_URL"))
//     publisher := nats.NewPublisher(os.Getenv("NATS_URL"))
//     svc := app.NewOrderService(repo, publisher)
//     http.ListenAndServe(":8080", api.NewRouter(svc))
// }
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
