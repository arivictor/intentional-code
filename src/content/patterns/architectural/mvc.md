---
title: "MVC / MVP / MVVM"
category: architectural
intent: "Separate presentation logic from business logic by dividing the UI layer into Model (data and rules), View (rendering), and a third layer that mediates between them."
idiomSummary: "In Go web services, Controller = HTTP handler; Model = service/domain layer; View = template or JSON serializer. The handler calls the service, formats the result, and writes the response — it never contains business logic."
relatedSlugs: ["layered", "clean-architecture", "hexagonal"]
tags: [interfaces, separation-of-concerns, testability, dependency-inversion]
recognitionHook: "Your HTTP handler mixes routing, business logic, and response formatting in one function."
---

# MVC / MVP / MVVM

MVC, MVP, and MVVM are three variations on the same core idea: business logic should not live inside the code that renders the UI. They differ in how tightly the view and the mediator are coupled, and who initiates the update cycle. In a Go HTTP service, the distinction between the three collapses somewhat. HTTP handlers are stateless, there's no persistent view object, and no data-binding framework. What remains is the essential principle: handlers coordinate, domain packages decide, templates or serializers render.

## The Three Variants

**MVC (Model-View-Controller):** The Controller receives input, calls the Model (service/domain), and passes data to the View (template or JSON). The View has a reference back to the Model in classic GUI MVC, but in HTTP-based Go this reference disappears. The handler renders the response and the connection closes.

**MVP (Model-View-Presenter):** The Presenter owns all display logic; the View is a dumb interface with no knowledge of the Model. The View calls the Presenter on user events; the Presenter calls the Model and then calls View methods to update the display. This form is most useful in Go when the "View" is an interface you control: a terminal UI, a test double, or a CLI output writer.

**MVVM (Model-View-ViewModel):** The ViewModel exposes observable properties that the View binds to automatically. Popular in frontend frameworks (React, SwiftUI, Kotlin Compose). In Go backend services, this is rarely applicable directly, but the ViewModel concept (a struct shaped specifically for the view's needs, not the domain's) is useful for keeping domain types out of JSON responses.

## Problem

Business logic leaks into HTTP handlers. The handler queries the database directly, applies discount rules, formats output, and returns JSON, all in one function. Adding a CLI client means duplicating the discount logic. Testing the discount logic requires an HTTP test server.

```go
// handler.go — business logic embedded in the handler
func (h *Handler) GetOrder(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    var order Order
    h.db.QueryRow("SELECT * FROM orders WHERE id = $1", id).Scan(
        &order.ID, &order.Total, &order.CustomerID,
    )
    // Business rule embedded in handler
    if order.Total > 1000 {
        order.Total = order.Total * 0.9 // 10% discount
    }
    // Formatting embedded in handler
    json.NewEncoder(w).Encode(map[string]any{
        "id":    order.ID,
        "total": fmt.Sprintf("$%.2f", order.Total),
    })
}
```

## Solution

**MVC in a Go HTTP service:**

```
HTTP Request
     │
     ▼
┌──────────────┐       ┌──────────────────┐
│  Controller  │──────►│  Model (Service) │
│  (Handler)   │       │  business rules  │
└──────┬───────┘       └──────────────────┘
       │
       ▼
┌──────────────┐
│  View        │
│  (Template / │
│  JSON serial)│
└──────────────┘
```

The following is a single runnable file that combines the Model, View, and Controller layers and exercises them with `httptest`:

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
)

// --- Model: pure domain types and business rules, no HTTP ---

type Order struct {
	ID         string
	CustomerID string
	Total      float64
}

// OrderRepository is a stub interface for this example.
type OrderRepository interface {
	Find(ctx context.Context, id string) (Order, error)
}

type OrderService interface {
	GetOrder(ctx context.Context, id string) (Order, error)
}

type orderService struct{ repo OrderRepository }

func (s *orderService) GetOrder(ctx context.Context, id string) (Order, error) {
	order, err := s.repo.Find(ctx, id)
	if err != nil {
		return Order{}, err
	}
	// Business rule: 10% discount on orders over $1000
	if order.Total > 1000 {
		order.Total = order.Total * 0.9
	}
	return order, nil
}

// --- View: a ViewModel shaped for the response ---

type OrderResponse struct {
	ID    string `json:"id"`
	Total string `json:"total"`
}

