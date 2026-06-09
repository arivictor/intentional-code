---
title: "Backends for Frontends (BFF)"
description: "Each frontend gets its own backend, shaped to its own screen, network, and flow, while downstream services stay shared and general."
---

# Backends for Frontends (BFF)

A Backend for Frontend is a backend you keep close to one frontend. One app, one BFF. Another app, another BFF. They sit in front of the same downstream services, then shape responses for the client that asked.

You see the difference fast when clients share one general API. Mobile asks for a small view on a weak link. Web asks for a wider one on a big screen. The shared endpoint starts collecting flags and field lists, and both sides still do extra work. A BFF gives each team a place to shape data without asking every other team first.

## Scenario

One `/home` endpoint serves mobile and web. Mobile needs a name, an avatar, one recent order. It still pulls a full profile and full order history, then throws most of it away before paint.

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

Give each frontend its own backend. Both BFFs call the same downstream services, and each composes a response shaped for its client. The mobile BFF returns a minimal payload. The web BFF returns a richer one.

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

The ownership rule matters. A BFF belongs to the frontend team it serves. If mobile owns the mobile BFF, it can change payload shape in the same pull request as the app. Downstream services stay general and shared, and the client-specific stitching stays at the edge.

A BFF and an API gateway can live in the same system. The gateway handles cross-cutting concerns for all traffic, routing, auth, TLS termination, global limits. The BFF handles per-client shaping, which services to call, how to combine results, which fields to return.

## When to Use

- You serve several frontends, and their payload or round-trip needs are clearly different.
- Mobile clients over-fetch, or make many small calls in sequence to render one screen.
- Frontend teams wait on a shared backend team for shape changes.
- You want client-specific aggregation without pushing that logic into core domain services.

## When Not to Use

- You have one frontend, or clients want mostly the same shape.
- Most BFF code would be duplicated anyway, with little client-specific behavior.
- The team cannot support extra deployables, monitoring, and contract drift.
- A few optional query parameters already cover the shape differences cleanly.

## Tradeoffs

A BFF gives each frontend an edge it controls, and it adds moving parts. You run more services. You repeat some glue code, auth checks, and DTO mapping. Shared pieces can move into libraries, but some duplication stays by design so each BFF can move at its own pace.

The common failure mode is quiet. A BFF starts serving two clients, then three, and now it looks like the shared API you were trying to escape. Keep ownership tight, one frontend team per BFF, and keep domain rules in downstream services.

Latency needs attention. A BFF often fans out to several services, so partial failures, per-call timeouts, and parallel calls matter. A sequential implementation can end up slower than the chatty client flow it replaced.

## Related Patterns

- **Microservices:** A BFF sits at the client edge and aggregates calls to fine-grained services, so the frontend does not orchestrate fan-out itself.
- **API Gateway:** A gateway handles cross-cutting concerns for all traffic. A BFF shapes responses for one client. Many systems use both.
- **Facade:** A BFF acts as a facade at the boundary, one simple interface over several downstream services for one consumer.
- **Rate Limiting:** Per-client rate limits and auth checks often happen at the gateway or BFF edge, before internal fan-out.
- **Modular Monolith:** A BFF can be a module inside a modular monolith, so you keep client-shaped edges without immediate distribution overhead.
