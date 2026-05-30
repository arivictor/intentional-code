---
title: "Consistent Errors"
order: 2
description: "Build the HTTPError type and the central handler that turns every returned error into a predictable JSON response."
---

## Why Generic Errors Fail

When a handler returns `fmt.Errorf("user not found")`, the framework has no idea what to do with it. Our placeholder from Chapter 1 turns *everything* into a `500`:

```go
if err := h(ctx); err != nil {
	http.Error(w, err.Error(), http.StatusInternalServerError) // every error is a 500
}
```

A missing user is a `404`, not a server fault. A bad payload is a `400`. The error itself needs to carry its status — and we want every error response to have the same JSON shape so clients can parse failures as reliably as successes.

This is the payoff of the [error-returning handler signature](/go/courses/api-framework/foundations/why-build-your-own) we committed to on day one. Because handlers *return* errors instead of writing responses, one place can decide how every error becomes HTTP.

## The HTTPError Type

```go
package framework

import "net/http"

// HTTPError is an error that knows its HTTP status code. Returning one
// from a handler or middleware lets the central handler set the right
// status and a consistent JSON body.
type HTTPError struct {
	Status  int    `json:"-"`       // HTTP status; not serialized into the body
	Code    string `json:"code"`    // stable machine-readable code, e.g. "not_found"
	Message string `json:"message"` // human-readable detail
}

func (e *HTTPError) Error() string { return e.Message }

// Constructors for the common cases keep call sites terse.
func NotFound(msg string) *HTTPError {
	return &HTTPError{Status: http.StatusNotFound, Code: "not_found", Message: msg}
}

func BadRequest(msg string) *HTTPError {
	return &HTTPError{Status: http.StatusBadRequest, Code: "bad_request", Message: msg}
}

func Unauthorized(msg string) *HTTPError {
	return &HTTPError{Status: http.StatusUnauthorized, Code: "unauthorized", Message: msg}
}

func Internal(msg string) *HTTPError {
	return &HTTPError{Status: http.StatusInternalServerError, Code: "internal", Message: msg}
}
```

Two fields earn their place. `Code` is a *stable* string — clients can branch on `"not_found"` forever, even if you reword the human `Message`. And `Status` is tagged `json:"-"` so it sets the HTTP status without leaking into the body, where it would be redundant.

## The Central Error Handler

Now we replace the placeholder. The router's `ServeHTTP` calls one function to render any error. The logic: if it's an `HTTPError`, use its status and body; if it's anything else — an unexpected error we didn't classify — it's a `500`, and we deliberately **don't** leak the internal message to the client.

```go
package framework

import (
	"encoding/json"
	"errors"
	"net/http"
)

// writeError renders any error as a consistent JSON response. Known
// HTTPErrors keep their status and message; unknown errors become an
// opaque 500 so internal details never reach the client.
func writeError(w http.ResponseWriter, err error) {
	var httpErr *HTTPError
	if !errors.As(err, &httpErr) {
		// Unclassified error: log the real one (caller does that), but
		// tell the client only "internal error".
		httpErr = Internal("internal server error")
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(httpErr.Status)
	_ = json.NewEncoder(w).Encode(httpErr)
}
```

`errors.As` (not a type assertion) is intentional: it unwraps. If a handler returns `fmt.Errorf("loading user: %w", NotFound("no such user"))`, `errors.As` still finds the `*HTTPError` inside the wrap chain and renders a clean `404`. That interplay with `%w` wrapping is what makes the type compose with normal Go error handling instead of fighting it.

## Wiring It Into the Router

The router's request lifecycle gets its final form. Compare the last line to the placeholder we started with:

```go
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	tree := r.trees[req.Method]
	if tree == nil {
		writeError(w, &HTTPError{Status: http.StatusMethodNotAllowed, Code: "method_not_allowed", Message: "method not allowed"})
		return
	}
	h, params, ok := tree.search(req.URL.Path)
	if !ok {
		writeError(w, NotFound("route not found"))
		return
	}

	h = Chain(h, r.middleware...)
	ctx := &Context{Writer: w, Request: req, params: params}

	if err := h(ctx); err != nil {
		writeError(w, err) // ONE place renders every handler/middleware error
	}
}
```

Even `404` and `405` now flow through `writeError`, so a missing route returns the same JSON envelope as a handler-level error. Total consistency, defined once.

## End to End

```go
package main

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"

	"yourmodule/framework"
)

func main() {
	r := framework.New()

	r.GET("/users/:id", func(c *framework.Context) error {
		if c.Param("id") == "42" {
			return c.JSON(200, map[string]string{"id": "42", "name": "Ada"})
		}
		return framework.NotFound("no user with that id") // typed error
	})

	srv := httptest.NewServer(r)
	defer srv.Close()

	for _, path := range []string{"/users/42", "/users/99", "/nope"} {
		resp, _ := http.Get(srv.URL + path)
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		fmt.Printf("%-12s %d %s", path, resp.StatusCode, body)
	}
}
```

Output:

```
/users/42    200 {"id":"42","name":"Ada"}
/users/99    404 {"code":"not_found","message":"no user with that id"}
/nope        404 {"code":"not_found","message":"route not found"}
```

A found user, a handler-level `404`, and a routing-level `404` — all three responses share one JSON shape. The handler that returned the error wrote no response code, set no header, and called no `json.Marshal`. It returned a typed value and the framework did the rest.

## Tradeoffs

Centralized error rendering is a clear win, but two honest caveats:

- **Don't over-model errors.** Four or five constructors cover almost everything. A bespoke error type per endpoint is the kind of [premature structure](/go/philosophy/yagni) that adds files without adding value. Add a new one when a real status needs a stable code, not speculatively.
- **Log unclassified errors at the boundary.** `writeError` hides the internal message from the client — correct for security — but that means *something* must log the real error, or you'll get opaque `500`s with no trail. Our [Logger middleware](/go/courses/api-framework/middleware/essential-middleware) already records the returned error, which is exactly why it sits in the stack.

## What's Next

The framework now routes, composes middleware, binds and validates input, and renders consistent errors. What it can't yet do is survive a deploy. The final chapter makes it production-grade: configuration from the environment, graceful shutdown that drains in-flight requests, the timeouts that protect the process — and a complete, runnable server that ties every chapter together.
