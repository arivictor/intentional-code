---
title: "CQRS"
description: "Separate the model used for writing state (Commands) from the model used for reading it (Queries), allowing each side to be optimised independently."
---

# CQRS

CQRS (Command Query Responsibility Segregation) separates every operation into one of two kinds: commands (mutate state, return nothing or an error) and queries (read state, return data, change nothing). The main reason is that read and write models want different shapes. Commands need rich domain validation, while queries usually want flat, denormalised views. Force one model to serve both jobs and you'll usually end up with either an anemic domain or bloated query results.

Each command and query gets its own handler type, its own input struct, and sometimes its own data store when the workloads diverge far enough.

## Scenario

A single `NoteService` handles both writes and reads. The `GetNote` method returns the full domain struct, which exposes internal state. The `CreateNote` and `GetNoteSummary` methods share the same repository, so optimising the read path requires touching the write path too. Every new read shape requires a new method on the same service.

```go
// One service doing everything — reads and writes entangled
type NoteService struct {
    repo NoteRepository
}

func (s *NoteService) CreateNote(ctx context.Context, title, body string) error {
    // mutates state
}

func (s *NoteService) GetNote(ctx context.Context, id string) (*Note, error) {
    // returns full domain object, exposes internals
}

func (s *NoteService) GetNoteSummary(ctx context.Context, id string) (*NoteSummary, error) {
    // different read shape, service now has two query methods with different return types
}
```

## Solution

Separate every operation into a command or a query. Commands mutate; queries read. Each has its own handler.

```
┌─────────────────────────────────────────────────────────┐
│                      Client                             │
└─────────┬──────────────────────────┬────────────────────┘
          │ Commands                 │ Queries
          ▼                          ▼
┌──────────────────┐      ┌────────────────────────────┐
│  Command Handler │      │      Query Handler         │
│  (mutate, err)   │      │  (read, return DTO)        │
└────────┬─────────┘      └────────────┬───────────────┘
         │                             │
         ▼                             ▼
┌──────────────────┐      ┌─────────────────────────────┐
│   Write Store    │      │       Read Store            │
│  (normalised DB) │      │  (same DB or read replica,  │
│                  │      │   denormalised views, etc.) │
└──────────────────┘      └─────────────────────────────┘
```

Define commands and queries as plain structs:

```go
// command/create_note.go
package command

import (
    "context"
    "fmt"
    "time"
)

type Note struct {
    ID        string
    Title     string
    Body      string
    CreatedAt time.Time
}

type NoteRepository interface {
    Save(ctx context.Context, n *Note) error
}

type CreateNote struct {
    ID    string
    Title string
    Body  string
}

type CreateNoteHandler struct {
    repo NoteRepository
}

func NewCreateNoteHandler(repo NoteRepository) *CreateNoteHandler {
    return &CreateNoteHandler{repo: repo}
}

func (h *CreateNoteHandler) Handle(ctx context.Context, cmd CreateNote) error {
    if cmd.Title == "" {
        return fmt.Errorf("title is required")
    }
    n := &Note{
        ID:        cmd.ID,
        Title:     cmd.Title,
        Body:      cmd.Body,
        CreatedAt: time.Now(),
    }
    return h.repo.Save(ctx, n)
}
```

```go
// command/update_note.go
package command

import (
    "context"
    "fmt"
)

type NoteReader interface {
    FindByID(ctx context.Context, id string) (*Note, error)
}

type NoteWriter interface {
    NoteReader
    Save(ctx context.Context, n *Note) error
}

type UpdateNote struct {
    ID   string
    Body string
}

type UpdateNoteHandler struct {
    repo NoteWriter
}

func NewUpdateNoteHandler(repo NoteWriter) *UpdateNoteHandler {
    return &UpdateNoteHandler{repo: repo}
}

func (h *UpdateNoteHandler) Handle(ctx context.Context, cmd UpdateNote) error {
    n, err := h.repo.FindByID(ctx, cmd.ID)
    if err != nil {
        return fmt.Errorf("finding note: %w", err)
    }
    n.Body = cmd.Body
    return h.repo.Save(ctx, n)
}
```

Queries return purpose-built DTOs, not domain objects:

```go
// query/get_note.go
package query

import "context"

// NoteView is a read-optimised projection, not the domain type.
type NoteView struct {
    ID        string
    Title     string
    Preview   string // first 100 chars of body
    WordCount int
}

type NoteSummary struct {
    ID    string
    Title string
}

type NoteReadStore interface {
    FindByID(ctx context.Context, id string) (*NoteView, error)
    List(ctx context.Context) ([]NoteSummary, error)
}

type GetNoteHandler struct {
    store NoteReadStore
}

func NewGetNoteHandler(store NoteReadStore) *GetNoteHandler {
    return &GetNoteHandler{store: store}
}

func (h *GetNoteHandler) Handle(ctx context.Context, id string) (*NoteView, error) {
    return h.store.FindByID(ctx, id)
}

type ListNotesHandler struct {
    store NoteReadStore
}

func NewListNotesHandler(store NoteReadStore) *ListNotesHandler {
    return &ListNotesHandler{store: store}
}

func (h *ListNotesHandler) Handle(ctx context.Context) ([]NoteSummary, error) {
    return h.store.List(ctx)
}
```

