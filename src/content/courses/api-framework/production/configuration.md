---
title: "Configuration the Twelve-Factor Way"
order: 1
description: "Load configuration from the environment with sane defaults, and configure the server with options instead of a global singleton."
---

## Config Belongs in the Environment

The same binary runs on your laptop, in staging, and in production. The only thing that changes is configuration — the port, the timeouts, the database URL. The [Twelve-Factor App](/go/philosophy/twelve-factor) is unambiguous about where that lives: in the *environment*, not in the code and not in a checked-in file. Strict separation of config from code is what lets one immutable artifact promote cleanly from dev to prod.

So our framework reads config from environment variables, with defaults that make local development zero-setup.

```go
package framework

import (
	"os"
	"time"
)

// Config holds everything that varies between deployments. Every field
// comes from the environment so the same binary runs anywhere.
type Config struct {
	Addr            string
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	ShutdownTimeout time.Duration
}

// LoadConfig reads configuration from the environment, falling back to
// development-friendly defaults so `go run .` works with no setup.
func LoadConfig() Config {
	return Config{
		Addr:            getenv("ADDR", ":8080"),
		ReadTimeout:     getenvDuration("READ_TIMEOUT", 5*time.Second),
		WriteTimeout:    getenvDuration("WRITE_TIMEOUT", 10*time.Second),
		ShutdownTimeout: getenvDuration("SHUTDOWN_TIMEOUT", 15*time.Second),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getenvDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}
```

Defaults that work out of the box are a feature, not a shortcut: a new contributor clones the repo and runs it, no `.env` scavenger hunt. Production overrides what it needs via real environment variables.

## Configuring the Server: Options, Not a Singleton

The framework's `Server` needs to be configurable — timeouts, the router, maybe a custom logger later. There are two idiomatic ways to do this in Go, and one tempting anti-pattern.

The anti-pattern first, because it's so common: a **package-level global**.

```go
// DON'T do this.
var GlobalConfig Config

func init() { GlobalConfig = LoadConfig() }
```

This is the [Singleton pattern](/go/patterns/creational/singleton) in its most seductive and most damaging form. It's convenient — every function can reach `framework.GlobalConfig` — and that convenience is exactly the problem. As the Singleton page explains, a global turns configuration into a *hidden dependency*: nothing in a function's signature reveals that it reads global state, two tests can't run with different config without stomping on each other, and the initialization order becomes load-bearing magic. Convenient to write, miserable to test and reason about.

The idiomatic alternative is **functional options** — a lightweight cousin of the [Builder pattern](/go/patterns/creational/builder) that's become the standard Go way to configure a struct with many optional fields.

```go
package framework

import (
	"net/http"
	"time"
)

// Server wraps an http.Server with our Router and shutdown settings.
type Server struct {
	httpServer      *http.Server
	shutdownTimeout time.Duration
}

// Option configures a Server. This is the functional-options idiom: each
// option is a function that mutates the server during construction.
type Option func(*Server)

func WithTimeouts(read, write time.Duration) Option {
	return func(s *Server) {
		s.httpServer.ReadTimeout = read
		s.httpServer.WriteTimeout = write
	}
}

func WithShutdownTimeout(d time.Duration) Option {
	return func(s *Server) { s.shutdownTimeout = d }
}

// NewServer builds a Server from a router and zero or more options.
// Required dependencies (addr, router) are explicit parameters; optional
// tuning goes through options. That split is the whole design.
func NewServer(addr string, r *Router, opts ...Option) *Server {
	s := &Server{
		httpServer:      &http.Server{Addr: addr, Handler: r},
		shutdownTimeout: 15 * time.Second,
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}
```

Why options over a classic Builder here? The Builder page notes Builder shines when construction is complex or multi-step. A server has a few independent optional knobs, no ordering constraints, and no "build" step — that's precisely the case functional options were designed for. Builder would be ceremony; options are exactly enough. Picking the lighter tool is [KISS](/go/philosophy/kiss) in action.

## Bringing Them Together

`Config` (from the environment) feeds the options (explicit construction). The environment decides the values; the code decides the shape.

```go
cfg := framework.LoadConfig()

srv := framework.NewServer(
	cfg.Addr,
	router,
	framework.WithTimeouts(cfg.ReadTimeout, cfg.WriteTimeout),
	framework.WithShutdownTimeout(cfg.ShutdownTimeout),
)
```

No globals, no `init()` magic. A test can build a `Server` with whatever config it wants, in parallel with other tests, because nothing is shared. That testability is the entire reason to resist the singleton.

## What's Next

We have a configurable server, but starting it is still `http.ListenAndServe`, which dies instantly on a signal — dropping every in-flight request. The next step adds graceful shutdown and the timeouts that keep a slow client from holding the process hostage, using two concurrency patterns built for exactly this.
