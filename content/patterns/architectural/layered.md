---
title: "Layered Architecture"
description: "Organise code into horizontal layers, Handler, Service, Repository, Infrastructure, where each layer depends only on the layer below it."
---

# Layered Architecture

Layered architecture organises code into horizontal layers, where each layer has a single responsibility and depends only on the layer below it. A common layering is Handler (HTTP, gRPC, CLI), Service (business rules, orchestration), Repository (data access abstraction), and Infrastructure (SQL drivers, third-party SDKs). Each layer defines interfaces for the layer above it to depend on, which allows for test doubles and swapping implementations without changing business logic.

This differs from Clean Architecture, which enforces the same separation of concerns but with a stronger inward dependency rule: inner layers cannot import from outer layers at all, so the domain layer cannot even import an interface from the repository layer. Layered architecture is more flexible and less strict, so it's a good starting point for teams new to architectural patterns or when you don't need the stronger isolation guarantees of Clean Architecture.

## Scenario

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

The following is a single runnable file demonstrating all four layers: Handler, Service, Repository (in-memory), and Infrastructure (stub mailer).

```go:title="main.go":run=true:editable=true
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"time"
)

// --- Domain layer ---

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

// --- Service layer (business rules, depends on interfaces) ---

type PostRepo interface {
	Save(ctx context.Context, p *Post) error
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
	p := NewPost(authorEmail, title, body)
	if err := s.repo.Save(ctx, p); err != nil {
		return "", fmt.Errorf("saving post: %w", err)
	}
	s.mailer.SendPublished(ctx, p.AuthorEmail, p.ID)
	return p.ID, nil
}

// --- Repository layer (in-memory implementation) ---

type MemPostRepo struct {
	mu    sync.Mutex
	posts []*Post
}

func (r *MemPostRepo) Save(_ context.Context, p *Post) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.posts = append(r.posts, p)
	return nil
}

// --- Infrastructure layer (stub mailer) ---

type LogMailer struct{ sent []string }

func (m *LogMailer) SendPublished(_ context.Context, email, postID string) error {
	m.sent = append(m.sent, fmt.Sprintf("email to %s: post %s published", email, postID))
	return nil
}

// --- Handler layer (HTTP, translates requests into service calls) ---

type PostHandler struct {
	svc *PostService
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

func main() {
	repo := &MemPostRepo{}
	mailer := &LogMailer{}
	svc := NewPostService(repo, mailer)
	h := &PostHandler{svc: svc}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /posts", h.Create)

	// Valid post
	body := `{"author_email":"alice@example.com","title":"Hello","body":"World"}`
	req := httptest.NewRequest(http.MethodPost, "/posts", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	fmt.Printf("POST /posts → %d %s", w.Code, w.Body.String())

	// Missing title — business rule enforced by service layer
	body = `{"author_email":"bob@example.com","title":"","body":"Oops"}`
	req = httptest.NewRequest(http.MethodPost, "/posts", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	fmt.Printf("POST /posts → %d %s", w.Code, w.Body.String())

	fmt.Println("emails sent:")
	for _, s := range mailer.sent {
		fmt.Println(" ", s)
	}
}
```

```
// Output:
// POST /posts → 200 {"id":"post-..."}
// POST /posts → 422 title is required
// emails sent:
//   email to alice@example.com: post post-... published
```

The PostgreSQL repository implementation would live in a separate package (requires a real DB):

```go
// Illustrative only — requires a real PostgreSQL connection to run.
// repository/post_postgres.go
//
// type PostgresPostRepo struct{ db *sql.DB }
//
// func (r *PostgresPostRepo) Save(ctx context.Context, p *Post) error {
//     _, err := r.db.ExecContext(ctx,
//         "INSERT INTO posts (id, author_email, title, body, created_at) VALUES ($1, $2, $3, $4, $5)",
//         p.ID, p.AuthorEmail, p.Title, p.Body, p.CreatedAt,
//     )
//     return err
// }
```

## Folder Structure

One way this maps to packages on disk:

```
myapp/
├── cmd/
│   └── server/
│       └── main.go         # wires all layers together; the only file that imports from all four
├── handler/                # Handler layer: request parsing, response encoding
│   └── post.go
├── service/                # Service layer: business rules and orchestration
│   └── post.go
├── repository/             # Repository layer: persistence interfaces
│   └── post.go
└── postgres/               # Infrastructure: SQL implementations of the repository interfaces
    └── post.go
```

In package terms: `handler` imports `service`, `service` imports `repository` (the interface), `postgres` also imports `repository` (to implement it). `cmd/server` imports everything and wires it together. `postgres` never imports `handler` or `service` — the dependency rule holds by import direction alone.

## When to Use

- You need to test business rules without running HTTP or database infrastructure. That testability requirement is the justification for the boundary.
- You need to swap a storage backend (for example, replace PostgreSQL with a different store) without touching business logic. That swap-ability requirement justifies isolating infrastructure behind the repository interface.
- Teams own distinct layers and need explicit handoff contracts. The interface at each boundary makes that ownership concrete.
- The application is growing and "where does this code live?" is becoming expensive to answer consistently. A clear layer structure settles that question once.

## When Not to Use

- Very simple applications. Three packages calling each other is already a layered architecture, so don't add ceremony before you feel the pain.
- The domain is so thin that the service layer just passes data through. If service methods are one-liners, the layer is adding noise.
- When you need to optimise differently per operation, consider CQRS instead, which allows asymmetric read and write models.

## The Decision

If someone asks, "why did you split this into folders?", the answer should be concrete. You did it because you want to test business rules without a running database, and because you want to change the storage backend without rewriting business logic. The folder structure is there to enforce that rule. The rule exists to serve those needs. If your project does not have either of those pressures, then the folders may just be extra ceremony.

The main benefit is clear separation of concerns. Business logic lives in the service layer, without SQL or HTTP code mixed into it. That makes it possible to test the logic with an in-memory repository and a fake mailer. The common failure mode is "lasagne code": layers that only pass data from one place to another, without making any real decision or protecting any invariant. Small feature changes can also feel heavy, because even a simple change, like adding one field to a post, may require updates in the handler, service, domain type, and SQL query. Strict downward layers can also make query optimization awkward. The service layer cannot reach directly into the database layer, so everything has to go through the repository interface. Over time, that interface can grow to include filter, sort, and pagination options that are really query concerns.

## Related Patterns

- **Repository:** The natural pattern for defining the Service-to-Infrastructure boundary. The service layer declares the interface it needs, and the repository layer implements it. Use Repository when persistence logic is complex enough to deserve its own package.
- **Clean Architecture:** A more opinionated version of layered thinking that enforces the inward dependency rule with ring terminology. Prefer Clean Architecture when you need stronger isolation guarantees or multiple delivery mechanisms against the same domain.
- **Hexagonal Architecture:** Replaces strict downward layering with symmetric ports. HTTP and databases become equivalent adapters plugging into the same hexagon. Prefer Hexagonal when you need to test the full application core without infrastructure, because the port model makes that clearer than strict layers.
- **CQRS:** An alternative when reads and writes have very different shapes. Rather than adding more query methods to a single service, CQRS splits the layer into a command side and a query side, each with its own handler and data model.