The read store can be the same database with a purpose-built query or a separate projection:

```go
// infra/postgres/note_read_store.go
package postgres

import (
    "context"
    "database/sql"
    "myapp/query"
)

type NoteReadStore struct{ db *sql.DB }

func (s *NoteReadStore) FindByID(ctx context.Context, id string) (*query.NoteView, error) {
    var v query.NoteView
    err := s.db.QueryRowContext(ctx, `
        SELECT id, title,
               LEFT(body, 100)                 AS preview,
               array_length(string_to_array(trim(body), ' '), 1) AS word_count
        FROM notes
        WHERE id = $1
    `, id).Scan(&v.ID, &v.Title, &v.Preview, &v.WordCount)
    return &v, err
}

func (s *NoteReadStore) List(ctx context.Context) ([]query.NoteSummary, error) {
    rows, err := s.db.QueryContext(ctx,
        "SELECT id, title FROM notes ORDER BY created_at DESC",
    )
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    var result []query.NoteSummary
    for rows.Next() {
        var s query.NoteSummary
        rows.Scan(&s.ID, &s.Title)
        result = append(result, s)
    }
    return result, rows.Err()
}
```

Wire it up in the HTTP layer, where commands and queries have separate endpoints:

```go
// adapter/http/note_handler.go
package httpadapter

import (
    "encoding/json"
    "myapp/command"
    "myapp/query"
    "net/http"
)

type NoteHandler struct {
    createNote *command.CreateNoteHandler
    updateNote *command.UpdateNoteHandler
    getNote    *query.GetNoteHandler
    listNotes  *query.ListNotesHandler
}

func (h *NoteHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req struct {
        ID    string `json:"id"`
        Title string `json:"title"`
        Body  string `json:"body"`
    }
    json.NewDecoder(r.Body).Decode(&req)
    if err := h.createNote.Handle(r.Context(), command.CreateNote{
        ID:    req.ID,
        Title: req.Title,
        Body:  req.Body,
    }); err != nil {
        http.Error(w, err.Error(), 422)
        return
    }
    w.WriteHeader(201)
}

func (h *NoteHandler) Get(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    view, err := h.getNote.Handle(r.Context(), id)
    if err != nil {
        http.Error(w, err.Error(), 404)
        return
    }
    json.NewEncoder(w).Encode(view)
}
```

Here's the core idea as one runnable program — a command that mutates and returns only an error, and a query that returns a read-optimised projection:

```go:title="main.go":run=true
package main

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// --- Write side: domain type + command handler ---

type Note struct {
	ID        string
	Title     string
	Body      string
	CreatedAt time.Time
}

type NoteStore struct {
	mu    sync.RWMutex
	notes map[string]*Note
}

func NewNoteStore() *NoteStore {
	return &NoteStore{notes: make(map[string]*Note)}
}

func (s *NoteStore) Save(_ context.Context, n *Note) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.notes[n.ID] = n
	return nil
}

type CreateNote struct {
	ID    string
	Title string
	Body  string
}

type CreateNoteHandler struct{ store *NoteStore }

func (h *CreateNoteHandler) Handle(ctx context.Context, cmd CreateNote) error {
	if cmd.Title == "" {
		return fmt.Errorf("title is required")
	}
	return h.store.Save(ctx, &Note{
		ID:        cmd.ID,
		Title:     cmd.Title,
		Body:      cmd.Body,
		CreatedAt: time.Now(),
	})
}

// --- Read side: purpose-built projection, not the domain type ---

type NoteView struct {
	ID        string
	Title     string
	Preview   string
	WordCount int
}

type GetNoteHandler struct{ store *NoteStore }

func (h *GetNoteHandler) Handle(_ context.Context, id string) (*NoteView, error) {
	h.store.mu.RLock()
	defer h.store.mu.RUnlock()
	n, ok := h.store.notes[id]
	if !ok {
		return nil, fmt.Errorf("note %s not found", id)
	}
	preview := n.Body
	if len(preview) > 20 {
		preview = preview[:20]
	}
	words := 0
	inWord := false
	for _, r := range n.Body {
		if r == ' ' {
			inWord = false
		} else if !inWord {
			inWord = true
			words++
		}
	}
	return &NoteView{ID: n.ID, Title: n.Title, Preview: preview, WordCount: words}, nil
}

func main() {
	ctx := context.Background()
	store := NewNoteStore()
	create := &CreateNoteHandler{store: store}
	get := &GetNoteHandler{store: store}

	// Command: mutate, return only an error.
	if err := create.Handle(ctx, CreateNote{ID: "n1", Title: "Hello", Body: "the quick brown fox jumps"}); err != nil {
		fmt.Println("error:", err)
		return
	}

	// Query: read, return a read-optimised view.
	view, err := get.Handle(ctx, "n1")
	if err != nil {
		fmt.Println("error:", err)
		return
	}
	fmt.Printf("view: id=%s title=%q preview=%q words=%d\n", view.ID, view.Title, view.Preview, view.WordCount)

	// Command rejects invalid input via write-side validation.
	if err := create.Handle(ctx, CreateNote{ID: "n2", Title: ""}); err != nil {
		fmt.Println("command rejected:", err)
	}
}
```

