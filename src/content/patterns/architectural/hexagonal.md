---
title: "Hexagonal Architecture"
category: architectural
intent: "Place business logic at the centre, define ports (interfaces) for everything the application drives or is driven by, and provide adapters that connect the outside world to those ports."
idiomSummary: "Driving ports as use-case interfaces called by HTTP handlers; driven ports as repository and notifier interfaces implemented by DB and queue adapters."
relatedSlugs: ["clean-architecture", "layered", "repository"]
tags: [interfaces, dependency-inversion, testability, composition]
isFeatured: true
---

# Hexagonal Architecture

Hexagonal Architecture solves a testability and flexibility problem: when HTTP handlers, SQL queries, and SMTP calls are mixed into business logic, testing requires live infrastructure. Hexagonal draws a boundary. Everything inside is pure application logic, and everything outside (HTTP, databases, queues, email) is an adapter that plugs in through a defined port (interface).

The core vocabulary matters here: **driving adapters** (HTTP handlers, CLI, tests) call **driving ports** (the application's API), while the application calls **driven ports** (repository, notifier interfaces) implemented by **driven adapters** (Postgres, SMTP, in-memory fakes). The application never imports the adapters directly.

## Problem

Your service has an HTTP handler that calls a service that calls `sql.DB` directly. Adding a CLI interface means duplicating the service call setup. Testing requires a live HTTP server and a live database. Switching the message queue means touching business logic. The application has no stable center, so it grows in all directions at once.

```go
// Everything coupled to concrete infrastructure
func handleTransfer(w http.ResponseWriter, r *http.Request) {
    var req TransferRequest
    json.NewDecoder(r.Body).Decode(&req)

    // Direct SQL, can't swap this out
    _, err := db.Exec("UPDATE accounts SET balance = balance - $1 WHERE id = $2", req.Amount, req.From)
    if err != nil { /* ... */ }
    db.Exec("UPDATE accounts SET balance = balance + $1 WHERE id = $2", req.Amount, req.To)

    // Direct SMTP, can't test without a mail server
    smtp.SendMail("...", req.Email, "Transfer complete")
}
```

## Solution

Draw a hexagon. The application (business logic) lives inside. Ports are the sides of the hexagon: interfaces the application defines. Adapters live outside and plug into those ports.

```
          ┌──── Driving Adapters ────┐
          │  HTTP Handler            │
          │  gRPC Handler   ─────────┼──► [Port: TransferService]
          │  CLI             ────────┤         │
          └──────────────────────────┘    ┌────┴────────────┐
                                          │  Application    │
          ┌──── Driven Adapters ─────┐    │  (business      │
          │  PostgresAccountRepo     │    │   logic)        │
          │  InMemoryAccountRepo ────┼────┤                 │
          │  SMTPMailer      ────────┼────┤  defines ports  │
          │  FakeMailer              │    └─────────────────┘
          └──────────────────────────┘
```

**Left (driving) ports:** interfaces the application exposes *to* be driven. Adapters call them.
**Right (driven) ports:** interfaces the application uses to *drive* infrastructure. Adapters implement them.

Define the application core with its driven ports:

```go
// app/transfer.go
package app

import (
    "context"
    "fmt"
)

// Driven ports — defined here and implemented by infrastructure adapters.
type AccountRepository interface {
    FindByID(ctx context.Context, id string) (*Account, error)
    Save(ctx context.Context, a *Account) error
}

type Notifier interface {
    NotifyTransfer(ctx context.Context, email string, amount int64) error
}

type Account struct {
    ID      string
    Email   string
    Balance int64
}

// TransferService is the driving port — what callers interact with.
type TransferService struct {
    accounts AccountRepository
    notifier Notifier
}

func NewTransferService(accounts AccountRepository, notifier Notifier) *TransferService {
    return &TransferService{accounts: accounts, notifier: notifier}
}

func (s *TransferService) Transfer(ctx context.Context, fromID, toID string, amount int64) error {
    from, err := s.accounts.FindByID(ctx, fromID)
    if err != nil {
        return fmt.Errorf("from account: %w", err)
    }
    to, err := s.accounts.FindByID(ctx, toID)
    if err != nil {
        return fmt.Errorf("to account: %w", err)
    }
    if from.Balance < amount {
        return fmt.Errorf("insufficient funds: have %d, need %d", from.Balance, amount)
    }
    from.Balance -= amount
    to.Balance += amount
    if err := s.accounts.Save(ctx, from); err != nil {
        return fmt.Errorf("saving from account: %w", err)
    }
    if err := s.accounts.Save(ctx, to); err != nil {
        return fmt.Errorf("saving to account: %w", err)
    }
    s.notifier.NotifyTransfer(ctx, from.Email, amount)
    return nil
}
```

Left adapter (HTTP driving the application):

```go
// adapter/http/transfer_handler.go
package httpadapter

import (
    "encoding/json"
    "myapp/app"
    "net/http"
)

type TransferHandler struct {
    svc *app.TransferService
}

func (h *TransferHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    var req struct {
        From   string `json:"from"`
        To     string `json:"to"`
        Amount int64  `json:"amount"`
    }
    json.NewDecoder(r.Body).Decode(&req)
    if err := h.svc.Transfer(r.Context(), req.From, req.To, req.Amount); err != nil {
        http.Error(w, err.Error(), 422)
        return
    }
    w.WriteHeader(200)
}
```

Right adapter (PostgreSQL implementing AccountRepository):

```go
// adapter/postgres/account_repo.go
package postgres

import (
    "context"
    "database/sql"
    "myapp/app"
)

type AccountRepo struct{ db *sql.DB }

func (r *AccountRepo) FindByID(ctx context.Context, id string) (*app.Account, error) {
    var a app.Account
    err := r.db.QueryRowContext(ctx,
        "SELECT id, email, balance FROM accounts WHERE id = $1", id,
    ).Scan(&a.ID, &a.Email, &a.Balance)
    return &a, err
}

func (r *AccountRepo) Save(ctx context.Context, a *app.Account) error {
    _, err := r.db.ExecContext(ctx,
        "UPDATE accounts SET balance = $1 WHERE id = $2", a.Balance, a.ID,
    )
    return err
}
```

Right adapter (in-memory fake for tests):

```go
// adapter/memory/account_repo.go
package memory

import (
    "context"
    "fmt"
    "myapp/app"
    "sync"
)

type AccountRepo struct {
    mu       sync.RWMutex
    accounts map[string]*app.Account
}

func NewAccountRepo(accounts ...*app.Account) *AccountRepo {
    m := make(map[string]*app.Account, len(accounts))
    for _, a := range accounts {
        m[a.ID] = a
    }
    return &AccountRepo{accounts: m}
}

func (r *AccountRepo) FindByID(_ context.Context, id string) (*app.Account, error) {
    r.mu.RLock()
    defer r.mu.RUnlock()
    a, ok := r.accounts[id]
    if !ok {
        return nil, fmt.Errorf("account %s not found", id)
    }
    return a, nil
}

func (r *AccountRepo) Save(_ context.Context, a *app.Account) error {
    r.mu.Lock()
    defer r.mu.Unlock()
    r.accounts[a.ID] = a
    return nil
}
```

Test the application core with no infrastructure:

```go
// app/transfer_test.go
package app_test

import (
    "context"
    "myapp/adapter/memory"
    "myapp/app"
    "testing"
)

type fakeNotifier struct{}

func (f *fakeNotifier) NotifyTransfer(_ context.Context, _ string, _ int64) error { return nil }

func TestTransfer(t *testing.T) {
    accounts := memory.NewAccountRepo(
        &app.Account{ID: "alice", Email: "alice@example.com", Balance: 1000},
        &app.Account{ID: "bob",   Email: "bob@example.com",   Balance: 500},
    )
    svc := app.NewTransferService(accounts, &fakeNotifier{})

    if err := svc.Transfer(context.Background(), "alice", "bob", 300); err != nil {
        t.Fatal(err)
    }
    alice, _ := accounts.FindByID(context.Background(), "alice")
    if alice.Balance != 700 {
        t.Errorf("alice balance = %d, want 700", alice.Balance)
    }
}
```

## When to Use

- Your application needs to support multiple delivery mechanisms (HTTP, gRPC, CLI, event consumers) against the same business logic.
- You want to test the full application core, including orchestration, without any real infrastructure.
- Infrastructure is likely to change (new message queue, different database).
- You're building a long-lived service where the domain is the primary asset.

## When Not to Use

- Simple CRUD with no real domain logic. The port/adapter indirection adds overhead with no return.
- Small services where one HTTP handler → one SQL query is the entire pattern. Don't pre-optimise for a complexity that may never arrive.

## Tradeoffs

The core benefit is that the application is fully testable without infrastructure: swap any driven adapter for an in-memory fake and run the full application logic with no network or database. This advantage is real but only pays back if you actually write those tests. The structure alone doesn't guarantee test coverage. Port proliferation is the main ongoing cost: many small interfaces per aggregate can become verbose, especially when every aggregate needs a distinct repository port. Mapping between adapter types and application types (protobuf structs to domain structs, SQL rows to domain structs) is mechanical but necessary, and it compounds as the model grows. New team members need to learn the port/adapter mental model before they can navigate the codebase efficiently.

## Related Patterns

- **Clean Architecture:** Same goals, different vocabulary. It uses "concentric rings" where Hexagonal uses "ports and adapters." Use whichever model helps your team enforce the inward dependency rule most clearly. They compose more often than they compete.
- **Adapter (structural):** The GoF Adapter pattern is the mechanism that makes Hexagonal work. Each infrastructure adapter wraps a third-party client (a `*sql.DB`, a NATS connection) and exposes the interface the application defined. Hexagonal is the architecture; Adapter is the implementation technique.
- **Layered Architecture:** Layered organizes by tier (Handler, Service, Repository, Infrastructure). Hexagonal replaces strict downward layering with symmetric ports that treat HTTP and databases as equally swappable adapters.
- **Repository:** The canonical driven port. It's a persistence interface the application defines, implemented by a database adapter that the application never imports directly.
- **Domain-Driven Design:** DDD's aggregate roots become the application core that hexagonal protects. DDD tells you what should live inside the hexagon; Hexagonal gives you the structural rule for keeping infrastructure out.
