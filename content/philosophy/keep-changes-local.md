---
title: Make the next change local. That's the whole job
nav_title: Keep changes local
description: Almost every other principle is downstream of one goal — when the next change comes, it touches one place, not six.
order: 9
---

# Make the next change local. That's the whole job

Strip the field of its vocabulary and almost everything that's left points at one goal: when the next change arrives, it should touch one place, not six. Locality is the payoff. Coupling is the tax you pay against it. Cohesion seeks to ensure that the things that change together stay in the same place. Nearly every principle worth knowing is some specific tactic in service of this one outcome, which is why it's the closest thing this site has to a single job description.

You feel its absence before you can name it. A one-line requirement turns into edits across four packages. A change to the database schema somehow breaks an HTTP handler. Fixing a validation rule forces you to re-test storage. Each of those is locality leaking away, which is a sign that responsibilities have smeared across boundaries that were supposed to contain them.

## Architecture is communication

Locality is also what makes a codebase legible to other people. When boundaries are clear, a newcomer can open the tree and put a new feature in roughly the right place on the first try. Imports read like a map. Pull requests argue about behaviour instead of about where things should live. When the structure drifts, every change reopens the same negotiation in slightly different words — and consistency, here, carries far more weight than cleverness.

## Separation of Concerns

The high-level form of the tenet: each part of a system should address one concern, with explicit boundaries between parts. Isolate what changes together, and a change in one domain stops rippling into the others. SoC is the Single Responsibility Principle one level up: SRP says a *type* has one reason to change; SoC says a whole *layer* addresses one domain. The violation is concern leakage, where one layer reaches into another's job:

```go
// BAD — the HTTP handler contains business logic and SQL.
// Three concerns in one place.

func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
    var req struct {
        UserID string  `json:"user_id"`
        Items  []Item  `json:"items"`
    }
    json.NewDecoder(r.Body).Decode(&req)

    // Business rule leaking into handler:
    if len(req.Items) == 0 {
        http.Error(w, "no items", 400)
        return
    }

    // SQL leaking into handler:
    total := 0
    for _, item := range req.Items {
        total += item.Price
    }
    h.db.Exec("INSERT INTO orders (user_id, total) VALUES (?, ?)", req.UserID, total)

    w.WriteHeader(201)
}
```

Change the minimum-order rule and you edit the handler; change the schema and you edit the handler. It has three reasons to change. Split the concerns into layers and each one moves alone. In Go the package system is the enforcement mechanism, and the dependency graph should be a DAG:

```
cmd/          — entry points, wires dependencies together
internal/
  handler/    — HTTP delivery
  domain/     — business rules and domain types
  store/      — persistence
  notify/     — notifications
```

`handler` imports `domain`; `store` imports `domain`; `domain` imports nothing internal; `cmd` wires them together. An import cycle is the signal that two concerns have leaked into each other.

> **Smell:** A handler imports a SQL package directly. A business function constructs an HTTP response. A database struct has a method that sends an email. You need to mock the database to test a business rule.

See also: [Clean Architecture](/go/patterns/architectural/clean-architecture), [Hexagonal Architecture](/go/patterns/architectural/hexagonal), [Repository](/go/patterns/architectural/repository).

## Law of Demeter

Where Separation of Concerns draws the boundaries, the Law of Demeter keeps you from tunnelling through them. Talk only to your immediate collaborators — itself, its parameters, things it creates, its own fields. Every dot in a chain like `order.Customer().Address().City()` is a dependency on the internal structure of an object you don't own, and a place a distant change can reach in and break you. The informal version: **don't talk to strangers**.

```go
// BAD — the handler reaches through Order into Customer into Address.
// If Order's internals change, this handler must change too.
city := order.Customer().Address().City()
rate := h.shipping.QuoteFor(city)
```

```go
// GOOD — Order exposes what callers need and hides how it derives it.
func (o Order) ShippingDestination() string {
    return o.customer.Address().City()
}

rate := h.shipping.QuoteFor(order.ShippingDestination())
```

The navigation now lives inside `Order`, so the handler depends on `Order`'s surface, not on `Customer` or `Address`. The same instinct is "tell, don't ask": rather than pulling an object's fields out to decide something elsewhere, tell the object to decide. One dot is fine; three is almost always a structure you'll regret coupling to.

> **Smell:** A chain has more than two dots (excluding nil-safe accessors). Changing a deeply nested struct field breaks code in packages that shouldn't know it exists. A caller extracts data from an object only to hand it straight back.

See also: [Separation of Concerns](/go/philosophy/keep-changes-local#separation-of-concerns), [Facade](/go/patterns/structural/facade).

## SOLID

The most famous set of object-oriented principles is, read through this tenet, five different tactics for keeping change local: a type with one reason to change (SRP), behaviour you extend without editing (OCP), interfaces narrow enough that no client carries what it doesn't use (ISP), and dependencies pointed at abstractions so infrastructure can move without disturbing logic (DIP). The fifth, LSP, is the quiet constraint that an implementation must honour its interface's *behaviour*, not just its signatures. In Go, SRP, OCP, and ISP come nearly free — small packages and tiny implicit interfaces are idiomatic — while DIP takes discipline and LSP has no compiler to enforce it.

The clearest of the five for *locality* is the Open/Closed Principle: a design where a new case is a new file, not an edit to a tested one.

```go
// BAD — closed to extension: every new channel edits this function.
func SendNotification(kind string, msg string, recipient string) error {
    switch kind {
    case "email":
        return sendEmail(recipient, msg)
    case "sms":
        return sendSMS(recipient, msg)
    default:
        return fmt.Errorf("unknown notification kind: %s", kind)
    }
}
```

```go
// GOOD — open for extension via a small interface.
// Adding Slack or push is a new type, with zero changes here.
type Notifier interface {
    Notify(recipient, message string) error
}

func SendAll(notifiers []Notifier, recipient, msg string) error {
    for _, n := range notifiers {
        if err := n.Notify(recipient, msg); err != nil {
            return err
        }
    }
    return nil
}
```

Adding a channel touches one new file and leaves every tested line alone — the change stays local. DIP is the same move aimed at infrastructure: depend on a small interface your code defines, not a concrete `*sql.DB` or `*smtp.Client`, and swapping a provider (or writing a test) stays out of your business logic. That overlap with testability is not a coincidence; it's the same property [the tests were trying to tell you about](/go/philosophy/listen-to-the-tests).

> **Smell:** You keep adding cases to a switch for every new variant. You can't test a function without standing up a database. A type satisfies an interface with `panic("not supported")` for methods that don't apply.

See also: [Repository](/go/patterns/architectural/repository), [Observer](/go/patterns/behavioral/observer), [Strategy](/go/patterns/behavioral/strategy).
