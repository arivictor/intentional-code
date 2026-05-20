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

**Value Objects:** immutable, compared by value:

```go
// domain/article/value_objects.go
package article

import (
    "fmt"
    "strings"
)

type ArticleID string

type Slug string

func NewSlug(title string) (Slug, error) {
    s := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(title), " ", "-"))
    if s == "" {
        return "", fmt.Errorf("slug cannot be empty")
    }
    return Slug(s), nil
}
```

**Entity and Aggregate Root:** identity, state, and invariants enforced together:

```go
// domain/article/article.go
package article

import (
    "fmt"
    "time"
)

type Status string

const (
    StatusDraft     Status = "draft"
    StatusPublished Status = "published"
    StatusArchived  Status = "archived"
)

// Domain Event — a fact that occurred inside the aggregate.
type PublishedEvent struct {
    ArticleID   ArticleID
    Slug        Slug
    OccurredAt  time.Time
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

func New(id ArticleID, authorID, title, body string) (*Article, error) {
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

func (a *Article) ID() ArticleID { return a.id }
func (a *Article) Status() Status { return a.status }
func (a *Article) Slug() Slug     { return a.slug }

func (a *Article) UpdateBody(body string) {
    a.body = body
}

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
```

**Repository interface:** defined by the domain, implemented by infrastructure:

```go
// domain/article/repository.go
package article

import "context"

type Repository interface {
    FindByID(ctx context.Context, id ArticleID) (*Article, error)
    Save(ctx context.Context, a *Article) error
}
```

**Domain Service:** operations that span the aggregate boundary, like checking for slug uniqueness across all articles:

```go
// domain/article/service.go
package article

import (
    "context"
    "fmt"
)

type SlugChecker interface {
    SlugExists(ctx context.Context, slug Slug) (bool, error)
}

type PublishService struct {
    repo    Repository
    slugs   SlugChecker
}

func NewPublishService(repo Repository, slugs SlugChecker) *PublishService {
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

## Related Patterns

- **Repository** — Repositories are a first-class DDD tactical pattern. The domain defines the interface, infrastructure implements it, and the aggregate root is the only unit the repository saves and loads.
- **Event-Driven Architecture** — Domain Events are a natural source for an event-driven system. Aggregates record events as facts, and the application layer dispatches them to consumers after the transaction commits.
- **CQRS** — Pairs directly with DDD. The command side uses the rich aggregate model with enforced invariants, while the query side uses flat DTOs that bypass the domain model for read performance.
- **Clean Architecture** — DDD's domain model maps to Clean Architecture's innermost Entities ring. The two are complementary, not competing: DDD provides the modeling discipline, and Clean Architecture provides the structural boundary.
