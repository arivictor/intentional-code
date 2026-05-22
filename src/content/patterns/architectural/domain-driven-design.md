---
title: "Domain-Driven Design"
category: architectural
intent: "Model software around the business domain using Entities, Value Objects, Aggregates, Repositories, and Domain Events, keeping the ubiquitous language consistent across code and conversation."
idiomSummary: "Structs for entities and value objects; aggregate roots as the only entry point for mutations; domain events as plain structs dispatched after state changes."
relatedSlugs: ["repository", "event-driven", "clean-architecture", "cqrs"]
tags: [interfaces, state, events, composition, dependency-inversion]
---

# Domain-Driven Design

The problem DDD solves is logic that leaks. Business rules like "a post can't be published without a title" get written into one service function, forgotten in another, and enforced inconsistently across the codebase. Your domain types become plain data structs, and the rules that govern them float free. DDD puts that logic back inside the type, where the compiler helps you keep callers honest.

The tactical building blocks are **Entities** (identity-based, stateful), **Value Objects** (equality-based, immutable), **Aggregates** (consistency boundaries mutated only through the root), **Repositories** (persistence interfaces defined by the domain), **Domain Events** (facts that have occurred), and **Domain Services** (operations spanning multiple aggregates). The unifying constraint is simple: the code should speak the language of the business.

## Strategic vs Tactical

DDD operates at two levels. **Tactical DDD** is the building-block vocabulary: Entities, Value Objects, Aggregates, Repositories, Domain Events, and Domain Services. These clarify a single bounded context.

**Strategic DDD** is the higher-level discipline: how you carve a large domain into coherent sub-domains, draw explicit boundaries between them, and manage the relationships across those boundaries. Most DDD failures stem from applying tactical patterns without the strategic foundation — you end up with rich aggregates that still create a tightly coupled system because context boundaries were never drawn.

## Bounded Contexts

A bounded context is an explicit boundary within which a particular domain model applies. Inside the boundary, terms, models, and rules are consistent. Outside it, the same words may mean something entirely different.

The word "Customer" appears across the entire e-commerce domain, but means something different to each team:

```
┌────────────────────────┐    ┌────────────────────────┐
│    Billing Context     │    │   Shipping Context     │
│                        │    │                        │
│  Customer {            │    │  Customer {            │
│    ID                  │    │    ID                  │
│    PaymentMethod       │    │    ShippingAddress     │
│    BillingAddress      │    │    DeliveryPrefs       │
│    CreditLimit         │    │    ContactPhone        │
│  }                     │    │  }                     │
└────────────────────────┘    └────────────────────────┘
```

In Go, each bounded context is its own package (or set of packages). The types are independent:

```go
// billing/customer.go — the billing model of a customer
package billing

type Customer struct {
    ID            string
    PaymentMethod PaymentMethod
    BillingAddr   Address
    CreditLimit   Money
}
```

```go
// shipping/customer.go — the shipping model of a customer
package shipping

type Customer struct {
    ID            string
    ShippingAddr  Address
    DeliveryPrefs DeliveryPreferences
    ContactPhone  string
}
```

Forcing a single `Customer` struct to serve both contexts produces a type with 15 fields where every consumer uses a different 5. Bounded contexts are the fix: each context owns its model and its data. Cross-context reads happen through explicit integration points, not shared tables.

## Context Maps

A context map documents the relationships between bounded contexts. The four most common relationships in practice:

**Shared Kernel** — Two contexts share a small subset of the model (a `Money` type, an `OrderID`). Changes to the kernel require coordination between both teams.

**Customer/Supplier** — One context is upstream (the supplier), one is downstream (the customer). The supplier defines the API; the customer adapts to it.

**Anti-Corruption Layer (ACL)** — The downstream context translates the upstream model into its own terms, protecting its domain from the upstream's design decisions. This is the most important relationship for legacy integration.

**Open Host Service** — The upstream publishes a stable, versioned API for any consumer, rather than negotiating separately with each one.

```
┌─────────────────────┐      ACL      ┌─────────────────────┐
│  Legacy ERP System  │ ──────────── │   Order Context     │
│  (Upstream)         │              │   (Downstream)      │
│  LegacyOrder{...}   │              │   Order{...}        │
└─────────────────────┘              └─────────────────────┘
```

