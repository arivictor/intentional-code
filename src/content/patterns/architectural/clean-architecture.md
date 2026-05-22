---
title: "Clean Architecture"
category: architectural
intent: "Structure code in concentric rings, Entities, Use Cases, Interface Adapters, Frameworks, enforcing a strict inward dependency rule so the domain never imports infrastructure."
idiomSummary: "Domain types and use-case interfaces in an inner package; HTTP handlers and DB adapters in outer packages that import inward, never the reverse."
relatedSlugs: ["hexagonal", "layered", "repository", "domain-driven-design"]
tags: [interfaces, dependency-inversion, testability, composition]
---

# Clean Architecture

Clean Architecture organizes code in concentric rings - Entities, Use Cases, Interface Adapters, Frameworks and Drivers - with one strict rule: source-code dependencies may only point inward. The innermost rings know nothing about HTTP, databases, or frameworks. Everything outside exists to serve the domain.

## Problem

You're three years into a project. Switching databases requires touching service logic. Adding a gRPC endpoint means duplicating validation that lives in the HTTP handler. Your domain types import `database/sql`. The framework has become load-bearing, and you can't reason about business logic without understanding the infrastructure first.

```go
// Typical symptom: domain types coupled to infrastructure
package notes

import (
    "database/sql"    // domain importing infrastructure
    "net/http"        // domain importing HTTP
    "encoding/json"
)

type Note struct {
    ID string `json:"id" db:"id"`   // JSON and DB tags on domain type
}

func CreateNote(db *sql.DB, w http.ResponseWriter, r *http.Request) {
    // HTTP, DB, and domain logic all in one place
}
```

## Solution

Enforce the Dependency Rule: source code in an inner ring never names, imports, or knows about anything in an outer ring.

```
┌───────────────────────────────────────────┐
│          Frameworks & Drivers             │  HTTP handlers, sql.DB,
│     (outermost, nothing imports this)    │  SMTP clients, CLI
│  ┌─────────────────────────────────────┐  │
│  │       Interface Adapters            │  │  Controllers, Presenters,
│  │  (converts between rings)           │  │  Repository implementations
│  │  ┌───────────────────────────────┐  │  │
│  │  │        Use Cases              │  │  │  Application business rules
│  │  │  (application logic)          │  │  │  orchestrate entities
│  │  │  ┌─────────────────────────┐  │  │  │
│  │  │  │       Entities          │  │  │  │  Enterprise business rules
│  │  │  │  (domain types & rules) │  │  │  │  pure Go, zero imports
│  │  │  └─────────────────────────┘  │  │  │
│  │  └───────────────────────────────┘  │  │
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
            ← dependencies point inward
```

**Entities:** pure domain types, no imports beyond the standard library:

```go
// domain/note.go
package domain

import (
    "fmt"
    "time"
)

type Note struct {
    ID        string
    Title     string
    Body      string
    CreatedAt time.Time
}

func NewNote(id, title, body string) (*Note, error) {
    if title == "" {
        return nil, fmt.Errorf("title is required")
    }
    return &Note{
        ID:        id,
        Title:     title,
        Body:      body,
        CreatedAt: time.Now(),
    }, nil
}

func (n *Note) UpdateBody(body string) {
    n.Body = body
}
```

**Use Cases:** define interfaces for everything they need, implement nothing:

```go
// usecase/save_note.go
package usecase

import (
    "context"
    "fmt"
    "myapp/domain"
)

// Ports - defined by the use case and implemented by outer rings.
type NoteRepository interface {
    Save(ctx context.Context, n *domain.Note) error
}

type IDGenerator interface {
    NewID() string
}

type SaveNoteInput struct {
    Title string
    Body  string
}

type SaveNoteOutput struct {
    NoteID string
}

type SaveNoteUseCase struct {
    notes   NoteRepository
    ids     IDGenerator
}

func NewSaveNoteUseCase(notes NoteRepository, ids IDGenerator) *SaveNoteUseCase {
    return &SaveNoteUseCase{notes: notes, ids: ids}
}

func (uc *SaveNoteUseCase) Execute(ctx context.Context, in SaveNoteInput) (SaveNoteOutput, error) {
    note, err := domain.NewNote(uc.ids.NewID(), in.Title, in.Body)
    if err != nil {
        return SaveNoteOutput{}, err
    }
    if err := uc.notes.Save(ctx, note); err != nil {
        return SaveNoteOutput{}, fmt.Errorf("saving note: %w", err)
    }
    return SaveNoteOutput{NoteID: note.ID}, nil
}
```

