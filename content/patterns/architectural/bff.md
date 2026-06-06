---
title: "Backends for Frontends (BFF)"
description: "Give each frontend its own dedicated backend that aggregates and shapes downstream data to that client's exact needs, instead of forcing one general-purpose API to serve a web app, a mobile app, and everything else equally badly."
---

# Backends for Frontends (BFF)

A Backend for Frontend is a dedicated backend service tailored to one specific frontend. Instead of every client — a desktop web app, a native mobile app, a smart-TV interface — talking to a single general-purpose API, each gets its own BFF that sits between it and the downstream services. The BFF aggregates calls to those services and shapes a response designed for exactly that client: the payload it needs, in the form it wants, over the connection it has.

The reason a single shared API tends to disappoint everyone is that frontends have genuinely different needs. A mobile client on a flaky cellular link wants tiny, pre-aggregated payloads to minimise round-trips and bytes; a web dashboard wants rich, denormalised data for a dense screen. Forcing both through one endpoint means either the mobile client over-fetches and stitches data together itself, or the API grows a thicket of `?fields=`, `?include=`, and version flags trying to please both. A BFF moves that per-client shaping into a backend the client team owns.

## Scenario

One `/home` endpoint serves both the mobile app and the web app. The mobile team can't get a lean payload without breaking the web view, so the app downloads a large profile object and full order history just to render a name and one recent order — three extra fields' worth of work on every screen, over a slow connection.

```go
// One endpoint, one shape, two unhappy clients.
func (h *API) Home(w http.ResponseWriter, r *http.Request) {
    profile := h.profiles.Get(userID) // full object: bio, email, avatar...
    orders := h.orders.Recent(userID) // entire history
    // Mobile gets all of it and throws most away.
    // Web wants even more and has to make follow-up calls.
    json.NewEncoder(w).Encode(map[string]any{
        "profile": profile,
        "orders":  orders,
    })
}
```

## Solution

Give each frontend its own backend. Both BFFs call the same downstream services, but each composes a response shaped for its client — the mobile BFF returns a minimal payload, the web BFF a richer one.

```text:title="diagram"
   ┌────────────┐      ┌──────────────┐
   │ Mobile app │────► │  Mobile BFF  │──┐
   └────────────┘      └──────────────┘  │   ┌─────────────────┐
                                          ├──►│ Profile service │
   ┌────────────┐      ┌──────────────┐  │   ├─────────────────┤
   │  Web app   │────► │   Web BFF    │──┘   │ Order service    │
   └────────────┘      └──────────────┘      └─────────────────┘
        each client ↔ its own backend     shared downstream services
```

```go:title="main.go":run=true:editable=true
package main

import (
	"fmt"
)

// Two frontends, two backends-for-frontends. Each BFF calls the same shared
// downstream services but shapes a response tailored to its client: the mobile
// app needs a tiny payload over a slow connection; the web app shows a richer
// view. Neither frontend has to over-fetch or stitch data client-side.

// --- shared downstream services (owned by other teams) ---

type Profile struct {
	ID, Name, Email, Bio, AvatarURL string
}

type Order struct {
	ID    string
	Total int
}

type ProfileService struct{}

func (ProfileService) Get(id string) Profile {
	return Profile{ID: id, Name: "Ada", Email: "ada@example.com",
		Bio: "Mathematician & first programmer", AvatarURL: "https://img/ada.png"}
}

type OrderService struct{}

func (OrderService) Recent(userID string) []Order {
	return []Order{{"o-1", 4999}, {"o-2", 1200}, {"o-3", 800}}
}

// --- Mobile BFF: minimal fields, only the latest order ---

type MobileBFF struct {
	profiles ProfileService
	orders   OrderService
}

func (b MobileBFF) Home(userID string) map[string]any {
	p := b.profiles.Get(userID)
	recent := b.orders.Recent(userID)
	return map[string]any{
		"name":        p.Name,
		"avatar":      p.AvatarURL,
		"latestOrder": recent[0].ID, // mobile shows just the most recent
	}
}

// --- Web BFF: richer payload, full order history ---

type WebBFF struct {
	profiles ProfileService
	orders   OrderService
}

func (b WebBFF) Home(userID string) map[string]any {
	p := b.profiles.Get(userID)
	recent := b.orders.Recent(userID)
	total := 0
	for _, o := range recent {
		total += o.Total
	}
	return map[string]any{
		"name":          p.Name,
		"email":         p.Email,
		"bio":           p.Bio,
		"avatar":        p.AvatarURL,
		"orderCount":    len(recent),
		"lifetimeCents": total,
	}
}

func main() {
	mobile := MobileBFF{}
	web := WebBFF{}

	fmt.Printf("mobile payload: %v\n", mobile.Home("u-1"))
	fmt.Printf("web payload:    %v\n", web.Home("u-1"))
}
```

