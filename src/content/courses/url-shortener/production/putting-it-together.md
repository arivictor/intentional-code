---
title: "Putting It Together"
order: 2
description: "Assemble every layer behind a small Facade, expose metrics with expvar, and run the whole thing — one standard-library binary you can deploy."
---

## One Front Door Over Six Subsystems

Look at everything we've built: a storage stack (file plus cache), a generator strategy, a coordinating service, a background analytics pool, a rate limiter, and an HTTP layer. Wiring those together correctly — in the right order, with the right dependencies — is itself a job. If `main` does it inline, `main` becomes a tangle, and nothing else can construct the app the same way (your tests, especially).

The [Facade pattern](/go/patterns/structural/facade) is the fix: one type that hides the assembly and exposes only what a caller needs. We call it `App`. It knows how all six subsystems fit; everyone else just asks it for an `http.Handler` and a way to shut down.

```go
package main

import (
	"fmt"
	"net/http"

	"example/urlshortener/shortener"
)

// App is a Facade over the entire service. It assembles every layer and
// exposes the minimum a runner needs: a Handler to serve and a Shutdown to
// drain. Callers never see the cache, the strategy, or the worker pool.
type App struct {
	handler   http.Handler
	analytics *shortener.Analytics
	fileStore *shortener.FileStore
}

func NewApp(cfg Config) (*App, error) {
	// Storage: a durable append-only file, fronted by an LRU cache (Decorator).
	fileStore, err := shortener.OpenFileStore(cfg.DataFile)
	if err != nil {
		return nil, fmt.Errorf("open store: %w", err)
	}
	store := shortener.NewCachedStore(fileStore, cfg.CacheSize)

	// Code generation: the random strategy (Strategy).
	gen := shortener.NewRandomGenerator(shortener.WithLength(7))

	// The coordinator that ties generation and storage together.
	svc := shortener.NewService(store, gen)

	// Background click counting (Worker Pool).
	analytics := shortener.NewAnalytics(cfg.AnalyticsWorkers, cfg.AnalyticsBuffer)

	// HTTP layer + per-IP rate limiter (Strategy) applied as middleware (Decorator).
	server := shortener.NewServer(svc, cfg.BaseURL, analytics)
	limiter := shortener.NewIPRateLimiter(cfg.RatePerSec, cfg.RateBurst)

	return &App{
		handler:   withMetrics(server.Routes(limiter)),
		analytics: analytics,
		fileStore: fileStore,
	}, nil
}

func (a *App) Handler() http.Handler { return a.handler }
```

Read `NewApp` top to bottom and it's a readable table of contents for the whole course — each line is a chapter, and the comments name the pattern each one taught. That legibility is the Facade's quiet payoff: the complexity didn't vanish, it got *organised* behind one constructor.

## Metrics for Free with expvar

A production service has to answer "how is it doing?" without a debugger attached. The standard library's `expvar` package publishes variables as JSON over HTTP — no metrics dependency required. We mount it and publish the one custom number we care about, the analytics events we've been dropping:

```go
import "expvar"

// withMetrics mounts the API plus an expvar endpoint at /debug/vars.
func withMetrics(api http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/debug/vars", expvar.Handler()) // memstats + anything we publish
	mux.Handle("/", api)                         // everything else
	return mux
}
```

```go
// Publish a live view of dropped analytics events (see the Analytics pool).
// expvar.Func is evaluated on each scrape, so it's always current.
func publishMetrics(a *shortener.Analytics) {
	expvar.Publish("analytics_dropped", expvar.Func(func() any {
		return a.Dropped()
	}))
}
```

`expvar.Handler()` already exposes Go's `memstats` (heap, GC, goroutines) and the command line. Publishing `analytics_dropped` next to them means a single `curl /debug/vars` tells you both how the runtime is doing and whether your worker pool is keeping up — the number you specifically engineered the system to make visible.

## The Runner

`main` is now tiny, because all the hard parts moved behind the Facade and the lifecycle logic from the last step:

```go
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	if err := run(LoadConfig()); err != nil {
		log.Fatal(err)
	}
}

func run(cfg Config) error {
	app, err := NewApp(cfg)
	if err != nil {
		return err
	}
	publishMetrics(app.analytics)

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           app.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serveErr := make(chan error, 1)
	go func() {
		log.Printf("listening on %s", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
	}()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
		log.Println("shutdown signal received, draining...")
	}
	return app.Shutdown(srv)
}
```

And the drain order — stop HTTP, close analytics, close the store — lives on the Facade where it belongs, next to the assembly that created those dependencies:

```go
func (a *App) Shutdown(srv *http.Server) error {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil { // 1. stop accepting
		return fmt.Errorf("http shutdown: %w", err)
	}
	a.analytics.Close()              // 2. drain the click backlog
	if err := a.fileStore.Close(); err != nil { // 3. flush the store
		return fmt.Errorf("store close: %w", err)
	}
	log.Println("clean shutdown complete")
	return nil
}
```

