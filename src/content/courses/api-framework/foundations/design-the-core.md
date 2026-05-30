---
title: "Designing the Core: Handler and Context"
order: 2
description: "Define the two types the whole framework hangs off of — a handler that returns an error and a request context — and adapt them to net/http."
---

## Two Types, One Framework

A framework's API is mostly two decisions: *what is a handler* and *what does a handler receive*. Get these right and routing, middleware, and error handling become natural. Get them wrong and you fight your own abstraction forever.

We made the first decision in the previous step: a handler returns an `error`. Now we design the value it receives — the `Context` — and connect both to the standard library.

## The Context

The standard library hands a handler two arguments: an `http.ResponseWriter` and an `*http.Request`. That's enough, but it's bare. Every real handler immediately needs path parameters, a way to read the request body as JSON, and a way to write a JSON response. Rather than make each handler re-derive those, we bundle them.

```go
package framework

import (
	"encoding/json"
	"net/http"
)

// Context carries everything a handler needs for one request.
// It wraps the standard writer/request pair and adds per-request
// state like path parameters plus helpers for the common cases.
type Context struct {
	Writer  http.ResponseWriter
	Request *http.Request

	params map[string]string
}

// Param returns a path parameter captured by the router, e.g. the
// "42" in a route "/users/:id" matched against "/users/42".
func (c *Context) Param(key string) string {
	return c.params[key]
}

// Bind decodes the JSON request body into dst. We reject unknown
// fields so a typo in the client payload is a 400, not a silent drop.
func (c *Context) Bind(dst any) error {
	dec := json.NewDecoder(c.Request.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

// JSON writes v as a JSON response with the given status code.
func (c *Context) JSON(status int, v any) error {
	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(status)
	return json.NewEncoder(c.Writer).Encode(v)
}
```

`Context` is deliberately a concrete struct, not an interface. Frameworks that make the context an interface (so it can be "mocked") usually regret it — there is exactly one real implementation and the interface just adds indirection. This is [YAGNI](/go/philosophy/yagni) in practice: don't add a seam until something needs to vary.

## The Handler

```go
package framework

// Handler is the unit of work. Returning an error — rather than
// writing the failure response inline — is what lets a single place
// decide how errors become HTTP responses.
type Handler func(*Context) error
```

That's the whole contract. A handler reads from the `Context`, does its work, and either returns `nil` (it wrote a response) or returns an error (something went wrong; let the framework deal with it).

## Adapting to net/http

Here is the crucial constraint: `net/http` knows nothing about our `Handler`. `http.ListenAndServe` and every piece of middleware in the ecosystem speak `http.Handler`. If our framework can't become an `http.Handler`, it can't run.

This is the [Adapter pattern](/go/patterns/structural/adapter) exactly: two interfaces that should work together but have mismatched shapes. The adapter is a small function that satisfies `http.Handler` and, inside, calls our `Handler`.

```go
package framework

import "net/http"

// toHTTPHandler adapts our error-returning Handler to the standard
// http.Handler interface. This is the Adapter pattern: it bridges
// func(*Context) error and ServeHTTP(w, r) so our framework plugs
// directly into net/http and any middleware that speaks it.
func toHTTPHandler(h Handler, params map[string]string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := &Context{Writer: w, Request: r, params: params}
		if err := h(ctx); err != nil {
			// Placeholder. Chapter 4 replaces this with structured,
			// status-aware error handling.
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}
}
```

Notice the adapter is also where the `error` return finally gets *handled*. Right now it's a crude 500, but the seam is in place: when we build structured errors in Chapter 4, this is the only spot that changes. Every handler in the entire application gets better error handling by editing six lines here. That is the payoff of the [Decorator-style](/go/patterns/structural/decorator) single-responsibility design — concerns live in one place, not scattered across handlers.

## Proving It Runs

Let's wire a handler through the adapter and serve it with the standard library — no router yet, just to prove the core types work end to end.

```go
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"

	"yourmodule/framework"
)

func main() {
	// A handler using our signature.
	greet := func(c *framework.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"message": "hello"})
	}

	// Adapt it and serve through the standard library's test server.
	mux := http.NewServeMux()
	mux.Handle("/greet", framework.Adapt(greet)) // exported wrapper around toHTTPHandler

	srv := httptest.NewServer(mux)
	defer srv.Close()

	resp, _ := http.Get(srv.URL + "/greet")
	defer resp.Body.Close()
	var body map[string]string
	_ = json.NewDecoder(resp.Body).Decode(&body)

	fmt.Println(resp.StatusCode, body["message"])
}
```

Output:

```
200 hello
```

(`Adapt` is just an exported `func(h Handler) http.HandlerFunc { return toHTTPHandler(h, nil) }` — we'll fold parameter passing into the router in the next chapter.)

## What We Have

Two types and an adapter — under fifty lines — and we can already serve JSON through `net/http` with an error-returning handler signature. Everything from here is filling in the pieces: a real router to populate those `params`, middleware to wrap the `Handler`, and a proper error handler to replace that placeholder 500.

Next chapter: routing. We'll build a radix tree that matches `/users/:id` in time proportional to the path length, not the number of routes.
