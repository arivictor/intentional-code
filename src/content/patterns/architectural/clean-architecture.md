---
title: "Clean Architecture"
category: architectural
intent: "Structure code in concentric rings, Entities, Use Cases, Interface Adapters, Frameworks, enforcing a strict inward dependency rule so the domain never imports infrastructure."
idiomSummary: "Domain types and use-case interfaces in an inner package; HTTP handlers and DB adapters in outer packages that import inward, never the reverse."
relatedSlugs: ["hexagonal", "layered", "repository", "domain-driven-design"]
tags: [interfaces, dependency-inversion, testability, composition]
---

# Clean Architecture

Popularised by Robert C. Martin ("Uncle Bob"), Clean Architecture is a software design pattern designed to separate your core business logic from your technical framework, database, and user interface. The ultimate goal is Separation of Concerns so that your application is easy to test, maintain, and change over time. Clean Architecture is imagined as concentric layers of code. It is as much a philosophy as it is a pattern. The pattern hinges around one rule, which is that each source code layer can only point inward. By "point inward" we mean the outer most layer can import inner layers, but inner layers cannot import outer layers. 

The innermost ring contains the Entities, which are pure domain types with no imports beyond the standard library. The next ring contains Use Cases, which define application-specific business rules and interfaces (ports) for everything they need, but implement nothing that belongs in an outer ring. The next ring contains Interface Adapters, which implement the ports defined by the use cases to translate between the domain's pure types and the infrastructure's impure ones. The outermost ring contains Frameworks and Drivers, which are things like HTTP handlers, frameworks, database clients, and CLI commands that depend on third-party libraries but know nothing about the domain.

```Clean
┌───────────────────────────────────────────┐
│          Frameworks & Drivers             │  HTTP handlers, sql.DB,
│     (outermost, nothing imports this)     │  SMTP clients, CLI
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

## Scenario

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



**Entities:** pure domain types, no imports beyond the standard library. This ensures that the core business logic is independent of any framework, database, or delivery mechanism. The domain is the core asset, and the infrastructure is the variable.

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

**Use Cases:** define the intent of the user. They reference interfaces (ports) for everything they need, but implement nothing that belongs in an outer ring. This allows you to test use cases without starting any infrastructure, and to change the delivery mechanism without touching the application logic.

```go
// usecase/save_note.go
package usecase

import (
    "context"
    "fmt"
    "myapp/domain"
)

// Ports — defined by the use case and implemented by outer rings.
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

**Interface Adapters:** implement the previously defined ports to translate between the domain's pure types and the infrastructure's impure ones. For example, the HTTP handler converts from JSON to the use case's input struct, and the repository implementation converts from domain types to SQL rows. This ensures that the domain knows nothing about HTTP, databases, or frameworks, so you can change those things without touching the core business logic.

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

## Folder Structure

Each ring maps to a package or package group:

```
myapp/
├── cmd/
│   └── server/
│       └── main.go         # outermost: assembles all rings
├── domain/                 # Entities ring: pure types, no project imports
│   └── note.go
├── usecase/                # Use Cases ring: application logic and port interfaces
│   ├── save_note.go
│   └── save_note_test.go   # tested without any infrastructure
├── adapter/                # Interface Adapters ring: translates between rings
│   ├── http/
│   │   └── note.go         # HTTP → use case
│   └── postgres/
│       └── note.go         # use case port → PostgreSQL
└── infrastructure/         # Frameworks & Drivers ring: sql.DB, server config
    └── db.go
```

The Dependency Rule in package terms: `domain` imports nothing from this project. `usecase` imports `domain`. `adapter/*` imports `usecase` ports. `infrastructure` imports only third-party drivers. `cmd/server` imports everything and assembles the application. Any import that crosses inward-to-outward breaks the guarantee.

The inward dependency rule answers a specific question: "why can't my domain type import `database/sql`?" Because the domain is the core asset, and the infrastructure is the variable. Today it's PostgreSQL but 12 months from now it might not be. The rule structurally prevents the infrastructure from becoming load-bearing — so you can change it without breaking the domain. If you're not protecting something that genuinely needs to outlast its infrastructure, the rings are overhead.

## When to Use

- You're building a long-lived service where the domain rules are the core asset and need to outlast infrastructure choices.
- Your delivery mechanism is a variable, not a constant — adding gRPC, a CLI, or a background worker shouldn't require touching domain rules. The inward dependency rule structurally enforces that independence.
- The domain is complex enough to justify the structure: multiple aggregates, non-trivial invariants, rules that change independently of infrastructure.
- You need to test use cases without starting any infrastructure, and that testability is a real requirement not a nice-to-have.

## When Not to Use

- Simple CRUD services with little or no domain logic. The layers add ceremony without payoff.
- Rapid prototypes where the cost of structure outweighs the benefit of isolation.
- Small tools or scripts. Clean Architecture is optimised for change over time, so it's overkill for throwaway code.

## The Decision

The inward dependency rule is the entire point, and the architecture only works if the team enforces it. A single `import "database/sql"` in a use case package silently breaks the concept, and Go's toolchain won't catch it. Data mapping between rings is mechanical but unavoidable: domain types need to be converted to DTOs for the HTTP response, to row types for the database, and back again, which adds boilerplate even for small features. 

In older Go codebases without generics, many small interfaces and converter functions compound this cost. The payoff arrives when you add a second delivery mechanism (gRPC, a worker, a CLI) without touching any domain code, or when you swap a database by replacing one adapter package. If you never do either of those things, the pattern is overhead.

## Related Patterns

- **Hexagonal Architecture:** Same goals, different vocabulary. Clean Architecture uses "concentric rings," Hexagonal uses "ports and adapters." Use whichever model helps your team enforce the inward dependency rule. They work well together, and many codebases use both terms interchangeably.
- **Layered Architecture:** Clean Architecture is a stricter version of layered thinking. Layered gives you the tier structure, while Clean Architecture adds an explicit Dependency Rule and forbids inner rings from naming outer ones. Reach for it when you need that rule to hold under pressure.
- **Repository:** Repository is the idiomatic Go implementation of the persistence port in Clean Architecture's Use Case ring. The interface belongs in Use Cases, the SQL implementation belongs in the outermost Frameworks and Drivers ring, and the inward dependency rule tells you exactly where each piece lives.
- **Domain-Driven Design:** Clean Architecture's Entity ring maps directly to DDD's domain model. The two pair naturally: DDD gives you the modeling discipline for what belongs in the inner rings, and Clean Architecture gives you the structural rule that keeps it there.
