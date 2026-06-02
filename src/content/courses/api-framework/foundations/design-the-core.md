---
title: "Designing the Core: Handler and Context"
order: 2
description: "Define the two types the whole framework hangs off of — a handler that returns an error and a request context — and adapt them to net/http."
---

## Let's Get Started

An API framework starts with two decisions: *what is a handler* and *what does a handler receive*. If these choices are clean, routing, middleware, and error handling stay clean too.

A handler is a unit of work. It is the function that does the thing you want to do when a request comes in. It is the function that gets called when a request matches a route. It is the function that gets wrapped by middleware. It is the function that returns an error if something goes wrong.

Here is the interface that the whole framework grows from. The standard library's handler looks like this:

```go
type Handler interface {
	ServeHTTP(http.ResponseWriter, *http.Request)
}
```

Notice that there is **no return value**. If the handler hits a database error during a handling a request, it must decide right there how to respond: set status, write body, log, and return. You end up copy-pasting that error handling into every handler. That is a smell.

**Let's write our first bit of code**

We can write out own Handler signature that returns an error. This is the core of our framework: a handler that returns an error. But there is one issue: this is not compatible with `net/http`. We will adapt it later to the standard library so we can run it directly.

```go
// main.go

package main

type Handler func(*Context) error
```

Next, we'll design the missing `Context` and show how it all still plugs into `net/http` directly.

## The Context

The context is the second core type. It is what a handler receives as an argument. It carries everything a handler needs for one request. It wraps the standard writer/request pair and adds per-request state like path parameters plus helpers for the common cases.

The standard library gives its handler two arguments: `http.ResponseWriter` and `*http.Request`. That works, but it is minimal. Real handlers also need path params, JSON input, and JSON output. We bundle those in one place with the `Context` type.

```go
package main

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

// ...other code ...
```

`Context` is a concrete struct, not an interface. There is one real implementation, so an interface here only adds indirection. This is [YAGNI](/go/philosophy/yagni).

## Adapting to net/http

Here is the key constraint: `net/http` does not know our new `Handler` type. It only knows `http.Handler`. We won't be able to use it in its current state. But we have some architecural decisions to now make. We could:

- Change our `Handler` signature to match `http.Handler` and give up the error return.
- Write an adapter that converts our `Handler` to `http.Handler` and keeps the error return.

Let's use the [Adapter pattern](/go/patterns/structural/adapter). It is a single function that converts our `Handler` to `http.HandlerFunc`. It is the only place in the codebase that knows about both types. It is the only place we have to change if we want to swap out one of the types later.

```go
package main

import "net/http"

// ... other code ...

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

This works with the native `http.Handler` interface because the return function signature of our `toHTTPHandler` adapter conforms to `ServeHTTP`. This closure is where all the logic for handling request now lives. It is also the function we will later wrap with middleware.

The adapter is also where returned errors are handled. For now, it returns a basic 500. In Chapter 4, we will upgrade error handling by editing this one location.

Let's add a public wrapper around the `toHTTPHandler` adapter so application code can use it:

```go
package framework

import "net/http"

// Adapt exposes the internal adapter with no route params.
func Adapt(h Handler) http.HandlerFunc {
	return toHTTPHandler(h, nil)
}
```

## What You Have So Far

```go

```

## Proving It Runs

Now wire one handler through the adapter and run it with the standard library.

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
	mux.Handle("/greet", framework.Adapt(greet))

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

`Adapt` is intentionally small. In the next chapter, the router will pass params into `toHTTPHandler`.

## What We Have

With two types and one adapter, we can already serve JSON through `net/http` using error-returning handlers. Next we add a router for `params`, middleware around `Handler`, and structured error handling.

Next chapter: routing. We'll build a radix tree that matches `/users/:id` in time proportional to the path length, not the number of routes.