In Go, an Anti-Corruption Layer is a translator struct that converts the upstream's types into your domain's types:

```go
// acl/erp_translator.go
package acl

import "myapp/order"

// LegacyOrder is the upstream ERP's order format.
type LegacyOrder struct {
    OrderNo    string
    CustRef    string
    LineItems  []LegacyLineItem
    OrderFlags int // bitmask: 0x01=rush, 0x02=gift, 0x04=international
}

type LegacyLineItem struct {
    SKU            string
    Qty            int
    UnitPriceCents int
}

type ERPTranslator struct{}

func (t *ERPTranslator) ToDomainOrder(src LegacyOrder) order.Order {
    items := make([]order.LineItem, len(src.LineItems))
    for i, li := range src.LineItems {
        items[i] = order.LineItem{
            ProductID: order.ProductID(li.SKU),
            Quantity:  li.Qty,
            UnitPrice: order.Money{Cents: li.UnitPriceCents},
        }
    }
    return order.Order{
        ID:         order.OrderID(src.OrderNo),
        CustomerID: order.CustomerID(src.CustRef),
        Items:      items,
        IsRush:     src.OrderFlags&0x01 != 0,
    }
}
```

The order domain never sees `LegacyOrder` or its bitmask flags. The ACL absorbs the translation complexity and keeps the domain model clean.

## Ubiquitous Language

A ubiquitous language is a shared vocabulary built with domain experts that appears consistently in conversation, documentation, and code. It eliminates the translation tax that developers pay every time they convert business concepts into technical terms.

Building the language is a collaborative process: sit with domain experts, model out loud, and let their corrections shape the vocabulary. When a domain expert says "we don't 'process' orders, we 'fulfil' them," update the code immediately.

```go
// Before: technical vocabulary that doesn't match how the business talks.
type UserRecord struct {
    ID        string
    CreatedAt time.Time
}

func processUserRecord(db *sql.DB, r *UserRecord) error { ... }

// After: ubiquitous language — code reads like the domain expert's sentences.
type Customer struct {
    ID           CustomerID
    RegisteredAt time.Time
}

func (c *Customer) PlaceOrder(items []OrderItem) (*Order, error) { ... }
```

The language flows through package names (`package billing`, not `package billingservice`), type names (`Customer`, `Order`, `Shipment`), and method names (`PlaceOrder`, `FulfillShipment`, `IssueRefund`). When code reads like the domain expert's sentences, you've arrived.

## Problem

A content platform has an `Article` struct carrying 20 fields. It's updated from 8 different places. Some mutations are only valid in certain states. Bugs appear because invariants like "a draft can't be published without a title" are enforced in some callers but forgotten in others. The model is an anemic data bag, not a reflection of the business.

```go
// Anemic domain model — data bag, no behavior, invariants scattered
type Article struct {
    ID        string
    AuthorID  string
    Title     string
    Body      string
    Status    string // "draft", "published", "archived"
    PublishedAt *time.Time
}

// Invariant lives in service code, duplicated and inconsistently enforced
func PublishArticle(db *sql.DB, id string) error {
    var a Article
    db.QueryRow("SELECT * FROM articles WHERE id = $1", id).Scan(&a)
    if a.Title == "" {
        return errors.New("no title")  // enforced here...
    }
    db.Exec("UPDATE articles SET status = 'published' WHERE id = $1", id)
    return nil
}

func AdminPublish(a *Article) {
    a.Status = "published"  // ...but bypassed here
}
```

## Solution

Model the domain explicitly. Each building block has a specific role.

```
┌─────────────────────────────────────────────┐
│               Aggregate Root                │
│             Article (Entity)                │
│  ┌──────────────────┐  ┌──────────────────┐ │
│  │  ArticleID       │  │  Slug            │ │
│  │  (Value Obj.)    │  │  (Value Obj.)    │ │
│  └──────────────────┘  └──────────────────┘ │
│                                             │
│  Rules enforced inside, no bypass possible │
└───────────────────┬─────────────────────────┘
                    │ persisted via
             ArticleRepository (interface)
                    │ emits
              ArticlePublished (Domain Event)
```

The following is a single runnable file combining Value Objects, Entity/Aggregate Root, Repository interface, and Domain Service:

