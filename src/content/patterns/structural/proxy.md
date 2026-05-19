# Proxy

Proxy wraps an object with the same interface to control access to it. The wrapper can add lazy initialization, access control, logging, caching, or remote communication — all without the client knowing it's not talking to the real object.

In Go, Proxy and Decorator look structurally identical (both wrap an interface). The distinction is intent: Decorator adds new behavior; Proxy controls access to existing behavior.

## Problem

You have a database query service that's expensive to initialize and you don't always need it. Some callers also need access control — only admins should be able to run certain queries. You want to delay initialization until the first actual call and enforce permissions, but you don't want to change the service's interface or litter every call site with auth checks.

```go
// eager.go
package db

type QueryService struct {
    conn *Connection // expensive to create
}

func NewQueryService() *QueryService {
    // This connects to the database immediately,
    // even if no queries are ever made.
    conn := Connect("prod-db:5432") // slow, may fail
    return &QueryService{conn: conn}
}

func (s *QueryService) Execute(query string) ([]Row, error) {
    return s.conn.Query(query)
}
```

The service eagerly connects to the database. If the handler path doesn't always need queries, this wastes a connection. And there's no access control — any caller can execute any query.

## Solution

Create a proxy that implements the same interface. It lazily initializes the real service on first use and checks permissions before delegating.

```
┌────────────────────────┐
│    <<interface>>       │
│    QueryRunner         │
│────────────────────────│
│ Execute(q) ([]Row, e)  │
└────────────┬───────────┘
             │ implements
     ┌───────┼───────┐
     │               │
┌────▼────────┐ ┌────▼──────────┐
│QueryService │ │  QueryProxy   │
│ (real)      │ │ (proxy)       │
│             │ │ - lazy init   │
│ Execute()   │ │ - access ctrl │
└─────────────┘ │ Execute()     │
                └───────────────┘
```

```go
// proxy.go
package db

import (
    "fmt"
    "sync"
)

// QueryRunner is the interface both real service and proxy implement.
type QueryRunner interface {
    Execute(query string) ([]string, error)
}

// RealQueryService is the expensive real implementation.
type RealQueryService struct{}

func (s *RealQueryService) Execute(query string) ([]string, error) {
    fmt.Println("[db] Executing:", query)
    return []string{"row1", "row2"}, nil
}

// QueryProxy adds lazy initialization and access control.
type QueryProxy struct {
    real   *RealQueryService
    once   sync.Once
    role   string
}

func NewQueryProxy(role string) *QueryProxy {
    return &QueryProxy{role: role}
}

func (p *QueryProxy) init() {
    fmt.Println("[proxy] Initializing database connection...")
    p.real = &RealQueryService{}
}

func (p *QueryProxy) Execute(query string) ([]string, error) {
    if p.role != "admin" {
        return nil, fmt.Errorf("access denied: role %q cannot execute queries", p.role)
    }

    p.once.Do(p.init)

    fmt.Printf("[proxy] role=%s query=%s\n", p.role, query)

    return p.real.Execute(query)
}
```

```go
// main.go
package main

import (
    "db"
    "fmt"
)

func runQuery(runner db.QueryRunner, query string) {
    rows, err := runner.Execute(query)
    if err != nil {
        fmt.Printf("Error: %v\n", err)
        return
    }
    fmt.Printf("Results: %v\n\n", rows)
}

func main() {
    admin := db.NewQueryProxy("admin")
    viewer := db.NewQueryProxy("viewer")

    runQuery(admin, "SELECT * FROM orders")
    runQuery(admin, "SELECT * FROM users")
    runQuery(viewer, "SELECT * FROM secrets")
}
```

Output:

```
[proxy] role=admin query=SELECT * FROM orders
[proxy] Initializing database connection...
[db] Executing: SELECT * FROM orders
Results: [row1 row2]

[proxy] role=admin query=SELECT * FROM users
[db] Executing: SELECT * FROM users
Results: [row1 row2]

Error: access denied: role "viewer" cannot execute queries
```

## When to Use

- You need lazy initialization — the real object is expensive to create and may not be needed.
- You need access control — check permissions before delegating to the real object.
- You need logging or caching around an interface without modifying the implementation.
- You want a local representative for a remote object.

## When Not to Use

- The real object is cheap to create. Lazy initialization adds complexity without benefit.
- Access control belongs at a higher level (HTTP middleware, gateway) rather than at the object level.
- You're adding behavior (not controlling access) — that's Decorator, not Proxy.

## Advantages

- Controls access without changing the real object or its clients.
- Lazy initialization defers costly work until it's actually needed.
- `sync.Once` makes the initialization goroutine-safe with no contention after first call.

## Disadvantages

- Adds indirection — harder to trace which implementation is actually running.
- The proxy must stay in sync with the real interface — if methods are added, the proxy must be updated.
- Lazy initialization can surprise callers if the first call takes unexpectedly long.

## Related Patterns

- **Adapter** — Adapter changes the interface; Proxy preserves it.
- **Decorator** — Structurally identical to Proxy, but intent differs: Decorator adds behavior, Proxy controls access.