```
// Output:
// view: id=n1 title="Hello" preview="the quick brown fox " words=5
// command rejected: title is required
```

## Handling Eventual Consistency

When the read store is a separate projection updated asynchronously, a user who just submitted a command may query immediately and receive the old state. This surprises users who expect to see their own write reflected at once. Three strategies address this:

**Optimistic UI:** Display the expected outcome in the UI immediately based on the command, without re-querying the server. Sync from the server on the next natural refresh. No server-side changes needed; works well when the UI can confidently predict the new state.

**Read-from-write store:** For the actor's own recent changes, bypass the read store and query the write store directly for a short window after the command. Other users still get the eventually consistent projection. Simple to implement; adds load to the write store.

**Version-aware query:** The command returns a version number; the query handler waits until the projection has caught up to that version before returning:

```go
// command result includes the write version
type CreateNoteResult struct {
    NoteID  string
    Version int
}

// query handler accepts a minimum version and retries until caught up
func (h *GetNoteHandler) HandleAtVersion(ctx context.Context, id string, minVersion int) (*NoteView, error) {
    deadline := time.Now().Add(2 * time.Second)
    for {
        view, err := h.store.FindByID(ctx, id)
        if err != nil {
            return nil, err
        }
        if view.Version >= minVersion {
            return view, nil
        }
        if time.Now().After(deadline) {
            return view, nil // return what we have; don't block indefinitely
        }
        time.Sleep(20 * time.Millisecond)
    }
}
```

The version-aware approach requires the projection to store and expose a version number. It is the most consistent of the three strategies but adds complexity and a short blocking window. For most applications, optimistic UI is the right starting point; users already understand that submitted changes take a moment to appear.

## When to Use

- The model that enforces your write invariants (rich aggregate, domain validation) can't also serve your reads efficiently (flat projections, denormalised lists). Forcing one model to do both degrades each.
- The domain is complex and the write side needs a rich aggregate model, but the read side only needs purpose-built DTOs that bypass domain logic entirely.
- Reads and writes need to scale independently — read replicas and caching layers can serve the query side without touching the command side.
- Different teams own the read path and the write path and need to evolve them independently.

## When Not to Use

- Simple CRUD. CQRS adds two handler types, two store interfaces, and two data shapes where one would do.
- The read and write models are identical, so there are no distinct query shapes or read optimizations to justify the split.
- The team is small and the added structure costs more than it returns.

## The Decision

CQRS is useful when your write model and read model need different shapes. Your write side needs strict rules and full business logic. Your read side usually needs simple, flattened data for screens and lists.

If you use one model for both, you get problems:
- the write model becomes messy with read-only fields, or
- the read side exposes internal domain details.

So CQRS splits them on purpose. It is mainly about solving this model mismatch, not about making the system “more scalable.” but the most immediate cost is volume: each operation gets its own struct and handler, so a ten-operation service becomes closer to twenty files. The split pays back through independent evolution. You can add a new query shape or optimise a read projection without touching the write model, but that dividend arrives only with enough operations to make the separation feel natural rather than forced. 

Eventual consistency is the non-obvious danger: if the read store is a separate projection updated asynchronously, queries may return stale data until it catches up, and this surprises users who expect to see their own write immediately. Even with a shared database, the separation doubles the integration test surface because both command handlers and query handlers need coverage.

## Related Patterns

- **Event-Driven Architecture:** Commands naturally emit Domain Events that update read-side projections asynchronously. CQRS and event-driven systems fit together well, but CQRS does not require them. A single database with separate read and write models is enough to get started.
- **Domain-Driven Design:** Pairs naturally with DDD. The command side uses the rich aggregate model with enforced invariants, while the query side uses flat DTOs that bypass the domain model for read performance.
- **Hexagonal Architecture:** Command and query handlers are driving ports called by HTTP or queue adapters. Write and read stores are driven ports implemented by database adapters.
- **Clean Architecture:** Commands map to Use Cases in the inner ring, while queries can bypass the domain model and read directly from the store. The Dependency Rule still applies to both sides.
- **Repository:** The write side of CQRS typically uses a Repository for its write store, while the read side often uses a lighter read store interface that returns projections rather than aggregates.