```
// Output:
// mobile payload: map[avatar:https://img/ada.png latestOrder:o-1 name:Ada]
// web payload:    map[avatar:https://img/ada.png bio:Mathematician & first programmer email:ada@example.com lifetimeCents:6999 name:Ada orderCount:3]
```

The crucial ownership rule: **a BFF is owned by the frontend team it serves.** That's what keeps it from collapsing back into a shared API. Because the mobile team owns the mobile BFF, they can change its shape in lockstep with the app and never negotiate with the web team. The downstream services stay general-purpose and client-agnostic; all the client-specific glue lives in the BFF.

A BFF differs from a plain API gateway. A gateway handles cross-cutting concerns for *all* traffic — routing, auth, TLS termination, global rate limiting — and is generally client-agnostic. A BFF is *per client* and is full of client-specific business logic: which services to call, how to aggregate them, what fields to project. The two compose well: a shared gateway out front, a BFF per frontend behind it.

## When to Use

- You serve multiple frontends (web, iOS, Android, partner integrations) with materially different data, payload-size, or round-trip needs.
- Mobile clients are over-fetching or making chatty multi-call sequences against a one-size-fits-all API.
- Frontend teams are blocked waiting on a shared backend team to add or reshape endpoints, and you want to give them control over their own edge.
- You want a place to do client-specific aggregation and composition without polluting the core domain services.

## When Not to Use

- You have a single frontend, or all your clients genuinely want the same shape. A second backend tier is pure overhead.
- The duplication across BFFs would be almost total — if every BFF returns nearly the same thing, one shared API (or GraphQL, where the client selects fields) may serve better.
- Your team can't sustain the extra services. Each BFF is another deployable to build, monitor, secure, and keep in sync with downstream contract changes.
- The shaping is trivial and a few optional query parameters on one endpoint handle it cleanly.

## Tradeoffs

A BFF buys each frontend an edge it controls, at the price of **more services and some duplicated logic**. Aggregation and orchestration that would otherwise sprawl across clients (or bloat a shared API) get a clean home — but you now run N backends instead of one, and similar concerns (auth checks, common DTOs) tend to get re-implemented in each. Factor genuinely shared logic into libraries the BFFs import, while accepting that *some* duplication is the point: it's what lets each BFF evolve independently.

The sharpest failure mode is the **BFF that grows into a second monolith** or quietly becomes the new shared API because two clients started pointing at the same one. Hold the line on ownership (one BFF per frontend, owned by that frontend's team) and keep domain logic in the downstream services — the BFF aggregates and shapes; it should not become where the business rules live.

There's also a real **latency and failure-handling** dimension: the BFF fans out to several downstream services, so it must handle partial failures, set per-call timeouts, and ideally parallelise independent calls. A naive sequential BFF can be slower than the chatty client it replaced.

## Related Patterns

- **Microservices:** The BFF is the client-facing edge of a microservices system, aggregating calls to many fine-grained services into one client-shaped response so frontends don't orchestrate that fan-out themselves.
- **API Gateway:** Complementary, not competing. A gateway handles cross-cutting, client-agnostic concerns for all traffic; a BFF handles per-client shaping behind it. Common to run both.
- **Facade:** A BFF is a Facade at the system boundary — it presents a simple, purpose-built interface over a set of more complex downstream services, for one specific consumer.
- **Rate Limiting:** Per-client rate limiting and auth often live at the BFF/gateway edge, where requests enter before fanning out to internal services.
- **Modular Monolith:** A BFF need not be a separate service — it can be a module in a modular monolith, giving you client-shaped edges without yet paying the distribution tax.
