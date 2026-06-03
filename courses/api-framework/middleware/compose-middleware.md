---
title: "Composing Middleware"
description: "Build the middleware chain — and recognize it as the Decorator and Chain of Responsibility patterns working together."
---

## The Type That Does Everything

We referenced `Middleware` and `Chain` in the routing chapter without defining them. Here they are, and they're smaller than you'd expect:

```go
package framework

// Middleware wraps a Handler and returns a new Handler, adding behavior
// before, after, or around the wrapped one.
type Middleware func(next Handler) Handler
```

That single line is the whole abstraction. A middleware takes a handler and returns a handler with the same signature. Because the shape is preserved, middleware compose infinitely: the output of one is valid input to the next.

If that sounds familiar, it should. This is the [Decorator pattern](/go/patterns/structural/decorator) verbatim. The pattern's definition — "wrap an object to add behavior, keeping the same interface" — is exactly `func(Handler) Handler`. Our handler isn't an `http.Handler`, but the structure is identical to the canonical Go example. We're not inventing anything; we're naming a pattern Go developers reach for instinctively.

## Building the Chain

`Chain` applies a list of middleware to a handler. The only real decision is *order*, and it's the decision people get wrong.

```go
// Chain wraps h in the given middleware. Middleware listed first runs
// first at request time: Chain(h, A, B) produces A(B(h)), so A is the
// outermost layer and sees the request before B does.
func Chain(h Handler, middleware ...Middleware) Handler {
	// Apply in reverse so the first listed ends up outermost.
	for i := len(middleware) - 1; i >= 0; i-- {
		h = middleware[i](h)
	}
	return h
}
```

We iterate in reverse on purpose. `Chain(h, Logger, Auth)` should read top-to-bottom as "log, then authenticate, then handle." Wrapping from the inside out — `Auth` first, then `Logger` around it — produces `Logger(Auth(h))`, where `Logger` is outermost and runs first. The reverse loop is what makes the listed order match the execution order. Get this backwards and your logger only sees requests that already passed auth.

```
Chain(h, Logger, Auth, handler)

request ─► Logger ─► Auth ─► h ─► Auth ─► Logger ─► response
           (entry)                       (exit)

Each layer:  func(next Handler) Handler
```

## The Other Half: Chain of Responsibility

Decorator explains the *wrapping*. It doesn't explain the most important power of middleware: the ability to **stop**. An auth middleware that rejects a request must not call the handler at all. That short-circuiting is the [Chain of Responsibility pattern](/go/patterns/behavioral/chain-of-responsibility) — each link decides whether to handle the request itself or pass it down the line.

A middleware that always calls `next` is pure Decorator. A middleware that *sometimes doesn't* is Chain of Responsibility. Real middleware is both at once, which is exactly what the Decorator pattern page notes about HTTP middleware: "each middleware wraps the next (Decorator) and may short-circuit the chain without calling the inner handler (Chain of Responsibility)."

Here's a middleware that exercises both halves:

```go
package framework

import "strings"

// RequireAPIKey is Decorator (it wraps next) and Chain of Responsibility
// (it can refuse to call next). On a missing key it handles the request
// itself by returning an error and the inner handler never runs.
func RequireAPIKey(valid string) Middleware {
	return func(next Handler) Handler {
		return func(c *Context) error {
			key := strings.TrimPrefix(c.Request.Header.Get("Authorization"), "Bearer ")
			if key != valid {
				return Unauthorised("invalid or missing API key") // short-circuit
			}
			return next(c) // pass it down the chain
		}
	}
}
```

`Unauthorised` is the structured error we build in Chapter 4. The point here is the control flow: returning *before* `next(c)` ends the chain. Because our handlers return errors, short-circuiting is just an early `return` — no awkward "did the middleware write a response already?" guessing that plagues the `http.Handler` style.

## Returning Errors Up the Chain

The error return also flows the other direction. When the inner handler fails, every middleware that wrapped it gets to see the error on the way out — to log it, add a metric, or transform it:

```go
// Observe times the request and records the outcome, including errors
// bubbling up from inner layers. It adds behavior on the *exit* path.
func Observe(next Handler) Handler {
	return func(c *Context) error {
		start := time.Now()
		err := next(c)
		status := "ok"
		if err != nil {
			status = "error"
		}
		log.Printf("%s %s %s %v", c.Request.Method, c.Request.URL.Path, status, time.Since(start))
		return err // pass the error along; don't swallow it
	}
}
```

Note it returns `err` rather than swallowing it. A middleware that observes an error should still let it propagate so the central error handler (Chapter 4) can turn it into a response. Swallowing errors in middleware is a classic source of "the request returned 200 but nothing happened" bugs.

## Tradeoffs

The function-wrapper form is idiomatic and recognizable, but it has the same cost the Decorator page warns about: **order sensitivity the compiler can't catch**. `Chain(h, Recover, Logger)` recovers from panics in the logger; `Chain(h, Logger, Recover)` does not. Both compile. Both run. Only one survives a panic in your logging code. Decide your base stack order once, write it down, and don't reshuffle it casually.

The second cost is **stack-trace depth**. A panic five middleware deep produces a trace through five anonymous closures. The fix, as the pattern page recommends, is to give middleware named functions rather than inline closures, and to keep the global stack to a handful of layers.

## What's Next

We have the mechanism. Now we write the middleware every production service needs — recovery so one panic doesn't crash the process, structured logging, and request IDs for tracing — using exactly this `Middleware` type.
