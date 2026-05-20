---
title: "Layered Architecture"
category: architectural
intent: "Organise code into horizontal layers, Handler, Service, Repository, Infrastructure, where each layer depends only on the layer below it."
idiomSummary: "Separate packages per layer; interfaces at each boundary so layers can be tested and swapped independently."
relatedSlugs: ["repository", "clean-architecture", "hexagonal"]
tags: [interfaces, dependency-inversion, testability, composition]
---

# Layered Architecture

The warning sign that you need Layered Architecture is an HTTP handler that imports `database/sql`. Go encourages small, composable packages, which means a growing service will naturally tangle HTTP, business rules, and SQL if you don't deliberately separate them. Layered Architecture is usually the first fix: four horizontal tiers — Handler, Service, Repository, Infrastructure — where each layer depends only on the layer below it. Go's implicit interfaces do most of the boundary enforcement for free.

## Problem

A growing codebase has no clear structure. HTTP handlers call SQL queries directly. Business rules live in middleware. Email sending is triggered from a database callback. There is no obvious place to add new behaviour, and changing the database means searching the entire codebase.

```go
// main.go — everything in one place
func handleCreatePost(w http.ResponseWriter, r *http.Request) {
    var req CreatePostRequest
    json.NewDecoder(r.Body).Decode(&req)

    // Validation mixed with HTTP handling
    if req.Title == "" {
        http.Error(w, "title required", 400)
        return
    }

    // Business logic mixed with SQL
    db.Exec("INSERT INTO posts (title, body) VALUES ($1, $2)", req.Title, req.Body)

    // Infrastructure call mixed with business logic
    smtp.SendMail("posts@example.com", req.AuthorEmail, "Post published")

    w.WriteHeader(201)
}
```

Every concern is tangled together. Testing the "create post" rule requires HTTP, a database, and an SMTP server.

## Solution

Separate the code into four layers. Each layer has one responsibility and communicates downward through defined interfaces.

```
┌──────────────────────────────────┐
│         Handler Layer            │  HTTP, gRPC, CLI, translates requests
│   (routes, decode, encode)       │  into service calls and formats responses
└──────────────┬───────────────────┘
               │ calls
┌──────────────▼───────────────────┐
│         Service Layer            │  Business rules, orchestration,
│   (use cases, domain logic)      │  transaction boundaries
└──────────────┬───────────────────┘
               │ calls
┌──────────────▼───────────────────┐
│       Repository Layer           │  Data access abstraction,
│   (interfaces + SQL impl)        │  hides WHERE the data lives
└──────────────┬───────────────────┘
               │ uses
┌──────────────▼───────────────────┐
│     Infrastructure Layer         │  sql.DB, SMTP client, S3,
│   (drivers, clients, adapters)   │  third-party SDKs
└──────────────────────────────────┘
```

The handler translates HTTP to domain types:

```go
// handler/post.go
package handler

import (
    "encoding/json"
    "net/http"
    "posts/service"
)

type PostHandler struct {
    svc *service.PostService
}

func (h *PostHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req struct {
        AuthorEmail string `json:"author_email"`
        Title       string `json:"title"`
        Body        string `json:"body"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "bad request", 400)
        return
    }
    id, err := h.svc.CreatePost(r.Context(), req.AuthorEmail, req.Title, req.Body)
    if err != nil {
        http.Error(w, err.Error(), 422)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"id": id})
}
```

The service layer holds the business rules. It depends on interfaces, not concrete types:

```go
// service/post.go
package service

import (
    "context"
    "fmt"
    "posts/domain"
)

type PostRepo interface {
    Save(ctx context.Context, p *domain.Post) error
}

type Mailer interface {
    SendPublished(ctx context.Context, email, postID string) error
}

type PostService struct {
    repo   PostRepo
    mailer Mailer
}

func NewPostService(repo PostRepo, mailer Mailer) *PostService {
    return &PostService{repo: repo, mailer: mailer}
}

func (s *PostService) CreatePost(ctx context.Context, authorEmail, title, body string) (string, error) {
    if title == "" {
        return "", fmt.Errorf("title is required")
    }
    p := domain.NewPost(authorEmail, title, body)
    if err := s.repo.Save(ctx, p); err != nil {
        return "", fmt.Errorf("saving post: %w", err)
    }
    s.mailer.SendPublished(ctx, p.AuthorEmail, p.ID)
    return p.ID, nil
}
```

```go
// domain/post.go
package domain

