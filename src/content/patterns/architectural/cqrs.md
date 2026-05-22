---
title: "CQRS"
category: architectural
intent: "Separate the model used for writing state (Commands) from the model used for reading it (Queries), allowing each side to be optimised independently."
idiomSummary: "Command handler functions that accept a command struct and return an error; query functions that accept filter params and return read-model DTOs."
relatedSlugs: ["event-driven", "domain-driven-design", "repository"]
tags: [interfaces, dependency-inversion, distributed, events]
---

# CQRS

CQRS (Command Query Responsibility Segregation) separates every operation into one of two kinds: commands (mutate state, return nothing or an error) and queries (read state, return data, change nothing). The core insight is that read and write models want different shapes. Commands need rich domain validation, while queries usually want flat, denormalized views. Force one model to serve both jobs and you'll usually end up with either an anemic domain or bloated query results.

Each command and query gets its own handler type, its own input struct, and sometimes its own data store when the workloads diverge far enough.

## Problem

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
┌──────────────────┐      ┌───────────────────────────┐
│  Command Handler │      │      Query Handler         │
│  (mutate, err)   │      │  (read, return DTO)        │
└────────┬─────────┘      └────────────┬───────────────┘
         │                             │
         ▼                             ▼
┌──────────────────┐      ┌───────────────────────────┐
│   Write Store    │      │       Read Store           │
│  (normalised DB) │      │  (same DB or read replica, │
│                  │      │   denormalised views, etc.) │
└──────────────────┘      └───────────────────────────┘
```

The following is a single runnable file with command handlers, query handlers, and an in-memory store:

```go
package main

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

// --- Write model (command side) ---

type Note struct {
	ID        string
	Title     string
	Body      string
	CreatedAt time.Time
}

// NoteWriteStore is used by command handlers.
type NoteWriteStore interface {
	Save(ctx context.Context, n *Note) error
	FindByID(ctx context.Context, id string) (*Note, error)
}

type CreateNote struct {
	ID    string
	Title string
	Body  string
}

type CreateNoteHandler struct {
	store NoteWriteStore
}

func NewCreateNoteHandler(store NoteWriteStore) *CreateNoteHandler {
	return &CreateNoteHandler{store: store}
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
	return h.store.Save(ctx, n)
}

type UpdateNote struct {
	ID   string
	Body string
}

type UpdateNoteHandler struct {
	store NoteWriteStore
}

func NewUpdateNoteHandler(store NoteWriteStore) *UpdateNoteHandler {
	return &UpdateNoteHandler{store: store}
}

func (h *UpdateNoteHandler) Handle(ctx context.Context, cmd UpdateNote) error {
	n, err := h.store.FindByID(ctx, cmd.ID)
	if err != nil {
		return fmt.Errorf("finding note: %w", err)
	}
	n.Body = cmd.Body
	return h.store.Save(ctx, n)
}

// --- Read model (query side) — purpose-built DTOs, not domain objects ---

// NoteView is a read-optimized projection.
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

// NoteReadStore is used by query handlers.
type NoteReadStore interface {
	FindByID(ctx context.Context, id string) (*NoteView, error)
	List(ctx context.Context) ([]NoteSummary, error)
}

type GetNoteHandler struct {
	store NoteReadStore
}

func (h *GetNoteHandler) Handle(ctx context.Context, id string) (*NoteView, error) {
	return h.store.FindByID(ctx, id)
}

type ListNotesHandler struct {
	store NoteReadStore
}

func (h *ListNotesHandler) Handle(ctx context.Context) ([]NoteSummary, error) {
	return h.store.List(ctx)
}

// --- In-memory store implementing both write and read sides ---

type MemNoteStore struct {
	mu    sync.RWMutex
	notes map[string]*Note
}

func NewMemNoteStore() *MemNoteStore {
	return &MemNoteStore{notes: make(map[string]*Note)}
}

func (s *MemNoteStore) Save(_ context.Context, n *Note) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.notes[n.ID] = n
	return nil
}

func (s *MemNoteStore) FindByID(_ context.Context, id string) (*Note, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	n, ok := s.notes[id]
	if !ok {
		return nil, fmt.Errorf("note %s not found", id)
	}
	return n, nil
}

func (s *MemNoteStore) FindByIDView(_ context.Context, id string) (*NoteView, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	n, ok := s.notes[id]
	if !ok {
		return nil, fmt.Errorf("note %s not found", id)
	}
	preview := n.Body
	if len(preview) > 100 {
		preview = preview[:100]
	}
	return &NoteView{
		ID:        n.ID,
		Title:     n.Title,
		Preview:   preview,
		WordCount: len(strings.Fields(n.Body)),
	}, nil
}

func (s *MemNoteStore) ListSummaries(_ context.Context) ([]NoteSummary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []NoteSummary
	for _, n := range s.notes {
		result = append(result, NoteSummary{ID: n.ID, Title: n.Title})
	}
	return result, nil
}

// readAdapter wraps MemNoteStore to satisfy NoteReadStore.
type readAdapter struct{ s *MemNoteStore }

func (a *readAdapter) FindByID(ctx context.Context, id string) (*NoteView, error) {
	return a.s.FindByIDView(ctx, id)
}
func (a *readAdapter) List(ctx context.Context) ([]NoteSummary, error) {
	return a.s.ListSummaries(ctx)
}