func orderToResponse(o Order) OrderResponse {
	return OrderResponse{
		ID:    o.ID,
		Total: fmt.Sprintf("$%.2f", o.Total),
	}
}

// --- Controller: coordinates, does not decide ---

type OrderHandler struct {
	orders OrderService
}

func (h *OrderHandler) GetOrder(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	order, err := h.orders.GetOrder(r.Context(), id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(orderToResponse(order))
}

// --- Stub repository ---

type stubOrderRepo struct{}

func (r *stubOrderRepo) Find(_ context.Context, id string) (Order, error) {
	orders := map[string]Order{
		"ord-1": {ID: "ord-1", CustomerID: "cust-1", Total: 1200},
		"ord-2": {ID: "ord-2", CustomerID: "cust-2", Total: 80},
	}
	o, ok := orders[id]
	if !ok {
		return Order{}, fmt.Errorf("order %s not found", id)
	}
	return o, nil
}

func main() {
	svc := &orderService{repo: &stubOrderRepo{}}
	h := &OrderHandler{orders: svc}

	mux := http.NewServeMux()
	mux.HandleFunc("/orders", h.GetOrder)

	// Exercise the handler with httptest — no real server needed.
	for _, id := range []string{"ord-1", "ord-2", "ord-99"} {
		req := httptest.NewRequest(http.MethodGet, "/orders?id="+id, nil)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		fmt.Printf("GET /orders?id=%s → %d %s", id, w.Code, w.Body.String())
	}
}
```

```
// Output:
// GET /orders?id=ord-1 → 200 {"id":"ord-1","total":"$1080.00"}
// GET /orders?id=ord-2 → 200 {"id":"ord-2","total":"$80.00"}
// GET /orders?id=ord-99 → 404 not found
```

**MVP for a CLI or terminal UI** (illustrative, shows the Presenter pattern with a View interface):

```go
// Presenter with a View interface — the View is injected, making the Presenter
// testable without any real I/O. In a real project these would be separate files.

type OrderView interface {
    ShowOrder(id, total string)
    ShowError(msg string)
}

type OrderPresenter struct {
    orders OrderService
    view   OrderView
}

func (p *OrderPresenter) Load(ctx context.Context, id string) {
    order, err := p.orders.GetOrder(ctx, id)
    if err != nil {
        p.view.ShowError("order not found")
        return
    }
    p.view.ShowOrder(order.ID, fmt.Sprintf("$%.2f", order.Total))
}

// In a test, inject a captureView to assert output without printing.
type captureView struct{ id, total, errMsg string }

func (v *captureView) ShowOrder(id, total string) { v.id = id; v.total = total }
func (v *captureView) ShowError(msg string)       { v.errMsg = msg }
```

## When to Use

- **MVC** fits any HTTP service where you want handlers to be thin coordinators and domain logic to be independently testable.
- **MVP** works well when the view is controlled through an interface (CLI, terminal UI, test double) and you need complete isolation of display logic.
- **MVVM** is most relevant when your view layer supports data binding (frontend frameworks, desktop UI); less common in Go backends, but the ViewModel concept (a response DTO shaped for the view) applies everywhere.

## When Not to Use

- A simple CRUD endpoint with no business logic: splitting three layers for a thin wrapper adds indirection without benefit.
- A script or one-shot tool where UI and logic are naturally one function.

## Tradeoffs

The separation makes the service layer independently testable, reusable across delivery mechanisms (HTTP, gRPC, CLI), and easier to reason about. The cost is indirection: more files, more types, more wiring. The ViewModel/response DTO type (the `OrderResponse` above) is often dismissed as boilerplate, but it serves a real purpose. Domain types leak internal structure into the API surface unless something explicitly shapes the output. Avoid "view-aware" leakage in both directions: don't let `http.Request` reach the service layer, and don't let domain types reach the JSON serializer.

## Related Patterns

- **Layered Architecture:** MVC is often implemented as one layer of a broader layered system. The Controller lives in the presentation layer; the Model lives in the service and data layers.
- **Clean Architecture / Hexagonal Architecture:** Both formalize the inward dependency rule that MVC implies: the domain (Model) imports nothing from the outer layers. The HTTP handler is one of many possible adapters.
- **Repository:** The Model's data access layer. The service calls the repository interface; the handler never touches persistence directly.