## The Whole Thing on Disk

Every file we wrote, and nothing else — no vendored dependencies, because there are none:

```
urlshortener/
├── go.mod                  # module example/urlshortener; go 1.22
├── main.go                 # run(): serve + signal + drain
├── config.go               # Config + LoadConfig from the environment
├── app.go                  # App facade: NewApp, Handler, Shutdown, metrics
├── base62/
│   └── base62.go           # Encode, Decode, RandomString  (+ _test.go)
└── shortener/
    ├── link.go             # Link, Generator, Store, ErrNotFound, ErrCodeExists
    ├── generator.go        # Sequential / Random / Hash      (Strategy)
    ├── service.go          # Service.Shorten / Resolve + validateURL
    ├── store_memory.go     # MemoryStore                      (Repository)
    ├── store_file.go       # FileStore                        (durable)
    ├── store_cache.go      # CachedStore + lru                (Decorator)
    ├── server.go           # router, handlers, error envelope
    ├── ratelimit.go        # token bucket + RateLimit         (Strategy + Decorator)
    └── analytics.go        # Analytics worker pool            (Worker Pool)
```

## Run It

```
$ go mod init example/urlshortener   # once
$ go build ./...                     # compiles clean — stdlib only
$ go run .
2026/06/01 12:00:00 listening on :8080
```

The full lifecycle, from create through restart to clean shutdown:

```
# Shorten a URL
$ curl -s -X POST localhost:8080/shorten -d '{"url":"https://go.dev/blog/"}'
{"code":"k3Qm9Zb","short_url":"http://localhost:8080/k3Qm9Zb","url":"https://go.dev/blog/"}

# Follow it
$ curl -sI localhost:8080/k3Qm9Zb | grep -i location
Location: https://go.dev/blog/

# Check metrics
$ curl -s localhost:8080/debug/vars | python3 -c 'import sys,json; print(json.load(sys.stdin)["analytics_dropped"])'
0

# Restart (Ctrl-C, then run again) — the link survives, from links.log
^C
2026/06/01 12:00:30 shutdown signal received, draining...
2026/06/01 12:00:30 clean shutdown complete
$ go run .
$ curl -sI localhost:8080/k3Qm9Zb | grep -i location
Location: https://go.dev/blog/
```

## Shipping It

A standard-library Go service compiles to a single static binary, which makes the container almost insultingly small — no runtime, no libc, no dependencies to patch:

```dockerfile
# Build a static binary, then ship it on a minimal base image.
FROM golang:1.22 AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /urlshortener .

FROM gcr.io/distroless/static-debian12
COPY --from=build /urlshortener /urlshortener
ENV ADDR=:8080
EXPOSE 8080
ENTRYPOINT ["/urlshortener"]
```

One deployment note that follows directly from our design: the `FileStore` writes links to `DATA_FILE`, so a container needs a **mounted volume** for that path — otherwise the log lives in the container's ephemeral filesystem and a redeploy wipes every link. The durability we built in Chapter 3 is only as durable as the disk you point it at.

## What You Built, and the Patterns That Built It

Six chapters ago this was a map and two handlers. It's now a service with all six properties we set out to earn — and every one of them arrived as a named pattern, not a clever hack:

| Layer | Pattern | What it bought |
|---|---|---|
| Code generation | [Strategy](/go/patterns/behavioral/strategy) | Swap sequential / random / hash at startup |
| Storage | [Repository](/go/patterns/architectural/repository) | Memory, file, or cache behind one interface |
| Caching | [Decorator](/go/patterns/structural/decorator) | Speed added by wrapping, not rewriting |
| Rate limiting | Strategy + Decorator | Pluggable limit as drop-in middleware |
| Analytics | [Worker Pool](/go/patterns/concurrency/worker-pool) | Counting that never slows a redirect |
| Assembly | [Facade](/go/patterns/structural/facade) | Six subsystems behind one `App` |

That's the real lesson of building stdlib-only: the patterns weren't decoration applied afterward. Each one was the *answer* to a concrete problem the constraint forced you to solve yourself — and now you'd recognise the shape of that problem anywhere.

## Where to Go Next

The honest backlog, every item a known limit we named along the way:

- **URL dedup** — make the hash strategy return the existing link instead of erroring (Chapter 2's caveat).
- **Persistent click counts** — flush the analytics map to an append-only log so counts survive restarts (Chapter 5).
- **Log compaction** — rewrite `links.log` periodically so it stops growing forever (Chapter 3).
- **Distributed rate limiting** — shared counters across replicas when one box becomes three (Chapter 5).
- **Open-redirect defence** — a domain allowlist or interstitial page (Chapter 4).

Pick one when you actually need it — and notice that each slots into exactly one of the boundaries you built, without disturbing the others. That, more than any single feature, is what the careful boundaries bought you.

You've finished the course. If you haven't yet, the [API Framework course](/go/courses/api-framework) builds the handler layer underneath all this from first principles — a natural next stop.