func main() {
	ctx := context.Background()

	store := NewMemNoteStore()
	read := &readAdapter{store}

	createNote := NewCreateNoteHandler(store)
	updateNote := NewUpdateNoteHandler(store)
	getNote := &GetNoteHandler{store: read}
	listNotes := &ListNotesHandler{store: read}

	// Command: create
	if err := createNote.Handle(ctx, CreateNote{ID: "n1", Title: "Hello CQRS", Body: "Write model handles commands"}); err != nil {
		fmt.Println("create error:", err)
		return
	}

	// Command: update
	if err := updateNote.Handle(ctx, UpdateNote{ID: "n1", Body: "Updated body text here"}); err != nil {
		fmt.Println("update error:", err)
		return
	}

	// Query: get by ID (read model returns a projection)
	view, err := getNote.Handle(ctx, "n1")
	if err != nil {
		fmt.Println("get error:", err)
		return
	}
	fmt.Printf("note %s: title=%q preview=%q words=%d\n", view.ID, view.Title, view.Preview, view.WordCount)

	// Query: list
	summaries, _ := listNotes.Handle(ctx)
	for _, s := range summaries {
		fmt.Printf("summary: %s – %s\n", s.ID, s.Title)
	}

	// Command validation
	if err := createNote.Handle(ctx, CreateNote{ID: "n2", Title: ""}); err != nil {
		fmt.Println("validation:", err)
	}
}
```

```
// Output:
// note n1: title="Hello CQRS" preview="Updated body text here" words=4
// summary: n1 – Hello CQRS
// validation: title is required
```

The PostgreSQL read store (requires a real DB) would implement `NoteReadStore` with purpose-built SQL projections:

```go
// Illustrative only — requires a real PostgreSQL connection to run.
// infra/postgres/note_read_store.go
//
// func (s *NoteReadStore) FindByID(ctx context.Context, id string) (*NoteView, error) {
//     var v NoteView
//     err := s.db.QueryRowContext(ctx, `
//         SELECT id, title,
//                LEFT(body, 100)    AS preview,
//                array_length(string_to_array(trim(body), ' '), 1) AS word_count
//         FROM notes WHERE id = $1
//     `, id).Scan(&v.ID, &v.Title, &v.Preview, &v.WordCount)
//     return &v, err
// }
```

## Handling Eventual Consistency

When the read store is a separate projection updated asynchronously, a user who just submitted a command may query immediately and receive the old state. This surprises users who expect to see their own write reflected at once. Three strategies address this:

**Optimistic UI** — Display the expected outcome in the UI immediately based on the command, without re-querying the server. Sync from the server on the next natural refresh. No server-side changes needed; works well when the UI can confidently predict the new state.

**Read-from-write store** — For the actor's own recent changes, bypass the read store and query the write store directly for a short window after the command. Other users still get the eventually consistent projection. Simple to implement; adds load to the write store.

**Version-aware query** — The command returns a version number; the query handler waits until the projection has caught up to that version before returning:

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

The version-aware approach requires the projection to store and expose a version number. It is the most consistent of the three strategies but adds complexity and a short blocking window. For most applications, optimistic UI is the right starting point — users already understand that submitted changes take a moment to appear.

## When to Use

- Read and write workloads have different performance profiles, and queries need denormalized views or aggregations that don't fit the write model.
- The domain is complex and the write side needs a rich model, but the read side only needs flat projections.
- You want to scale reads and writes independently (read replicas, caching layers).
- Different teams own the read path and the write path.

## When Not to Use

- Simple CRUD. CQRS adds two handler types, two store interfaces, and two data shapes where one would do.
- The read and write models are identical, so there are no distinct query shapes or read optimizations to justify the split.
- The team is small and the added structure costs more than it returns.

## Tradeoffs

The most immediate cost is volume: each operation gets its own struct and handler, so a ten-operation service becomes closer to twenty files. The split pays back through independent evolution — you can add a new query shape or optimize a read projection without touching the write model — but that dividend arrives only with enough operations to make the separation feel natural rather than forced. Eventual consistency is the non-obvious danger: if the read store is a separate projection updated asynchronously, queries may return stale data until it catches up, and this surprises users who expect to see their own write immediately. Even with a shared database, the separation doubles the integration test surface because both command handlers and query handlers need coverage.

## Related Patterns

- **Event-Driven Architecture** — Commands naturally emit Domain Events that update read-side projections asynchronously. CQRS and event-driven systems fit together well, but CQRS does not require them. A single database with separate read and write models is enough to get started.
- **Domain-Driven Design** — Pairs naturally with DDD. The command side uses the rich aggregate model with enforced invariants, while the query side uses flat DTOs that bypass the domain model for read performance.
- **Hexagonal Architecture** — Command and query handlers are driving ports called by HTTP or queue adapters. Write and read stores are driven ports implemented by database adapters.
- **Clean Architecture** — Commands map to Use Cases in the inner ring, while queries can bypass the domain model and read directly from the store. The Dependency Rule still applies to both sides.
- **Repository** — The write side of CQRS typically uses a Repository for its write store, while the read side often uses a lighter read store interface that returns projections rather than aggregates.
