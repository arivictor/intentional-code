---
title: "Putting It All Together"
order: 3
description: "Assemble every piece into one framework package, lay out a real project, write a complete main.go, and ship it with Docker."
---

## What You've Built

Across this course you wrote a complete HTTP framework on top of the standard library — no third-party dependencies. Here's the whole `framework` package, one file per concern:

```
framework/
├── context.go    // Context: Param, Bind, BindValid, JSON          (Ch.1, Ch.4)
├── handler.go    // Handler func(*Context) error; Adapt to net/http (Ch.1)
├── router.go     // Router, Group, method helpers, ServeHTTP        (Ch.2)
├── tree.go       // radix node: insert, search, path params         (Ch.2)
├── middleware.go // Middleware, Chain, Recover, Logger, RequestID, CORS (Ch.3)
├── validate.go   // Validator interface                             (Ch.4)
├── errors.go     // HTTPError, constructors, writeError             (Ch.4)
├── config.go     // Config, LoadConfig from environment             (Ch.5)
└── server.go     // Server, options, Run with graceful shutdown     (Ch.5)
```

Roughly 350 lines. Every one of them you understand, because you wrote it. When a request misbehaves in production, there's no framework source to spelunk — it's your code.

## Structuring the Service

The framework is *infrastructure*. Your business logic should not import it indiscriminately, and the framework must never import your business logic. That direction-of-dependency rule is the heart of [Clean Architecture](/go/patterns/architectural/clean-architecture) and [Hexagonal Architecture](/go/patterns/architectural/hexagonal): infrastructure points inward at the domain, never the reverse.

A layout that enforces it:

```
myservice/
├── cmd/
│   └── api/
│       └── main.go         // composition root: wires everything together
├── framework/              // the HTTP framework you built (infrastructure)
├── internal/
│   └── users/
│       ├── store.go        // domain types + repository interface
│       └── handlers.go     // HTTP handlers for the users resource
├── go.mod
└── Dockerfile
```

`main.go` is the only place that knows about *everything*. The `users` package knows about the framework's `Context` but not about config or shutdown. The framework knows about neither. Dependencies flow one way.

## The Domain: A Repository

The users package owns its data behind a [Repository](/go/patterns/architectural/repository) interface, so handlers depend on an abstraction, not a concrete database. Today it's an in-memory map; swapping in Postgres later touches this file and nothing else.

```go
// internal/users/store.go
package users

import (
	"errors"
	"fmt"
	"strings"
	"sync"
)

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

// Store is the repository interface. Handlers depend on this, not on a
// concrete database — the Repository pattern keeping persistence behind
// a seam the domain controls.
type Store interface {
	Get(id string) (User, bool)
	Create(u User) User
}

// MemoryStore is a trivial in-memory implementation, safe for concurrent
// use. Swap it for a SQL-backed Store without changing any handler.
type MemoryStore struct {
	mu    sync.RWMutex
	users map[string]User
	seq   int
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{users: make(map[string]User)}
}

func (s *MemoryStore) Get(id string) (User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.users[id]
	return u, ok
}

func (s *MemoryStore) Create(u User) User {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.seq++
	u.ID = fmt.Sprintf("%d", s.seq)
	s.users[u.ID] = u
	return u
}

// CreateUserRequest is the validated input for creating a user.
type CreateUserRequest struct {
	Email string `json:"email"`
	Name  string `json:"name"`
}

func (r CreateUserRequest) Validate() error {
	switch {
	case r.Email == "":
		return errors.New("email is required")
	case !strings.Contains(r.Email, "@"):
		return errors.New("email is not valid")
	case r.Name == "":
		return errors.New("name is required")
	}
	return nil
}
```

## The Handlers

Handlers are constructed with their dependencies (the `Store`) and return framework `Handler` functions. Notice how short each one is — binding, validation, and error rendering all happen in the framework, so handlers are pure business logic.

