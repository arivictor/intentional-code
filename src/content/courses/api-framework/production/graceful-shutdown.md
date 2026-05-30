---
title: "Graceful Shutdown and Timeouts"
order: 2
description: "Drain in-flight requests on a deploy signal instead of dropping them, and set the timeouts that keep one slow client from holding the process hostage."
---

## What a Deploy Does to a Naive Server

`http.ListenAndServe(addr, handler)` blocks forever. When your orchestrator deploys a new version, it sends `SIGTERM` and the process dies *immediately* — mid-request, mid-transaction, mid-response. Every connection in flight is severed. Users see truncated responses; half-written database changes may be left dangling.

Graceful shutdown fixes this: on a signal, stop accepting *new* connections, let the *in-flight* ones finish (up to a deadline), then exit. It's a handful of lines, and it's the difference between a deploy nobody notices and a deploy that pages someone.

## The Two Patterns Behind It

`ListenAndServe` blocks, but we also need to watch for an OS signal. Two goroutines, coordinated by channels — that's the [done-channel pattern](/go/patterns/concurrency/done-channel): a goroutine does blocking work and signals completion (or failure) over a channel while the main goroutine waits. And we wait on *several* possible events at once — server error, or shutdown signal — with a `select`, which is the [timeout-select pattern](/go/patterns/concurrency/timeout-select) that bounds how long we'll wait for any of them.

```go
package framework

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
)

// Run starts the server and blocks until a shutdown signal arrives or the
// server fails. On signal it drains in-flight requests within the
// configured timeout, then returns.
func (s *Server) Run() error {
	// signal.NotifyContext cancels ctx when SIGINT or SIGTERM arrives.
	// This is the done-channel pattern: ctx.Done() is the "stop" signal.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// ListenAndServe blocks, so run it in a goroutine and report any
	// startup failure back over a buffered channel.
	errCh := make(chan error, 1)
	go func() {
		log.Printf("listening on %s", s.httpServer.Addr)
		if err := s.httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	// Wait for whichever happens first: the server fails, or we're told
	// to shut down. This select is the coordination point.
	select {
	case err := <-errCh:
		return fmt.Errorf("server error: %w", err)
	case <-ctx.Done():
		log.Println("shutdown signal received, draining...")
	}

	// Bound the drain with a timeout context. In-flight requests get up
	// to shutdownTimeout to finish; after that, we stop waiting.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), s.shutdownTimeout)
	defer cancel()

	if err := s.httpServer.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown failed: %w", err)
	}
	log.Println("shutdown complete")
	return nil
}
```

Three subtleties the comments mark:

- **`http.ErrServerClosed` is expected, not an error.** `Shutdown` causes `ListenAndServe` to return exactly this sentinel. Treating it as a failure would log a scary error on every clean shutdown, so we filter it out.
- **The error channel is buffered (`make(chan error, 1)`).** If the server fails *after* we've already moved past the `select` (e.g. during shutdown), the goroutine's send won't block forever on a channel no one is reading.
- **`Shutdown` respects the context.** Pass a timeout context and `Shutdown` returns once requests drain *or* the deadline hits — whichever comes first. That deadline is what stops one stuck request from blocking the deploy indefinitely.

## Timeouts Are Not Optional

Graceful shutdown handles the deploy. Timeouts handle the *malicious or broken client* — the one that opens a connection and sends one byte per minute, tying up a goroutine and a file descriptor. The fix is the server timeouts we wired through options in the previous step:

```go
&http.Server{
	Addr:         addr,
	Handler:      router,
	ReadTimeout:  5 * time.Second,  // max time to read the entire request
	WriteTimeout: 10 * time.Second, // max time to write the response
	IdleTimeout:  120 * time.Second,// max keep-alive idle time
}
```

A server without `ReadTimeout`/`WriteTimeout` is a server one slow client away from resource exhaustion. They're easy to forget because everything works fine in testing — the failure only shows up under a hostile or degraded network. Set them by default; that's the framework earning its keep.

## Seeing It Work

Signals are interactive, so here's the demonstration to run yourself. A handler that sleeps, so you can catch a request mid-flight:

```go
func main() {
	r := framework.New()
	r.Use(framework.RequestID, framework.Logger, framework.Recover)

	r.GET("/slow", func(c *framework.Context) error {
		time.Sleep(3 * time.Second) // simulate real work
		return c.JSON(200, map[string]string{"status": "done"})
	})

	cfg := framework.LoadConfig()
	srv := framework.NewServer(cfg.Addr, r,
		framework.WithTimeouts(cfg.ReadTimeout, cfg.WriteTimeout),
		framework.WithShutdownTimeout(cfg.ShutdownTimeout),
	)

	if err := srv.Run(); err != nil {
		log.Fatal(err)
	}
}
```

In one terminal: `go run .` then `curl localhost:8080/slow`. While that curl is waiting, press `Ctrl+C` in the server terminal. You'll see:

```
listening on :8080
shutdown signal received, draining...
id=3b9a... method=GET path=/slow dur=3.001s err=<nil>
shutdown complete
```

The server received the signal, stopped accepting new connections, but **let the in-flight `/slow` request finish** — the log line shows it completed after the signal — and only then exited. The curl returned `{"status":"done"}`, not a dropped connection. That is a deploy nobody notices.

## What's Next

Every piece now exists: routing, middleware, binding, validation, structured errors, configuration, graceful shutdown, and timeouts. The final step assembles them into one coherent `framework` package, lays out the project the way a real service should be structured, gives you a complete `main.go`, and shows the Dockerfile that ships it.