**Interface Adapters:** convert between the use-case world and the infrastructure world:

```go
// adapter/http/note_handler.go
package httpadapter

import (
    "encoding/json"
    "myapp/usecase"
    "net/http"
)

type NoteHandler struct {
    saveNote *usecase.SaveNoteUseCase
}

func (h *NoteHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req struct {
        Title string `json:"title"`
        Body  string `json:"body"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "bad request", 400)
        return
    }
    out, err := h.saveNote.Execute(r.Context(), usecase.SaveNoteInput{
        Title: req.Title,
        Body:  req.Body,
    })
    if err != nil {
        http.Error(w, err.Error(), 422)
        return
    }
    json.NewEncoder(w).Encode(map[string]string{"note_id": out.NoteID})
}
```

```go
// adapter/postgres/note_repo.go
package postgres

import (
    "context"
    "database/sql"
    "myapp/domain"
)

type NoteRepo struct{ db *sql.DB }

func (r *NoteRepo) Save(ctx context.Context, n *domain.Note) error {
    _, err := r.db.ExecContext(ctx,
        "INSERT INTO notes (id, title, body, created_at) VALUES ($1,$2,$3,$4)",
        n.ID, n.Title, n.Body, n.CreatedAt,
    )
    return err
}
```

## When to Use

- You're building a long-lived service where domain rules are the core asset.
- You need to support multiple delivery mechanisms (HTTP, gRPC, CLI, background workers) against the same business logic.
- The domain is complex enough to justify the structure - multiple aggregates, non-trivial rules, frequent change.
- You want to test use cases without starting any infrastructure.

## When Not to Use

- Simple CRUD services with little or no domain logic. The layers add ceremony without payoff.
- Rapid prototypes where the cost of structure outweighs the benefit of isolation.
- Small tools or scripts. Clean Architecture is optimized for change over time, so it's overkill for throwaway code.

## Tradeoffs

The inward dependency rule is the entire mechanism, and it only holds if the team enforces it - a single `import "database/sql"` in a use case package silently breaks the guarantee, and Go's toolchain won't catch it without a lint rule like `depguard`. Data mapping between rings is mechanical but unavoidable: domain types need to be converted to DTOs for the HTTP response, to row types for the database, and back again, which adds boilerplate even for small features. In older Go codebases without generics, many small interfaces and converter functions compound this cost. The payoff arrives when you add a second delivery mechanism (gRPC, a worker, a CLI) without touching any domain code, or when you swap a database by replacing one adapter package - if you never do either of those things, the structure was overhead.

## Related Patterns

- **Hexagonal Architecture** - Same goals, different vocabulary. Clean Architecture uses "concentric rings," Hexagonal uses "ports and adapters." Use whichever model helps your team enforce the inward dependency rule. They work well together, and many codebases use both terms interchangeably.
- **Layered Architecture** - Clean Architecture is a stricter version of layered thinking. Layered gives you the tier structure, while Clean Architecture adds an explicit Dependency Rule and forbids inner rings from naming outer ones. Reach for it when you need that rule to hold under pressure.
- **Repository** - Repository is the idiomatic Go implementation of the persistence port in Clean Architecture's Use Case ring. The interface belongs in Use Cases, the SQL implementation belongs in the outermost Frameworks and Drivers ring, and the inward dependency rule tells you exactly where each piece lives.
- **Domain-Driven Design** - Clean Architecture's Entity ring maps directly to DDD's domain model. The two pair naturally: DDD gives you the modeling discipline for what belongs in the inner rings, and Clean Architecture gives you the structural rule that keeps it there.