```go
// internal/users/handlers.go
package users

import "yourmodule/framework"

// Handlers bundles the dependencies the user routes need.
type Handlers struct {
	Store Store
}

func (h Handlers) Get(c *framework.Context) error {
	u, ok := h.Store.Get(c.Param("id"))
	if !ok {
		return framework.NotFound("no user with that id")
	}
	return c.JSON(200, u)
}

func (h Handlers) Create(c *framework.Context) error {
	var req CreateUserRequest
	if err := c.BindValid(&req); err != nil {
		return err // 400 with the validation message, rendered centrally
	}
	created := h.Store.Create(User{Email: req.Email, Name: req.Name})
	return c.JSON(201, created)
}

// Routes registers this resource's routes on a router or group.
func (h Handlers) Routes(r *framework.Router) {
	r.GET("/users/:id", h.Get)
	r.POST("/users", h.Create)
}
```

## The Composition Root

`main.go` is where it all connects: load config, build the store, register routes, stack middleware, and run with graceful shutdown. This is the complete program.

```go
// cmd/api/main.go
package main

import (
	"log"

	"yourmodule/framework"
	"yourmodule/internal/users"
)

func main() {
	cfg := framework.LoadConfig()

	r := framework.New()

	// Global middleware, in the order the course settled on:
	// RequestID outermost, Recover innermost so panics are logged.
	r.Use(framework.RequestID, framework.Logger, framework.Recover)
	r.Use(framework.CORS("*"))

	// Health check for load balancers and orchestrators.
	r.GET("/healthz", func(c *framework.Context) error {
		return c.JSON(200, map[string]string{"status": "ok"})
	})

	// Wire the users resource to an in-memory store (swap for SQL later).
	userHandlers := users.Handlers{Store: users.NewMemoryStore()}
	userHandlers.Routes(r)

	// Build the server with environment-driven timeouts and run it with
	// graceful shutdown.
	srv := framework.NewServer(cfg.Addr, r,
		framework.WithTimeouts(cfg.ReadTimeout, cfg.WriteTimeout),
		framework.WithShutdownTimeout(cfg.ShutdownTimeout),
	)

	if err := srv.Run(); err != nil {
		log.Fatal(err)
	}
}
```

That's a production-shaped service in forty lines. Run it:

```
$ go run ./cmd/api
listening on :8080

$ curl -s localhost:8080/healthz
{"status":"ok"}

$ curl -s -XPOST localhost:8080/users -d '{"email":"ada@example.com","name":"Ada"}'
{"id":"1","email":"ada@example.com","name":"Ada"}

$ curl -s localhost:8080/users/1
{"id":"1","email":"ada@example.com","name":"Ada"}

$ curl -s -XPOST localhost:8080/users -d '{"name":"No Email"}'
{"code":"bad_request","message":"email is required"}

$ curl -s localhost:8080/users/999
{"code":"not_found","message":"no user with that id"}
```

Validated input, consistent error envelopes, path parameters, structured JSON — every chapter, working together.

## Shipping It

The [Twelve-Factor](/go/philosophy/twelve-factor) payoff: because all config comes from the environment, the container needs no config files. A multi-stage Dockerfile produces a tiny static image:

```dockerfile
# Build stage
FROM golang:1.22 AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /bin/api ./cmd/api

# Run stage: minimal, no shell, no package manager
FROM gcr.io/distroless/static-debian12
COPY --from=build /bin/api /api
EXPOSE 8080
ENTRYPOINT ["/api"]
```

Build and run, overriding config purely through the environment:

```
$ docker build -t myservice .
$ docker run -p 8080:8080 \
    -e ADDR=:8080 \
    -e READ_TIMEOUT=5s \
    -e SHUTDOWN_TIMEOUT=20s \
    myservice
```

The same binary that ran on your laptop now runs in the container, configured entirely by environment variables, shutting down gracefully when the orchestrator sends `SIGTERM`. That is "production-ready" in the literal sense: you can deploy this.

## Where to Go Next

You have a real foundation. Natural extensions, each a focused addition to a seam the design already left open:

- **Persistence:** implement `users.Store` against Postgres. No handler changes.
- **Auth:** a real `RequireAuth` middleware that validates a JWT and puts the user on the request context — exactly like `RequestID`.
- **Observability:** swap `log.Printf` in the `Logger` middleware for structured `slog`, and add a metrics middleware next to it.
- **Wildcard routes** (`/files/*path`): the `tree` extension flagged back in the routing chapter.

Each of these is a small, contained change *because* the framework was built from clear seams — the error-returning handler, the middleware type, the repository interface, environment config. That is the real lesson of the course: a framework isn't magic, it's a handful of well-chosen abstractions, and now you can build, understand, and own every one of them.
