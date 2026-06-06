---
title: "Strangler Fig"
description: "Incrementally replace a legacy system by routing some traffic to a new implementation, gradually expanding coverage until the old system can be removed."
---

# Strangler Fig

The Strangler Fig pattern gets its name from a vine that grows around a tree and slowly replaces it. The software version works the same way. You build a new system around the edges of the old one, send some requests to the new code, and leave the rest on the legacy system. Over time, the new system handles more and more, until the old system handles nothing and can be removed.

The important property is that the old and new systems run side by side for a long time. A routing layer sits in front of them and decides where each request goes. Neither system needs to know about that routing decision. As the migration moves forward, the new system covers more paths and the legacy system covers fewer. At the end, the routing layer becomes a simple pass-through to the new system, and the old system is deleted.

This is the practical alternative to a big-bang rewrite. Big-bang rewrites usually fail because the system is too large, too poorly understood, and still changing while you are trying to replace it.

## Scenario

A monolithic Go application handles orders, inventory, and customer accounts in one binary. The team wants to extract the inventory subsystem into a separate service. A full rewrite is too risky: thousands of call sites, no comprehensive test coverage, and the monolith is still receiving feature work.

```go
// monolith/router.go — everything handled by the monolith
func (s *Server) routes() {
    http.HandleFunc("/inventory/", s.inventoryHandler)   // to replace
    http.HandleFunc("/orders/", s.ordersHandler)         // stay for now
    http.HandleFunc("/customers/", s.customerHandler)    // stay for now
}
```

## Solution

Insert a routing layer between callers and the monolith. Route covered paths to the new service; uncovered paths fall through to the legacy system. Expand coverage incrementally.

```
                    ┌─────────────────────┐
                    │   Routing Layer     │
                    │  (proxy / facade)   │
Caller ────────────►│                     │
                    │  /inventory/* ──────┼──► New Inventory Service
                    │                     │
                    │  /orders/*     ──────┼──► Legacy Monolith
                    │  /customers/*  ──────┼──► Legacy Monolith
                    └─────────────────────┘
```

In Go, the routing layer is typically a reverse proxy or an HTTP handler that selectively delegates:

```go
// proxy/router.go
package proxy

import (
    "net/http"
    "net/http/httputil"
    "net/url"
)

type StranglerRouter struct {
    newInventory *httputil.ReverseProxy
    legacy       *httputil.ReverseProxy
}

func NewStranglerRouter(newServiceURL, legacyURL string) *StranglerRouter {
    newURL, _ := url.Parse(newServiceURL)
    legURL, _ := url.Parse(legacyURL)
    return &StranglerRouter{
        newInventory: httputil.NewSingleHostReverseProxy(newURL),
        legacy:       httputil.NewSingleHostReverseProxy(legURL),
    }
}

func (r *StranglerRouter) ServeHTTP(w http.ResponseWriter, req *http.Request) {
    // Covered paths go to the new service
    if strings.HasPrefix(req.URL.Path, "/inventory/") {
        r.newInventory.ServeHTTP(w, req)
        return
    }
    // Everything else falls through to the legacy monolith
    r.legacy.ServeHTTP(w, req)
}
```

When you control both sides, a facade interface makes the transition invisible to callers in the same process:

```go
// facade/inventory.go — callers see one interface; the implementation switches
package facade

type InventoryService interface {
    Reserve(ctx context.Context, itemID string, qty int) error
    Available(ctx context.Context, itemID string) (int, error)
}

type stranglerInventory struct {
    legacy    InventoryService // monolith implementation
    newSvc    InventoryService // new microservice client
    migration *FeatureFlags
}

func (s *stranglerInventory) Reserve(ctx context.Context, itemID string, qty int) error {
    if s.migration.IsEnabled("inventory-new-service") {
        return s.newSvc.Reserve(ctx, itemID, qty)
    }
    return s.legacy.Reserve(ctx, itemID, qty)
}

func (s *stranglerInventory) Available(ctx context.Context, itemID string) (int, error) {
    if s.migration.IsEnabled("inventory-new-service") {
        return s.newSvc.Available(ctx, itemID)
    }
    return s.legacy.Available(ctx, itemID)
}
```

Here's the facade idea as one runnable program — a single interface whose implementation routes to the legacy system or the new service based on a feature flag, with no change to the call site:

```go:title="main.go":run=true:editable=true
package main

import (
	"context"
	"fmt"
)

// One interface; the implementation can switch from legacy to new per-feature.
type InventoryService interface {
	Available(ctx context.Context, itemID string) (int, error)
}

// --- Legacy monolith implementation ---

type legacyInventory struct{}

func (legacyInventory) Available(_ context.Context, itemID string) (int, error) {
	fmt.Printf("legacy: serving %s\n", itemID)
	return 7, nil
}

// --- New service implementation ---

type newInventory struct{}

func (newInventory) Available(_ context.Context, itemID string) (int, error) {
	fmt.Printf("new-service: serving %s\n", itemID)
	return 7, nil
}

// --- Feature flags decide which subsystem handles each path ---

type FeatureFlags struct{ enabled map[string]bool }

func (f *FeatureFlags) IsEnabled(name string) bool { return f.enabled[name] }

// stranglerInventory is the routing facade callers depend on.
type stranglerInventory struct {
	legacy InventoryService
	newSvc InventoryService
	flags  *FeatureFlags
}

func (s *stranglerInventory) Available(ctx context.Context, itemID string) (int, error) {
	if s.flags.IsEnabled("inventory-new-service") {
		return s.newSvc.Available(ctx, itemID)
	}
	return s.legacy.Available(ctx, itemID)
}

func main() {
	ctx := context.Background()
	flags := &FeatureFlags{enabled: map[string]bool{}}
	svc := &stranglerInventory{
		legacy: legacyInventory{},
		newSvc: newInventory{},
		flags:  flags,
	}

	// Flag off — traffic falls through to the legacy monolith.
	qty, _ := svc.Available(ctx, "sku-1")
	fmt.Println("available:", qty)

	// Flip the flag: the same call site now routes to the new service.
	flags.enabled["inventory-new-service"] = true
	qty, _ = svc.Available(ctx, "sku-1")
	fmt.Println("available:", qty)
}
```

```
// Output:
// legacy: serving sku-1
// available: 7
// new-service: serving sku-1
// available: 7
```

The migration proceeds in phases:

```
Phase 1: Route read traffic (/inventory/available) to new service.
         Write traffic still goes to legacy. Shadow writes to new service.

Phase 2: Verified reads. Migrate write traffic (/inventory/reserve).
         Legacy is read-only for inventory. Confirm data consistency.

Phase 3: Legacy inventory code unreachable. Remove legacy routes and code.
         Routing layer becomes direct pass-through.
```

Shadow mode (run both, compare responses, serve from legacy) validates the new service before cutover:

```go
// facade/shadow.go — validate new service without affecting callers
func (s *stranglerInventory) Available(ctx context.Context, itemID string) (int, error) {
    legacyResult, legacyErr := s.legacy.Available(ctx, itemID)

    // Run new service in background; discard result
    go func() {
        newResult, newErr := s.newSvc.Available(ctx, itemID)
        if newErr != legacyErr || newResult != legacyResult {
            s.metrics.Record("inventory.shadow.mismatch", itemID)
        }
    }()

    return legacyResult, legacyErr // callers always see legacy result
}
```

## When to Use

- You need to replace a legacy system without a big-bang rewrite.
- The legacy system is too risky or too large to replace all at once.
- Features in the old system are still being added while migration is in progress.
- You want the option to halt migration and roll back if the new system has problems.

## When Not to Use

- The legacy system is small enough to rewrite and test in one cycle.
- The old and new systems cannot share a data store or synchronize state. The data migration problem is harder than the code migration.
- The routing layer is too expensive to maintain for the expected migration duration.

## Tradeoffs

The biggest benefit is lower risk. If the new service has a bug, you can switch traffic back and let the legacy system handle the request again. You can also verify each subsystem in production before giving it more traffic.

The costs are real. For a while, you are maintaining two implementations at the same time. Keeping data consistent between the old and new systems is a real engineering problem: writes to one side often need to be copied to the other, or the two systems drift apart. The migration also lasts for months, which means the routing layer can quietly become permanent infrastructure if the team does not remove it on purpose. Set a clear deadline for each migration phase. Shadow mode is extremely useful for finding behavior differences before cutover, but it also doubles the load on both systems during that validation period.

## Related Patterns

- **Microservices:** Strangler Fig is the migration path from a monolith to microservices. The pattern manages the transition; Microservices defines the target architecture.
- **Hexagonal Architecture:** The facade that hides legacy vs. new is a port/adapter boundary. Systems built hexagonally are easier to strangle because the swap-out point is explicit from the start.
- **Layered Architecture:** In a layered monolith, the strangler typically targets the outermost layers first (HTTP handlers) and works inward (service logic, then persistence).