```go
package main

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

// --- Value Objects: immutable, compared by value ---

type ArticleID string

type Slug string

func NewSlug(title string) (Slug, error) {
	s := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(title), " ", "-"))
	if s == "" {
		return "", fmt.Errorf("slug cannot be empty")
	}
	return Slug(s), nil
}

// --- Entity and Aggregate Root: identity, state, and invariants enforced together ---

type Status string

const (
	StatusDraft     Status = "draft"
	StatusPublished Status = "published"
	StatusArchived  Status = "archived"
)

// Domain Event — a fact that occurred inside the aggregate.
type PublishedEvent struct {
	ArticleID  ArticleID
	Slug       Slug
	OccurredAt time.Time
}

// Article is the aggregate root — the only entry point for mutations.
type Article struct {
	id       ArticleID
	authorID string
	title    string
	body     string
	slug     Slug
	status   Status

	events []interface{} // uncommitted domain events
}

func NewArticle(id ArticleID, authorID, title, body string) (*Article, error) {
	if title == "" {
		return nil, fmt.Errorf("title is required")
	}
	slug, err := NewSlug(title)
	if err != nil {
		return nil, err
	}
	return &Article{
		id:       id,
		authorID: authorID,
		title:    title,
		body:     body,
		slug:     slug,
		status:   StatusDraft,
	}, nil
}

func (a *Article) ID() ArticleID   { return a.id }
func (a *Article) Status() Status  { return a.status }
func (a *Article) Slug() Slug      { return a.slug }
func (a *Article) UpdateBody(body string) { a.body = body }

// Publish enforces the invariant — callers can't bypass it.
func (a *Article) Publish() error {
	if a.title == "" {
		return fmt.Errorf("cannot publish: title is required")
	}
	if a.status == StatusArchived {
		return fmt.Errorf("cannot publish an archived article")
	}
	if a.status == StatusPublished {
		return nil // idempotent
	}
	a.status = StatusPublished
	a.events = append(a.events, PublishedEvent{
		ArticleID:  a.id,
		Slug:       a.slug,
		OccurredAt: time.Now(),
	})
	return nil
}

func (a *Article) Archive() error {
	if a.status == StatusArchived {
		return nil
	}
	a.status = StatusArchived
	return nil
}

// PopEvents returns and clears uncommitted domain events.
func (a *Article) PopEvents() []interface{} {
	evts := a.events
	a.events = nil
	return evts
}

// --- Repository interface: defined by the domain, implemented by infrastructure ---

type ArticleRepository interface {
	FindByID(ctx context.Context, id ArticleID) (*Article, error)
	Save(ctx context.Context, a *Article) error
}

// In-memory repository (infrastructure adapter)
type MemArticleRepo struct {
	mu       sync.RWMutex
	articles map[ArticleID]*Article
	slugs    map[Slug]ArticleID
}

func NewMemArticleRepo() *MemArticleRepo {
	return &MemArticleRepo{
		articles: make(map[ArticleID]*Article),
		slugs:    make(map[Slug]ArticleID),
	}
}

func (r *MemArticleRepo) FindByID(_ context.Context, id ArticleID) (*Article, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	a, ok := r.articles[id]
	if !ok {
		return nil, fmt.Errorf("article %s not found", id)
	}
	return a, nil
}

func (r *MemArticleRepo) Save(_ context.Context, a *Article) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.articles[a.id] = a
	r.slugs[a.slug] = a.id
	return nil
}

func (r *MemArticleRepo) SlugExists(_ context.Context, slug Slug) (bool, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.slugs[slug]
	return ok, nil
}

// --- Domain Service: operations that span the aggregate boundary ---

type SlugChecker interface {
	SlugExists(ctx context.Context, slug Slug) (bool, error)
}

type PublishService struct {
	repo  ArticleRepository
	slugs SlugChecker
}

func NewPublishService(repo ArticleRepository, slugs SlugChecker) *PublishService {
	return &PublishService{repo: repo, slugs: slugs}
}

func (s *PublishService) Publish(ctx context.Context, id ArticleID) error {
	a, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("finding article: %w", err)
	}
	exists, err := s.slugs.SlugExists(ctx, a.Slug())
	if err != nil {
		return fmt.Errorf("checking slug: %w", err)
	}
	if exists {
		return fmt.Errorf("slug %q is already in use", a.Slug())
	}
	if err := a.Publish(); err != nil {
		return err
	}
	return s.repo.Save(ctx, a)
}

func main() {
	ctx := context.Background()
	repo := NewMemArticleRepo()
	svc := NewPublishService(repo, repo)

	// Create and save a draft
	a, err := NewArticle("art-1", "alice", "Hello DDD", "Domain-driven content")
	if err != nil {
		fmt.Println("error:", err)
		return
	}
	repo.Save(ctx, a)
	fmt.Printf("created article %s: status=%s slug=%s\n", a.ID(), a.Status(), a.Slug())

	// Publish through the domain service (checks slug uniqueness)
	if err := svc.Publish(ctx, "art-1"); err != nil {
		fmt.Println("publish error:", err)
		return
	}
	published, _ := repo.FindByID(ctx, "art-1")
	fmt.Printf("published article %s: status=%s\n", published.ID(), published.Status())

	// Domain events emitted during the state transition
	for _, evt := range published.PopEvents() {
		fmt.Printf("domain event: %T\n", evt)
	}

	// Invariant: archived articles cannot be published
	published.Archive()
	if err := published.Publish(); err != nil {
		fmt.Println("invariant enforced:", err)
	}

	// Invariant: title cannot be empty
	_, err = NewArticle("art-2", "bob", "", "No title")
	if err != nil {
		fmt.Println("invariant enforced:", err)
	}
}
```