import (
    "fmt"
    "time"
)

type Post struct {
    ID          string
    AuthorEmail string
    Title       string
    Body        string
    CreatedAt   time.Time
}

func NewPost(authorEmail, title, body string) *Post {
    return &Post{
        ID:          fmt.Sprintf("post-%d", time.Now().UnixNano()),
        AuthorEmail: authorEmail,
        Title:       title,
        Body:        body,
        CreatedAt:   time.Now(),
    }
}
```

The repository layer implements data access:

```go
// repository/post_postgres.go
package repository

import (
    "context"
    "database/sql"
    "posts/domain"
)

type PostgresPostRepo struct{ db *sql.DB }

func NewPostgresPostRepo(db *sql.DB) *PostgresPostRepo {
    return &PostgresPostRepo{db: db}
}

func (r *PostgresPostRepo) Save(ctx context.Context, p *domain.Post) error {
    _, err := r.db.ExecContext(ctx,
        "INSERT INTO posts (id, author_email, title, body, created_at) VALUES ($1, $2, $3, $4, $5)",
        p.ID, p.AuthorEmail, p.Title, p.Body, p.CreatedAt,
    )
    return err
}
```

Wire it together in `main.go`, the only place that needs to know about all layers:

```go
// main.go
package main

import (
    "database/sql"
    "net/http"
    "posts/handler"
    "posts/repository"
    "posts/service"
    "posts/infra/smtp"
)

func main() {
    db, _ := sql.Open("postgres", "host=localhost ...")
    repo := repository.NewPostgresPostRepo(db)
    mailer := smtp.NewMailer("smtp.example.com:587")
    svc := service.NewPostService(repo, mailer)
    h := &handler.PostHandler{Svc: svc}

    http.HandleFunc("POST /posts", h.Create)
    http.ListenAndServe(":8080", nil)
}
```

## When to Use

- You're building a web service or API and want a clear place for each concern.
- Teams are divided by layer (frontend/backend, DB specialists) and need clear boundaries.
- You want business logic to be testable without HTTP or database infrastructure.
- You need to swap a layer — for example replace PostgreSQL with a different store — without touching other layers.

## When Not to Use

- Very simple applications. Three packages calling each other is already a layered architecture, so don't add ceremony before you feel the pain.
- The domain is so thin that the service layer just passes data through. If service methods are one-liners, the layer is adding noise.
- When you need to optimize differently per operation, consider CQRS instead, which allows asymmetric read and write models.

## Tradeoffs

The clear separation of concerns is the main benefit: business logic sits in the service layer with no SQL or HTTP, and testing that logic requires only an in-memory repository and a fake mailer. The recurring failure mode is "lasagne code" — layers that do nothing but pass data through, adding indirection without capturing any real decision or invariant. Feature changes often touch every layer, so a simple addition like adding a new field to a post means updating the handler, the service, the domain type, and the SQL query, which makes the structure feel heavy for small changes. Strict downward layering also makes it awkward to optimize queries: the service layer can't reach into the database layer without going through the repository interface, which sometimes means the repository interface grows with filter, sort, and pagination parameters.

## Related Patterns

- **Repository** — The natural pattern for defining the Service-to-Infrastructure boundary. The service layer declares the interface it needs, and the repository layer implements it. Use Repository when persistence logic is complex enough to deserve its own package.
- **Clean Architecture** — A more opinionated version of layered thinking that enforces the inward dependency rule with ring terminology. Prefer Clean Architecture when you need stronger isolation guarantees or multiple delivery mechanisms against the same domain.
- **Hexagonal Architecture** — Replaces strict downward layering with symmetric ports. HTTP and databases become equivalent adapters plugging into the same hexagon. Prefer Hexagonal when you need to test the full application core without infrastructure, because the port model makes that clearer than strict layers.
- **CQRS** — An alternative when reads and writes have very different shapes. Rather than adding more query methods to a single service, CQRS splits the layer into a command side and a query side, each with its own handler and data model.
