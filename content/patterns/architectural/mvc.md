---
title: "MVC / MVP / MVVM"
description: "Separate presentation logic from business logic by dividing the UI layer into Model (data and rules), View (rendering), and a third layer that mediates between them."
---

# MVC / MVP / MVVM

MVC, MVP, and MVVM are all ways to keep presentation code separate from business logic. That matters in Go too, but usually in a translated form. Most Go developers do not describe their services as strict MVC apps. They talk about handlers, services, domain packages, templates, and response DTOs. Still, the underlying idea is the same: request handling should coordinate, business logic should decide, and rendering should stay separate.

For a Go web service, MVC is the most natural fit of the three. MVP is useful in CLI or terminal-style applications where the view is an interface you control. MVVM is the least direct fit for Go backends, because it depends on data-binding concepts that most Go server code does not use. What *is* useful in Go is the ViewModel idea: shape data for the view instead of exposing domain types directly.

## The Three Variants

**MVC (Model-View-Controller):** The Controller receives input, calls the Model (usually a service or domain package), and passes data to the View (template or JSON response). In a Go HTTP service, the Controller is usually the handler. Classic GUI MVC has a longer-lived relationship between View and Model, but that usually disappears in request/response server code. The handler runs, renders the response, and the request ends.

**MVP (Model-View-Presenter):** The Presenter owns presentation logic, and the View is a simple interface with no business knowledge. The View forwards user actions to the Presenter. The Presenter calls the Model, then tells the View what to display. In Go, this is most useful when the view is something you control directly: a CLI, terminal UI, or a test double that captures output.

**MVVM (Model-View-ViewModel):** The ViewModel exposes view-shaped data, often with observable properties for automatic UI updates. This pattern is common in desktop and frontend frameworks with data binding. In Go backend services, that full pattern rarely applies directly. The useful part is narrower: a ViewModel can be a response struct shaped for JSON or templates, so your domain model does not leak straight into the API surface.

## Scenario

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

```go:title="main.go":run=true:editable=true
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

- **MVC** fits Go HTTP services where you want handlers to stay thin and business logic to remain independently testable.
- **MVP** works well when the view is controlled through an interface, such as a CLI, terminal UI, or test double, and you want presentation logic isolated from I/O.
- **MVVM** is mainly relevant when the view layer supports data binding, which is uncommon in Go backend work. In Go services, the useful part is usually just the ViewModel idea: shape response data for the view instead of returning domain types directly.

## When Not to Use

- A simple CRUD endpoint with no business logic: splitting three layers for a thin wrapper adds indirection without benefit.
- A script or one-shot tool where UI and logic are naturally one function.

## The Decision

The separation makes the service layer independently testable, reusable across delivery mechanisms such as HTTP, gRPC, or CLI, and easier to reason about. The cost is indirection: more files, more types, and more wiring. The ViewModel or response DTO type (the `OrderResponse` above) often looks like boilerplate, but it solves a real problem. Without it, domain types tend to leak internal structure into the API. Avoid leakage in both directions: do not let `http.Request` reach the service layer, and do not let raw domain types fall straight through to the JSON serializer unless that is an intentional API design choice.

## Related Patterns

- **Layered Architecture:** MVC is often implemented as one layer of a broader layered system. The Controller lives in the presentation layer; the Model lives in the service and data layers.
- **Clean Architecture / Hexagonal Architecture:** Both formalize the inward dependency rule that MVC implies: the domain (Model) imports nothing from the outer layers. The HTTP handler is one of many possible adapters.
- **Repository:** The Model's data access layer. The service calls the repository interface; the handler never touches persistence directly.
