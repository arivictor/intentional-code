---
title: "MVC / MVP / MVVM"
category: architectural
intent: "Separate presentation logic from business logic by dividing the UI layer into Model (data and rules), View (rendering), and a third layer that mediates between them."
idiomSummary: "In Go web services, Controller = HTTP handler; Model = service/domain layer; View = template or JSON serializer. The handler calls the service, formats the result, and writes the response — it never contains business logic."
relatedSlugs: ["layered", "clean-architecture", "hexagonal"]
tags: [interfaces, separation-of-concerns, testability, dependency-inversion]
---

# MVC / MVP / MVVM

MVC, MVP, and MVVM are three variations on the same core idea: business logic should not live inside the code that renders the UI. They differ in how tightly the view and the mediator are coupled and who initiates the update cycle. In a Go HTTP service, the distinction between the three collapses somewhat — HTTP handlers are stateless, there's no persistent view object, and no data-binding framework. What remains is the essential principle: handlers coordinate, domain packages decide, templates or serializers render.

## The Three Variants

**MVC (Model-View-Controller):** The Controller receives input, calls the Model (service/domain), and passes data to the View (template or JSON). The View has a reference back to the Model in classic GUI MVC, but in HTTP-based Go this reference disappears — the handler renders the response and the connection closes.

**MVP (Model-View-Presenter):** The Presenter owns all display logic; the View is a dumb interface with no knowledge of the Model. The View calls the Presenter on user events; the Presenter calls the Model and then calls View methods to update the display. This is the form most useful in Go when the "View" is an interface you control — a terminal UI, a test double, or a CLI output writer.

**MVVM (Model-View-ViewModel):** The ViewModel exposes observable properties that the View binds to automatically. Popular in frontend frameworks (React, SwiftUI, Kotlin Compose). In Go backend services, this is rarely applicable directly, but the ViewModel concept — a struct shaped specifically for the view's needs, not the domain's — is useful for keeping domain types out of JSON responses.

## Problem

Business logic leaks into HTTP handlers. The handler queries the database directly, applies discount rules, formats output, and returns JSON — all in one function. Adding a CLI client means duplicating the discount logic. Testing the discount logic requires an HTTP test server.

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

```go
// domain/order.go — Model: pure business logic, no HTTP
package domain

type Order struct {
    ID         string
    CustomerID string
    Total      float64
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
    if order.Total > 1000 {
        order.Total = order.Total * 0.9
    }
    return order, nil
}
```

```go
// api/order_view.go — View: a ViewModel shaped for the response
package api

type OrderResponse struct {
    ID    string `json:"id"`
    Total string `json:"total"`
}

func orderToResponse(o domain.Order) OrderResponse {
    return OrderResponse{
        ID:    o.ID,
        Total: fmt.Sprintf("$%.2f", o.Total),
    }
}
```

```go
// api/order_handler.go — Controller: coordinates, does not decide
package api

type OrderHandler struct {
    orders domain.OrderService
}

func (h *OrderHandler) GetOrder(w http.ResponseWriter, r *http.Request) {
    order, err := h.orders.GetOrder(r.Context(), r.PathValue("id"))
    if err != nil {
        http.Error(w, "not found", http.StatusNotFound)
        return
    }
    json.NewEncoder(w).Encode(orderToResponse(order))
}
```

**MVP for a CLI or terminal UI:**

```go
// presenter/order.go — Presenter with a View interface
package presenter

import "myapp/domain"

type OrderView interface {
    ShowOrder(id, total string)
    ShowError(msg string)
}

type OrderPresenter struct {
    orders domain.OrderService
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
```

The `OrderView` interface makes the Presenter testable without any I/O:

```go
// presenter/order_test.go
type captureView struct{ id, total, errMsg string }

func (v *captureView) ShowOrder(id, total string) { v.id = id; v.total = total }
func (v *captureView) ShowError(msg string)       { v.errMsg = msg }

func TestPresenterAppliesDiscount(t *testing.T) {
    view := &captureView{}
    p := &OrderPresenter{orders: fakeService{total: 1200}, view: view}
    p.Load(context.Background(), "ord-1")
    if view.total != "$1080.00" {
        t.Fatalf("got %s", view.total)
    }
}
```

## When to Use

- **MVC** — any HTTP service where you want handlers to be thin coordinators and the domain logic to be independently testable.
- **MVP** — when the view is controlled through an interface (CLI, terminal UI, test double) and you need complete isolation of display logic.
- **MVVM** — when your view layer has data-binding capabilities (frontend frameworks, desktop UI); less common in Go backends but the ViewModel concept (response DTO shaped for the view) applies everywhere.

## When Not to Use

- A simple CRUD endpoint with no business logic — splitting three layers for a thin wrapper adds indirection without benefit.
- A script or one-shot tool where UI and logic are naturally one function.

## Tradeoffs

The separation makes the service layer independently testable, reusable across delivery mechanisms (HTTP, gRPC, CLI), and easier to reason about. The cost is indirection: more files, more types, more wiring. The ViewModel/response DTO type (the `OrderResponse` above) is often dismissed as boilerplate, but it serves a real purpose — domain types leak internal structure into the API surface unless something explicitly shapes the output. Avoid "view-aware" leakage in both directions: don't let `http.Request` reach the service layer, and don't let domain types reach the JSON serializer.

## Related Patterns

- **Layered Architecture** — MVC is often implemented as one layer of a broader layered system. The Controller lives in the presentation layer, the Model in the service and data layers.
- **Clean Architecture / Hexagonal Architecture** — Both formalize the inward dependency rule that MVC implies: the domain (Model) imports nothing from the outer layers. The HTTP handler is one of many possible adapters.
- **Repository** — The Model's data access layer. The service calls the repository interface; the handler never touches persistence directly.
