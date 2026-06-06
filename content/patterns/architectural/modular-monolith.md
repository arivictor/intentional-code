---
title: "Modular Monolith"
description: "Build one deployable binary, but partition it internally into modules with hard boundaries — each exposing a small public API and hiding its internals — so you get microservice-like separation without the distributed-systems tax."
---

# Modular Monolith

A modular monolith is a single deployable application that is *internally* divided into well-bounded modules. It sits deliberately between the big-ball-of-mud monolith and full [Microservices](/go/patterns/architectural/microservices): one process, one database connection, one deploy — but inside, each module (billing, orders, catalog, notifications) owns its domain, exposes a small public contract, and hides its implementation. Modules talk to each other only through those published contracts, never by reaching into each other's internals.

Go is unusually well suited to this. The **package** is a real encapsulation boundary, and the `internal/` directory is enforced *by the compiler*: code under `foo/internal/` can only be imported by code rooted at `foo/`. That gives you architectural boundaries the build will defend, not just ones a code reviewer hopes everyone respects. The result keeps the operational simplicity of a monolith while staying genuinely decomposable — and any module you later need to extract into a service is already a clean seam.

## Scenario

A service started as one package. Over time, the orders code began calling billing's database helpers directly, billing started reading the orders struct's private fields, and now nothing can change without rippling everywhere. There are no boundaries — only a shared namespace.

```
// project layout — everything imports everything
myapp/
  main.go
  order.go        // reaches into billing's gateway directly
  billing.go      // reads order's internal fields
  catalog.go      // imported by both, imports both back
```

```go
// orders code reaching straight into billing's guts
func placeOrder(o *Order) error {
    // tightly coupled: orders knows billing's internal gateway type,
    // its connection, its private helpers. Change billing → break orders.
    gw := billing.gateway
    return gw.rawCharge(o.customerID, o.totalCents)
}
```

## Solution

Give each module a package with a small **public interface** as its only entry point, and push implementation details under `internal/` so other modules physically cannot import them. Wire the modules together in one composition root.

```text:title="project layout"
myapp/
  cmd/server/main.go        ← composition root: wires modules together
  modules/
    billing/
      api.go                ← public: BillingAPI interface, constructor
      internal/             ← compiler-enforced private to billing/
        service.go
        gateway.go
    orders/
      api.go                ← public: OrdersAPI; depends on billing.BillingAPI
      internal/
        service.go
```

The boundary is the interface. `orders` depends on `billing`'s *contract*, not its concrete type — so billing's internals can change freely, and the module could later move behind a network call without `orders` noticing:

```go:title="main.go":run=true:editable=true
package main

import "fmt"

// A modular monolith is ONE deployable binary, but internally split into
// modules with hard boundaries. Each module exposes a small public API (an
// interface) and hides its internals. Modules call each other only through
// these published contracts — never by reaching into another module's types.
//
// In a real project each module is its own package, with implementation
// details under an internal/ subdirectory the compiler forbids others from
// importing. Here we simulate that with interfaces and unexported structs.

// --- billing module: public contract ---

type BillingAPI interface {
	Charge(customerID string, cents int) (receipt string, err error)
}

// internal to the billing module; other modules cannot construct or see this.
type billingService struct{ gateway string }

func NewBilling(gateway string) BillingAPI { return &billingService{gateway: gateway} }

func (b *billingService) Charge(customerID string, cents int) (string, error) {
	return fmt.Sprintf("%s charged %d via %s", customerID, cents, b.gateway), nil
}

// --- orders module: depends on billing ONLY through BillingAPI ---

type OrdersAPI interface {
	Place(customerID string, cents int) (string, error)
}

type ordersService struct {
	billing BillingAPI // the contract, not the concrete billingService
}

func NewOrders(billing BillingAPI) OrdersAPI {
	return &ordersService{billing: billing}
}

func (o *ordersService) Place(customerID string, cents int) (string, error) {
	receipt, err := o.billing.Charge(customerID, cents)
	if err != nil {
		return "", err
	}
	return "order placed: " + receipt, nil
}

func main() {
	// The composition root wires modules together at startup. Swapping a
	// module's implementation (or extracting it into a microservice later)
	// touches only this wiring, because callers depend on interfaces.
	billing := NewBilling("stripe")
	orders := NewOrders(billing)

	out, _ := orders.Place("cust-42", 4999)
	fmt.Println(out)
}
```

```
// Output:
// order placed: cust-42 charged 4999 via stripe
```

Three Go-specific tools make the boundaries real rather than aspirational:

- **`internal/` directories** make encapsulation a compile error, not a convention. Put each module's implementation under `module/internal/` and only its `api.go` is importable.
- **Interfaces at the boundary** invert the dependency: callers depend on a contract, so a module's guts (and even its location) can change without breaking callers.
- **Import linting.** Tools like `go-arch-lint` or a custom `go vet`-style check enforce the dependency *direction* — e.g. "orders may import billing's API, but billing may never import orders" — catching architectural drift in CI.

## When to Use

- You want clear domain boundaries and team ownership, but the operational cost of microservices (network calls, distributed tracing, eventual consistency, multiple deploys) isn't justified yet.
- You're starting a new system and want to keep the *option* of extracting services later without committing to distribution now.
- The team is small-to-medium and a single deploy pipeline is an asset, not a bottleneck.
- You have an existing big-ball-of-mud monolith and want to introduce boundaries incrementally without a risky rewrite into services.

## When Not to Use

- Modules genuinely need independent scaling (one path is CPU-bound under load while others sit idle) or independent deploy cadences (one team ships hourly, another needs audited releases). That's the case for [Microservices](/go/patterns/architectural/microservices).
- Teams must deploy fully independently with separate release pipelines and ownership of runtime — a shared binary couples their release schedules.
- The system is tiny and a single flat package is perfectly readable; modules would be ceremony.
- Different parts demand different languages or runtimes; a single Go binary can't accommodate that.

## Tradeoffs

The modular monolith's central bet is that **most systems need modularity, not distribution** — and that you can get the first without paying for the second. You keep in-process calls (fast, type-safe, transactional, trivially debuggable) and one deploy, while still having the boundaries that let you reason about and later split the system.

The cost is **discipline**. The boundaries are only as strong as you enforce them; without `internal/` and import linting, "modular" decays back into a monolith one shortcut at a time. The compiler helps more in Go than in most languages, but it can't stop a team that routes everything through a shared `common` package.

It's also a **staging point, not a contradiction** of microservices. A well-built modular monolith is the *best* starting position for an eventual extraction: each module's public API is already the service boundary, so promoting a module to a service is mostly about replacing an in-process call with a network one — not untangling a knot. Build the monolith well, and the migration (if you ever need it) is incremental.

## Related Patterns

- **Microservices:** The same domain boundaries, drawn in-process instead of over the network. Start with a modular monolith and extract a module into a service only when independent scaling or deployment is a real, present constraint.
- **Hexagonal Architecture:** Each module is typically a small hexagon — a domain core with ports and adapters — so the modular monolith is hexagonal architecture applied per module.
- **Domain-Driven Design:** Modules map naturally onto DDD *bounded contexts*; strategic DDD is how you decide where the module boundaries should fall.
- **Microkernel:** A sibling decomposition strategy — microkernel splits into core-plus-plugins, modular monolith splits into peer modules — both achieving extensibility through enforced boundaries.
- **Backends for Frontends:** A BFF can be a module within the monolith just as easily as a separate service, shaping responses per client without leaving the binary.
