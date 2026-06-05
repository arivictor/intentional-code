---
title: Law of Demeter
description: Talk only to your immediate collaborators. The further you reach into another object's internals, the more you couple yourself to its structure.
---

# Law of Demeter

*"Each unit should have only limited knowledge about other units: only units 'closely' related to the current unit."*

The Law of Demeter, also called the Principle of Least Knowledge, says a method should only call methods on:

1. Itself
2. Its parameters
3. Objects it creates directly
4. Its own fields

It should not reach through objects to call methods on *their* collaborators. Each dot in a chain like `order.Customer().Address().City()` is a dependency on the internal structure of an object you don't own. If that structure changes, you break.

The informal version: **don't talk to strangers**.

---

## The violation: method chaining through ownership

```go
// BAD — the handler knows too much about the internal structure of Order.
// If Order.customer changes from a Customer to a CustomerID,
// this handler must change too.

func (h *Handler) ShipOrder(w http.ResponseWriter, r *http.Request) {
    order := h.store.Find(r.URL.Query().Get("id"))

    // Three levels deep — reaching through Order into Customer into Address
    city := order.Customer().Address().City()

    rate := h.shipping.QuoteFor(city)
    // ...
}
```

```go
// GOOD — Order exposes what callers need, hiding its internal structure.
// The handler asks Order for a shipping destination; it doesn't care
// how Order derives that information.

type Order struct {
    customer Customer
}

func (o Order) ShippingDestination() string {
    return o.customer.Address().City()
}

func (h *Handler) ShipOrder(w http.ResponseWriter, r *http.Request) {
    order := h.store.Find(r.URL.Query().Get("id"))
    rate := h.shipping.QuoteFor(order.ShippingDestination())
    // ...
}
```

The navigation from `Order` to city is encapsulated in `Order.ShippingDestination`. The handler's dependency is on `Order`'s interface, not on `Customer` or `Address`.

---

## Detecting violations: count the dots

A single dot is usually fine. Two dots is a yellow flag. Three or more is almost always a violation.

```go
// One dot — fine.
user.Name

// Two dots — possibly fine if the middle type is a value type.
response.Body.Close()

// Three dots — violation. You're navigating through someone else's structure.
app.Config().Database().ConnectionString()
```

The exception: fluent builder patterns are sometimes intentionally chained, like `strings.NewReplacer(...).Replace(s)`. These return `self` at each step rather than reaching into collaborators' internals. That's different from traversing an ownership graph.

---

## Tell, don't ask

The Law of Demeter is related to "Tell, Don't Ask": rather than asking an object for data to make a decision, tell it to make the decision itself.

```go
// ASK — caller fetches data, makes a decision externally.
if order.Status() == "pending" && order.Total() > 10000 {
    order.ApplyDiscount(500)
}

// TELL — caller tells Order to apply its own discount rule.
// Order owns the decision about when it qualifies.
order.ApplyLargeOrderDiscount()
```

```go
// Implementation:
func (o *Order) ApplyLargeOrderDiscount() {
    if o.status == "pending" && o.total > 10000 {
        o.total -= 500
    }
}
```

The decision logic about what counts as a "large order" lives in `Order`. If the threshold changes, you update `Order`, not every caller that was querying its fields. Here it is as a small runnable program:

```go:title="main.go":run=true
package main

import "fmt"

// TELL, don't ask: Order owns the decision about when it qualifies.
type Order struct {
    status string
    total  int
}

func (o *Order) ApplyLargeOrderDiscount() {
    if o.status == "pending" && o.total > 10000 {
        o.total -= 500
    }
}

func (o Order) Total() int { return o.total }

func main() {
    big := &Order{status: "pending", total: 25000}
    small := &Order{status: "pending", total: 5000}

    big.ApplyLargeOrderDiscount()
    small.ApplyLargeOrderDiscount()

    fmt.Println("large order total:", big.Total())  // 24500
    fmt.Println("small order total:", small.Total()) // 5000
}
```

---

## In Go: package boundaries as the unit

In Go, the Law of Demeter applies most naturally at the package level. A package should be self-contained. If package A reaches through package B to directly manipulate package C's types, that's a three-layer dependency that should be collapsed.

```go
// BAD — handler package reaches through service package into store package.
func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
    svc := h.services.UserService()
    user, _ := svc.Store().FindByID(r.URL.Query().Get("id")) // reaches into store
    json.NewEncoder(w).Encode(user)
}

// GOOD — handler calls service; service calls store; each layer knows only its neighbour.
func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
    user, err := h.userService.GetByID(r.Context(), r.URL.Query().Get("id"))
    if err != nil {
        http.Error(w, "not found", http.StatusNotFound)
        return
    }
    json.NewEncoder(w).Encode(user)
}
```

> **Smell:** A function chain has more than two dots (excluding nil-safe accessors). Changing a deeply nested struct field breaks code in packages that shouldn't know about that struct. A caller extracts data from an object only to pass it back to that same object.

See also: [Separation of Concerns](/go/philosophy/separation-of-concerns), [Clean Architecture](/go/patterns/architectural/clean-architecture), [Facade](/go/patterns/structural/facade).
