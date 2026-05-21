---
title: "Strangler Fig"
category: architectural
intent: "Incrementally replace a legacy system by routing some traffic to a new implementation, gradually expanding coverage until the old system can be removed."
idiomSummary: "A routing layer (reverse proxy, HTTP middleware, or feature flag) intercepts calls. New paths go to the new implementation; unimplemented paths fall through to the legacy system. Remove the legacy once coverage is complete."
relatedSlugs: ["microservices", "hexagonal", "layered"]
tags: [interfaces, dependency-inversion, migration]
---

# Strangler Fig

The Strangler Fig pattern is named after the tropical vine that grows around a host tree, eventually replacing it entirely. You build a new system around the edges of the old one — routing some calls to the new implementation — until the old system handles nothing and can be removed.

The key property: the old and new systems run simultaneously for an extended period. Traffic is divided at a routing layer that neither system knows about. The new implementation grows to cover more paths; the legacy shrinks. At completion, the routing layer becomes a direct pass-through to the new system, and the old one is deleted.

This is the practical alternative to a big-bang rewrite, which historically fails because the system being replaced is too large, too poorly understood, and too actively changing to replace all at once.

## Problem

A monolithic Go application handles orders, inventory, and customer accounts in one binary. The team wants to extract the inventory subsystem into a separate service. A full rewrite is too risky — thousands of call sites, no comprehensive test coverage, and the monolith is still receiving feature work.

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
- The old and new systems cannot share a data store or synchronize state — the data migration problem is harder than the code migration.
- The routing layer is too expensive to maintain for the expected migration duration.

## Tradeoffs

The main benefit is risk reduction: if the new service has a bug, you flip a flag and legacy handles the traffic again. You can verify each subsystem in production before expanding coverage. The costs are real: you maintain two implementations simultaneously, data consistency across old and new is a genuine engineering challenge (writes to the old system must propagate to the new, or vice versa), and the migration extends over months — the routing layer becomes long-lived infrastructure that teams sometimes forget to remove. Set a firm deadline for each phase. Shadow mode is invaluable for catching behavioral differences before cutover but doubles the load on both systems during validation.

## Related Patterns

- **Microservices** — Strangler Fig is the migration path from a monolith to microservices. The pattern manages the transition; Microservices defines the target architecture.
- **Hexagonal Architecture** — The facade that hides legacy vs. new is a port/adapter boundary. Hexagonal architecture makes the swap-out point explicit from the start, which is why systems built hexagonally are easier to strangle.
- **Layered Architecture** — In a layered monolith, the strangler typically targets the outermost layers first (HTTP handlers) and works inward (service logic, then persistence).
