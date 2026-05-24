---
title: "Repository"
category: architectural
intent: "Isolate domain logic from data persistence by defining an interface for storage operations and providing concrete implementations for each backend."
idiomSummary: "A small interface per aggregate (Save, FindByID, etc.); in-memory implementation for tests, sql.DB implementation for production."
relatedSlugs: ["hexagonal", "layered", "domain-driven-design", "clean-architecture"]
tags: [interfaces, dependency-inversion, testability]
recognitionHook: "Database calls are scattered throughout business logic, making it untestable without a real DB."
---

# Repository

The most immediate sign you need Repository is a service function that takes `*sql.DB` as a parameter. That signature tells you something uncomfortable: you can't test this business rule without a running database. Repository replaces the concrete dependency with an interface defined in the domain package. Go's implicit interface satisfaction means the domain never imports the infrastructure package, and any struct with the right methods becomes a valid backend, including the in-memory fake that keeps unit tests fast.

This is the [Dependency Inversion Principle](/go/philosophy/solid) applied to persistence: the domain defines what it needs, and infrastructure satisfies it, not the other way around.

## Problem

Your post-publishing logic is scattered with direct database calls. Every function that needs a post calls `sql.DB` directly. Tests require a live database. Switching from PostgreSQL to a different store means hunting through business logic.

```go
// posts.go
package posts

import (
    "database/sql"
    "fmt"
)

func PublishPost(db *sql.DB, postID string) error {
    var status string
    err := db.QueryRow("SELECT status FROM posts WHERE id = $1", postID).Scan(&status)
    if err != nil {
        return fmt.Errorf("fetching post: %w", err)
    }
    if status != "draft" {
        return fmt.Errorf("post %s is not a draft", postID)
    }
    _, err = db.Exec("UPDATE posts SET status = 'published' WHERE id = $1", postID)
    return err
}
```

The business rule (`status must be "draft"`) is entangled with SQL. There's no way to test `PublishPost` without a real database running.

## Solution

Define a repository interface in the domain package. Business logic depends on that interface. Infrastructure packages implement it.

```
Domain package
  ├── Post (entity)
  └── Repository (interface)
          │ implemented by
          ▼
  postgres.PostRepo   ← talks to sql.DB
  memory.PostRepo     ← holds a map, used in tests
```

The following is a single runnable file that combines the domain types, in-memory repository, and a main function that exercises the logic:

```go
package main

import (
	"fmt"
	"sync"
)

// --- Domain types and interface ---

type Status string

const (
	StatusDraft     Status = "draft"
	StatusPublished Status = "published"
)

type Post struct {
	ID     string
	Title  string
	Status Status
}

func (p *Post) Publish() error {
	if p.Status != StatusDraft {
		return fmt.Errorf("post %s cannot be published: status is %s", p.ID, p.Status)
	}
	p.Status = StatusPublished
	return nil
}

// Repository is the persistence contract the domain requires.
type Repository interface {
	FindByID(id string) (*Post, error)
	Save(p *Post) error
}

// --- Service ---

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) PublishPost(postID string) error {
	post, err := s.repo.FindByID(postID)
	if err != nil {
		return err
	}
	if err := post.Publish(); err != nil {
		return err
	}
	return s.repo.Save(post)
}

// --- In-memory repository (infrastructure) ---

type MemPostRepo struct {
	mu    sync.RWMutex
	posts map[string]*Post
}

func NewMemPostRepo(seed ...*Post) *MemPostRepo {
	m := make(map[string]*Post)
	for _, p := range seed {
		m[p.ID] = p
	}
	return &MemPostRepo{posts: m}
}

func (r *MemPostRepo) FindByID(id string) (*Post, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.posts[id]
	if !ok {
		return nil, fmt.Errorf("post %s not found", id)
	}
	return p, nil
}

func (r *MemPostRepo) Save(p *Post) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.posts[p.ID] = p
	return nil
}

func main() {
	repo := NewMemPostRepo(&Post{ID: "p1", Title: "Hello", Status: StatusDraft})
	svc := NewService(repo)

	if err := svc.PublishPost("p1"); err != nil {
		fmt.Println("error:", err)
		return
	}
	got, _ := repo.FindByID("p1")
	fmt.Printf("post %s status: %s\n", got.ID, got.Status)

	// Trying to publish again returns an error — invariant enforced by Post.Publish()
	if err := svc.PublishPost("p1"); err != nil {
		fmt.Println("second publish:", err)
	}
}
```

```
// Output:
// post p1 status: published
// second publish: post p1 cannot be published: status is published
```

The PostgreSQL implementation would live in a separate package (needs a real DB connection):

```go
// Illustrative only — requires a real PostgreSQL connection to run.
// infra/postgres/post_repo.go
//
// type PostRepo struct{ db *sql.DB }
//
// func (r *PostRepo) FindByID(id string) (*Post, error) {
//     var p Post
//     err := r.db.QueryRow(
//         "SELECT id, title, status FROM posts WHERE id = $1", id,
//     ).Scan(&p.ID, &p.Title, &p.Status)
//     if err != nil {
//         return nil, fmt.Errorf("finding post %s: %w", id, err)
//     }
//     return &p, nil
// }
//
// func (r *PostRepo) Save(p *Post) error {
//     _, err := r.db.Exec(
//         "UPDATE posts SET status = $1 WHERE id = $2", p.Status, p.ID,
//     )
//     return err
// }
```

## When to Use

- Your domain logic needs to be tested without a real database.
- You want the flexibility to change your persistence layer without touching business logic.
- Multiple storage backends are needed (SQL for production, in-memory for tests, Redis for caching).
- You're following Layered, Clean, or Hexagonal Architecture and need a defined persistence boundary.

## When Not to Use

- Simple CRUD applications where there is no domain logic to protect. A direct `sql.DB` call is cleaner.
- The application is a thin data service. Adding a repository interface just to have one adds ceremony without value.
- Your query needs are so varied (complex filters, reporting) that a single interface becomes a leaky abstraction. In that case, a query builder or direct SQL for reads is usually cleaner.

## Tradeoffs

The primary benefit is testability: the in-memory implementation lets you test all domain logic with no database process and no slow I/O. The interface also documents exactly what persistence operations the domain actually needs, which makes it obvious when a feature is adding an unusual query.

The costs are proportional to the number of aggregates. One interface per aggregate grows into many small interfaces, each requiring both a production implementation and an in-memory fake that must stay in sync, or tests give false confidence. Complex read requirements (pagination, filtering, sorting, joins) tend to leak through the interface as method parameters, gradually making the interface harder to satisfy and harder to fake accurately.

## Related Patterns

- **Hexagonal Architecture:** Repository is the canonical example of a driven port. The application defines the interface; an adapter implements it. Use Repository anywhere you need a persistence port, and Hexagonal as the larger structure that tells you where each piece lives.
- **Layered Architecture:** Repository sits at the service-to-infrastructure boundary. In a strictly layered codebase, it's the main tool for keeping business logic database-agnostic. If you're not doing full Hexagonal or Clean Architecture, Layered plus Repository is often enough.
- **Domain-Driven Design:** Repositories are a first-class DDD tactical pattern with one repository per aggregate root. DDD adds the constraint that a repository should load and save complete aggregates, not partial state.
- **Clean Architecture:** Repository interfaces belong in the Use Case (inner) ring, while implementations belong in the outermost Frameworks and Drivers ring. The Dependency Rule means the domain references only the interface, never the implementation.