```
// Output:
// created article art-1: status=draft slug=hello-ddd
// published article art-1: status=published
// domain event: main.PublishedEvent
// invariant enforced: cannot publish an archived article
// invariant enforced: title is required
```

## When to Use

- The business domain is complex, with multiple interacting concepts, non-trivial rules, and frequent change driven by business requirements.
- You need to communicate with domain experts and the code should reflect their language (the ubiquitous language).
- Bugs are caused by invariants being enforced inconsistently in different places.
- You have aggregates with clear consistency boundaries — things that must change together.

## When Not to Use

- The domain is simple CRUD. DDD adds structure for complexity that isn't there.
- The team doesn't have access to domain experts. DDD's value compounds with tight collaboration.
- You're in early exploration. Build a working version first; apply DDD when the domain stabilises.

## Tradeoffs

The payoff is concentrated: aggregates enforce invariants in one place so callers can't accidentally bypass them, and the ubiquitous language keeps code and business conversation aligned. The cost is upfront and ongoing. Getting aggregate boundaries wrong is expensive to fix — split them too fine and you get coordination overhead across transactions; merge them too broadly and you get a 40-field struct that every feature touches. Persistence mapping between rich domain types and flat database rows is mechanical work that compounds with every aggregate. And applying DDD to a simple reporting or admin tool is over-engineering — not every problem benefits from a rich domain model.

Aggregate boundary heuristics: an aggregate root should enforce consistency within a single database transaction — if doing so requires loading many other entities, the aggregate is too large. Reference other aggregates by ID rather than by pointer; this forces cross-aggregate coordination through an explicit service or domain event, making the boundary visible in the code. Use domain events for cross-aggregate operations: when an `Order` is placed, publish an `OrderPlaced` event that the `Inventory` aggregate handles independently, rather than having `Order.Place()` reach into `Inventory` directly. A good rule of thumb: if you always load two aggregates together, they may belong in one; if enforcing an invariant on one requires reading another, the boundary is likely wrong.

## Related Patterns

- **Repository** — Repositories are a first-class DDD tactical pattern. The domain defines the interface, infrastructure implements it, and the aggregate root is the only unit the repository saves and loads.
- **Event-Driven Architecture** — Domain Events are a natural source for an event-driven system. Aggregates record events as facts, and the application layer dispatches them to consumers after the transaction commits.
- **CQRS** — Pairs directly with DDD. The command side uses the rich aggregate model with enforced invariants, while the query side uses flat DTOs that bypass the domain model for read performance.
- **Clean Architecture** — DDD's domain model maps to Clean Architecture's innermost Entities ring. The two are complementary, not competing: DDD provides the modeling discipline, and Clean Architecture provides the structural boundary.
