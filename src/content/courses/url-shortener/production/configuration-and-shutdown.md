---
title: "Configuration and Graceful Shutdown"
order: 1
description: "Read config from the environment the twelve-factor way, set the server timeouts that matter, and shut down without dropping in-flight work."
---

## Config Lives in the Environment

A hard-coded `:8080` is fine until you run two copies on one box, or move from staging to prod, or need to point at a different data file. The [Twelve-Factor App](/go/philosophy/twelve-factor) names the fix directly: **store config in the environment.** Not in the binary, not in a checked-in file that differs per environment and leaks secrets — in environment variables the deploy supplies.

We gather everything tunable into one struct, read once at startup, each field with a default sane enough that the zero-config case still boots:

```go
package main

import (
	"log"
	"os"
	"strconv"
	"time"
)

// Config is the whole service configuration, read from the environment.
// Every field has a default so `go run .` works with nothing set.
type Config struct {
	Addr             string
	BaseURL          string
	DataFile         string
	CacheSize        int
	RatePerSec       float64
	RateBurst        float64
	AnalyticsWorkers int
	AnalyticsBuffer  int
}

func LoadConfig() Config {
	return Config{
		Addr:             getenv("ADDR", ":8080"),
		BaseURL:          getenv("BASE_URL", "http://localhost:8080"),
		DataFile:         getenv("DATA_FILE", "links.db"),
		CacheSize:        getenvInt("CACHE_SIZE", 1024),
		RatePerSec:       getenvFloat("RATE_PER_SEC", 5),
		RateBurst:        getenvFloat("RATE_BURST", 10),
		AnalyticsWorkers: getenvInt("ANALYTICS_WORKERS", 4),
		AnalyticsBuffer:  getenvInt("ANALYTICS_BUFFER", 1024),
	}
}
```

The helpers are small, and they make a point of being *loud* when a value is malformed rather than silently falling back to a default that hides the typo:

```go
func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}

func getenvInt(key string, fallback int) int {
	v, ok := os.LookupEnv(key)
	if !ok {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		log.Fatalf("config: %s=%q is not a valid integer", key, v) // fail fast
	}
	return n
}

func getenvFloat(key string, fallback float64) float64 {
	v, ok := os.LookupEnv(key)
	if !ok {
		return fallback
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		log.Fatalf("config: %s=%q is not a valid number", key, v)
	}
	return f
}
```

`log.Fatalf` on a malformed value is deliberate. A service that's *told* `CACHE_SIZE=lots` and quietly uses 1024 instead is hiding a misconfiguration that someone will chase for hours. Failing at startup, before accepting a single request, turns a subtle production mystery into an obvious boot error. Config problems should crash early and loudly.

## A Server With Real Timeouts

`http.ListenAndServe(":8080", h)` is fine for a tutorial and reckless for production: it has no timeouts, so a single slow or malicious client can hold a connection open indefinitely. We build an explicit `http.Server` instead:

```go
import "net/http"

srv := &http.Server{
	Addr:              cfg.Addr,
	Handler:           handler,
	ReadHeaderTimeout: 10 * time.Second, // defeats Slowloris-style stalls
	ReadTimeout:       15 * time.Second,
	WriteTimeout:      15 * time.Second,
	IdleTimeout:       60 * time.Second,
}
```

`ReadHeaderTimeout` is the most important of the four: without it, a client that opens a connection and dribbles header bytes one per second ties up a goroutine forever — the classic Slowloris attack, defeated by one line. The others bound slow bodies, slow responses, and idle keep-alives. None of these has a default; silence here is a vulnerability.

## Catching the Shutdown Signal

When a deploy or an orchestrator stops your service, it sends `SIGTERM` (or `SIGINT` from Ctrl-C). The default behaviour is to die *instantly* — severing every in-flight request and abandoning the un-drained click buffer from the last chapter. We want the opposite: stop taking new work, finish what's in hand, then exit.

`signal.NotifyContext` turns a signal into a cancelled `context`, which is the cleanest way to wire OS signals into Go's cancellation model:

```go
import (
	"context"
	"errors"
	"os/signal"
	"syscall"
)

func run(cfg Config) error {
	// ...assembly (next step) produces: srv, analytics, db...

	// ctx is cancelled when SIGINT or SIGTERM arrives.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Serve in a goroutine so we can wait on either a signal or a fatal error.
	serveErr := make(chan error, 1)
	go func() {
		log.Printf("listening on %s", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err // a real bind/serve failure, not the normal close
		}
	}()

	select {
	case err := <-serveErr:
		return err // couldn't even start, or crashed while serving
	case <-ctx.Done():
		log.Println("shutdown signal received, draining...")
	}

	return drain(srv, analytics, db)
}
```

The `errors.Is(err, http.ErrServerClosed)` check matters: a *graceful* shutdown causes `ListenAndServe` to return `ErrServerClosed`, which is success, not failure. Treating it as an error would make every clean shutdown look like a crash in your logs.

## Draining in the Right Order

Shutdown order is not arbitrary — get it wrong and you either drop work or panic. The sequence mirrors the dependency chain in reverse:

```go
func drain(srv *http.Server, analytics *shortener.Analytics, db *shortener.SQLiteStore) error {
	// 1. Stop accepting new requests; wait up to 15s for in-flight handlers.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("http shutdown: %w", err)
	}

	// 2. HTTP is stopped, so no new clicks can be Recorded. Now it's safe to
	//    close the analytics channel and let the workers drain the backlog.
	analytics.Close()

	// 3. Finally close the database, flushing the WAL and releasing the file.
	if err := db.Close(); err != nil {
		return fmt.Errorf("store close: %w", err)
	}

	log.Println("clean shutdown complete")
	return nil
}
```

Read the comments as a proof of correctness. `srv.Shutdown` stops new connections and blocks until active handlers finish (or the 15-second deadline fires), so step 2 runs only once no handler can still call `analytics.Record`. That ordering is what makes `analytics.Close()` safe — recall that sending on a closed channel panics, so we *must* guarantee no `Record` happens after `close`, and "HTTP fully stopped" is that guarantee. Then the store closes last, because both the HTTP layer and the workers depend on it. Tear down in reverse order of dependency, and nothing is pulled out from under anything still using it.

The 15-second deadline is the pragmatic backstop: graceful shouldn't mean *forever*. If a handler is genuinely stuck, you'd rather force-exit after a bounded wait than hang the deploy indefinitely. Bounded patience is still patience.

## Tradeoffs

- **Config validation is shallow.** We catch malformed numbers but not nonsensical-but-valid ones (a negative `CACHE_SIZE`, a `RATE_PER_SEC` of zero). For a bigger service, validate ranges after loading and fail fast on those too.
- **No live reload.** Config is read once at startup; changing an env var means a restart. That's the twelve-factor norm and almost always what you want — reloadable config is a feature to add only when you can name why you need it ([YAGNI](/go/philosophy/yagni)).
- **The drain deadline can still cut work.** A 15-second bound means a truly stuck handler is abandoned. That's the right call — an unbounded drain just moves the outage from "dropped requests" to "deploy never finishes."

## What's Next

We have the two halves of a production lifecycle: configuration in, clean shutdown out. The final step puts *everything* together — config, the storage stack, the generator, the service, analytics, rate limiting, and `expvar` metrics — assembled behind a small [Facade](/go/patterns/structural/facade) into one `main.go` you can actually run.
