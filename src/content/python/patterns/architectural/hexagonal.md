---
title: "Hexagonal Architecture"
category: architectural
intent: "Place business logic at the centre, define ports (interfaces) for everything the application drives or is driven by, and provide adapters that connect the outside world to those ports."
idiomSummary: "Center the domain and connect infrastructure through ports and adapters."
relatedSlugs: ["clean-architecture", "layered", "repository"]
tags: [interfaces, dependency-inversion, testability, composition]
isFeatured: true
---

# Hexagonal Architecture

Hexagonal Architecture solves a testability and flexibility problem: when HTTP handlers, SQL queries, and SMTP calls are mixed into business logic, testing requires live infrastructure. Hexagonal draws a boundary. Everything inside is pure application logic, and everything outside, HTTP, databases, queues, email, is an adapter that plugs in through a defined port (interface).

The core vocabulary matters here: **driving adapters** (HTTP handlers, CLI, tests) call **driving ports** (the application's API), while the application calls **driven ports** (repository, notifier interfaces) implemented by **driven adapters** (Postgres, SMTP, in-memory fakes). The application never imports the adapters directly.

## Problem

Your service has an HTTP handler that calls a service that calls `sql.DB` directly. Adding a CLI interface means duplicating the service call setup. Testing requires a live HTTP server and a live database. Switching the message queue means touching business logic. The application has no stable center, so it grows in all directions at once.

```python
# Everything coupled to concrete infrastructure
def handle_transfer(w, r):
    var req TransferRequest
    json.NewDecoder(r.Body).Decode(&req)

    # Direct SQL, can't swap this out
    _, err := db.Exec("UPDATE accounts SET balance = balance - $1 WHERE id = $2", req.Amount, req.From)
    if err != None : /* ... */
    db.Exec("UPDATE accounts SET balance = balance + $1 WHERE id = $2", req.Amount, req.To)

    # Direct SMTP, can't test without a mail server
    smtp.SendMail("...", req.Email, "Transfer complete")
```

## Solution

Draw a hexagon. The application (business logic) lives inside. Ports are the sides of the hexagon, interfaces the application defines. Adapters live outside and plug into those ports.

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

```python
from typing import Protocol

# app/transfer.py

"context"
"fmt"

# Driven ports, defined here and implemented by infrastructure adapters.
class AccountRepository(Protocol):
    FindByID(ctx context.Context, id string) (*Account, error)
    def save(self, ctx, a): ...

class Notifier(Protocol):
    def notify_transfer(self, ctx, email, amount): ...

class Account:
    id: string
    email: string
    balance: int64

# TransferService is the driving port, what callers interact with.
class TransferService:
    accounts: AccountRepository
    notifier: Notifier

def new_transfer_service(accounts, notifier):
    return &TransferService{accounts: accounts, notifier: notifier

def transfer(self, ctx, from_id, to_id, amount):
    from, err := s.accounts.FindByID(ctx, fromID)
    if err is not None :
        return fmt.Errorf("from account: %w", err)
    to, err := s.accounts.FindByID(ctx, toID)
    if err is not None :
        return fmt.Errorf("to account: %w", err)
    if from.Balance < amount :
        return fmt.Errorf("insufficient funds: have %d, need %d", from.Balance, amount)
    from.Balance -= amount
    to.Balance += amount
    if err := s.accounts.Save(ctx, from); err is not None :
        return fmt.Errorf("saving from account: %w", err)
    if err := s.accounts.Save(ctx, to); err is not None :
        return fmt.Errorf("saving to account: %w", err)
    s.notifier.NotifyTransfer(ctx, from.Email, amount)
    return None
```

Left adapter, HTTP driving the application:

```python
# adapter/http/transfer_handler.py

"encoding/json"
"myapp/app"
"net/http"

class TransferHandler:
    svc: app.TransferService

def serve_http(self, w, r):
    var req struct :
    From   string `json:"from"`
    To     string `json:"to"`
    Amount int64  `json:"amount"`
json.NewDecoder(r.Body).Decode(&req)
if err := h.svc.Transfer(r.Context(), req.From, req.To, req.Amount); err is not None :
    http.Error(w, err.Error(), 422)
    return
w.WriteHeader(200)
```

Right adapter, PostgreSQL implementing AccountRepository:

```python
# adapter/postgres/account_repo.py

"context"
"database/sql"
"myapp/app"

type AccountRepo struct: db *sql.DB

def find_by_id(self, ctx, id):
    var a app.Account
    err = r.db.QueryRowContext(ctx,
    "SELECT id, email, balance FROM accounts WHERE id = $1", id
    ).Scan(&a.ID, &a.Email, &a.Balance)
    return &a, err

def save(self, ctx, a):
    _, err := r.db.ExecContext(ctx
    "UPDATE accounts SET balance = $1 WHERE id = $2", a.Balance, a.ID
    return err
```

Right adapter, in-memory fake for tests:

```python
# adapter/memory/account_repo.py

"context"
"fmt"
"myapp/app"
"sync"

class AccountRepo:
    mu: sync.RWMutex
    accounts: map[string]app.Account

def new_account_repo(accounts):
    m = make(map[string]*app.Account, len(accounts))
    for a in accounts:
        m[a.ID] = a
    return &AccountRepo{accounts: m

def find_by_id(self, _, id):
    r.mu.RLock()
    defer r.mu.RUnlock()
    a, ok := r.accounts[id]
    if !ok :
        return None, fmt.Errorf("account %s not found", id)
    return a, None

def save(self, _, a):
    r.mu.Lock()
    defer r.mu.Unlock()
    r.accounts[a.ID] = a
    return None
```

Test the application core with no infrastructure:

```python
# app/transfer_test.py

"context"
"myapp/adapter/memory"
"myapp/app"
"testing"

class fakeNotifier:
    pass

def notify_transfer(self, _, _, _):
    return None

def test_transfer(t):
    accounts = memory.NewAccountRepo(
    &app.Account:ID: "alice", Email: "alice@example.com", Balance: 1000
    &app.Account:ID: "bob",   Email: "bob@example.com",   Balance: 500
    svc = app.NewTransferService(accounts, fakeNotifier{})

    if err := svc.Transfer(context.Background(), "alice", "bob", 300); err is not None :
        t.Fatal(err)
    alice, _ := accounts.FindByID(context.Background(), "alice")
    if alice.Balance != 700 :
        t.Errorf("alice balance = %d, want 700", alice.Balance)
```

## When to Use

- Your application needs to support multiple delivery mechanisms (HTTP, gRPC, CLI, event consumers) against the same business logic.
- You want to test the full application core, including orchestration, without any real infrastructure.
- Infrastructure is likely to change (new message queue, different database).
- You're building a long-lived service where the domain is the primary asset.

## When Not to Use

- Simple CRUD with no real domain logic. The port/adapter indirection adds overhead with no return.
- Small services where one HTTP handler → one SQL query is the entire pattern. Don't pre-optimise for a complexity that may never arrive.

## Advantages

- The application core is fully tested without infrastructure. Swap any adapter for a fake.
- Delivery mechanisms are symmetric. HTTP, CLI, and queues all call the same driving port.
- Infrastructure is plug-and-play. Add a new adapter without touching the application.
- Clear separation of "what the business does" from "how it communicates with the world."

## Disadvantages

- More structure than simple layering, which means upfront investment in port design.
- Port proliferation: many small interfaces per aggregate can be verbose.
- Mapping between adapter types and application types (e.g., protobuf ↔ domain struct) is mechanical but necessary.
- New team members need to understand the port/adapter mental model before they can be productive.

## Related Patterns

- **Clean Architecture:** Same goals, different vocabulary. It uses "concentric rings" where Hexagonal uses "ports and adapters." Use whichever model helps your team enforce the inward dependency rule most clearly. They compose more often than they compete.
- **Layered Architecture:** Layered organizes by tier (Handler, Service, Repository, Infrastructure). Hexagonal replaces strict downward layering with symmetric ports that treat HTTP and databases as equally swappable adapters.
- **Repository:** The canonical driven port. It's a persistence interface the application defines, implemented by a database adapter that the application never imports directly.
