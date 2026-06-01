---
title: "The Middleware Every API Needs"
order: 2
description: "Recovery, request IDs, structured logging, and CORS — the production baseline, with the stack order that makes panics observable."
---

## The Production Baseline

Four middleware turn the framework from "serves requests" into "survives production": **recovery** so one panic doesn't crash the process, **request IDs** so you can trace a request across logs, **structured logging** so those logs are greppable, and **CORS** so browsers can call you. We build all four on the `Middleware` type from the previous step.

## Recovery

A panic in a handler unwinds the goroutine. Without recovery, that goroutine is the one serving the request — and in some panic paths it can take the process with it. Recovery catches the panic, logs it with a stack trace, and converts it into a normal error so the rest of the chain behaves as if the handler returned `500`.

```go
package framework

import (
	"log"
	"net/http"
	"runtime/debug"
)

// Recover turns a panic in any inner layer into a normal error return.
// It uses a named return value (err) so the deferred function can set
// the result after recover() stops the unwinding.
func Recover(next Handler) Handler {
	return func(c *Context) (err error) {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("panic recovered: %v\n%s", r, debug.Stack())
				err = &HTTPError{Code: http.StatusInternalServerError, Message: "internal server error"}
			}
		}()
		return next(c)
	}
}
```

The named return `(err error)` is the trick: a deferred closure can't change a plain return value, but it can assign to a named one. After `recover()` halts the unwind, we set `err` and the function returns it normally. (`HTTPError` is the structured error type from the next chapter; for now, read it as "a 500.")

## Request IDs

Every request gets an ID — generated, or honored from an incoming `X-Request-ID` header so the ID survives across service hops. We store it on the request's `context.Context`, which is the idiomatic place for request-scoped values that downstream code (loggers, database calls) needs to read.

```go
package framework

import (
	"context"
	"crypto/rand"
	"encoding/hex"
)

type ctxKey string

const requestIDKey ctxKey = "request_id"

// RequestID attaches a request ID to the context and echoes it in the
// response header. An incoming X-Request-ID is preserved so a trace ID
// set at the edge flows through every service.
func RequestID(next Handler) Handler {
	return func(c *Context) error {
		id := c.Request.Header.Get("X-Request-ID")
		if id == "" {
			id = newID()
		}
		ctx := context.WithValue(c.Request.Context(), requestIDKey, id)
		c.Request = c.Request.WithContext(ctx)
		c.Writer.Header().Set("X-Request-ID", id)
		return next(c)
	}
}

// RequestIDFrom extracts the request ID set by the RequestID middleware.
func RequestIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}

func newID() string {
	var b [12]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
```

The unexported `ctxKey` type is deliberate: using a custom type (not a bare string) as the context key prevents collisions with keys set by other packages. It's a small idiom with an outsised payoff in a large codebase.

## Structured Logging

Logging reads the request ID back out of the context, so every log line is tied to a request you can grep for. It logs on the way *out*, after `next` returns, so it can record the duration and the outcome.

```go
package framework

import (
	"log"
	"time"
)

// Logger logs one line per request: id, method, path, duration, error.
// It records the error bubbling up from inner layers without swallowing
// it — the central error handler still gets to turn it into a response.
func Logger(next Handler) Handler {
	return func(c *Context) error {
		start := time.Now()
		err := next(c)
		log.Printf("id=%s method=%s path=%s dur=%s err=%v",
			RequestIDFrom(c.Request.Context()),
			c.Request.Method, c.Request.URL.Path, time.Since(start), err)
		return err
	}
}
```

## CORS

CORS is the one middleware here that *must* be able to short-circuit — a browser preflight `OPTIONS` request should get headers and a `204`, never reaching your handler. That's the [Chain of Responsibility](/go/patterns/behavioral/chain-of-responsibility) half of middleware doing real work.

```go
package framework

import (
	"net/http"
	"strings"
)

// CORS sets cross-origin headers and answers preflight OPTIONS requests
// directly, short-circuiting the chain so the handler never sees them.
func CORS(origins ...string) Middleware {
	allowed := strings.Join(origins, ", ")
	return func(next Handler) Handler {
		return func(c *Context) error {
			h := c.Writer.Header()
			h.Set("Access-Control-Allow-Origin", allowed)
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			if c.Request.Method == http.MethodOptions {
				c.Writer.WriteHeader(http.StatusNoContent)
				return nil // preflight handled; do not call next
			}
			return next(c)
		}
	}
}
```

## Order Is a Decision, Not an Accident

The previous step warned that middleware order is a correctness issue the compiler won't catch. Here is the concrete payoff. The recommended base stack:

```go
r := framework.New()
r.Use(
	framework.RequestID, // 1. outermost: ID exists for everything below
	framework.Logger,    // 2. logs every request, including recovered panics
	framework.Recover,   // 3. innermost of the three: catches handler panics
)
```

Why `Recover` *inside* `Logger`? Because `Recover` converts a panic into an error *return*. With `Recover` innermost, that error flows back out through `Logger`, which logs it. Flip them — `Recover` outermost — and a handler panic unwinds straight past `Logger` (whose post-`next` line never runs), so the panic is recovered but **never logged**. Same two middleware, opposite observability. This is exactly the order sensitivity from the last step, made concrete.

## Proving It: A Panic That Doesn't Crash

```go
package main

import (
	"fmt"
	"net/http/httptest"

	"yourmodule/framework"
)

func main() {
	// A handler that panics.
	boom := func(c *framework.Context) error { panic("kaboom") }

	// Recommended order: panics are recovered AND logged.
	h := framework.Chain(boom, framework.RequestID, framework.Logger, framework.Recover)

	req := httptest.NewRequest("GET", "/boom", nil)
	rec := httptest.NewRecorder()
	ctx := framework.NewContext(rec, req) // small constructor exported for tests

	err := h(ctx)
	fmt.Printf("returned err: %v\n", err)
	fmt.Printf("X-Request-ID set: %v\n", rec.Header().Get("X-Request-ID") != "")
	fmt.Println("process still alive: true")
}
```

Output (the log line goes to stderr; id and duration vary):

```
2024/01/02 15:04:05 id=9f3a1c0b7e2d method=GET path=/boom dur=18µs err=internal server error
returned err: internal server error
X-Request-ID set: true
process still alive: true
```

The handler panicked. Recovery caught it and produced a clean error, the logger recorded it *with* the request ID, the response still carried `X-Request-ID` for the client to report, and the process kept running. That is the entire job of the production baseline.

## What's Next

Middleware handles the cross-cutting concerns. Now we turn to the handler's own job: safely decoding input and producing consistent output. The next chapter builds binding, validation, and the `HTTPError` type that `Recover` already leaned on.
