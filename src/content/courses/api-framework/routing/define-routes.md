---
title: "The Routing API"
order: 1
description: "Design the route-registration surface — method helpers, route groups, and the Router that ties handlers to net/http."
---

## Start From the Caller

A router has two audiences: the developer registering routes and the runtime matching requests. Most tutorials start with matching. We start with registration, because the *shape of the call site* is the part you can never change later without breaking everyone's code. Matching is an implementation detail you can rewrite; the API is a promise.

Here is the call site we want:

```go
r := framework.New()

r.GET("/health", health)
r.GET("/users/:id", getUser)
r.POST("/users", createUser)

api := r.Group("/v1")
api.Use(auth)              // middleware scoped to this group
api.GET("/me", currentUser)
```

Three properties we're committing to: method-named helpers (`GET`, `POST`, …), a `:param` syntax for path variables, and groups that share a prefix and middleware. Everything below serves that call site.

## The Router Type

The router holds registered routes and the global middleware stack. We keep matching behind a `tree` type (built in the next step) so the router doesn't care *how* matching works — only that, given a method and path, it gets back a handler and the captured parameters.

```go
package framework

import "net/http"

// Router is the entry point. It implements http.Handler so it plugs
// straight into http.Server.
type Router struct {
	trees      map[string]*node // one radix tree per HTTP method
	middleware []Middleware     // global stack, applied to every route
}

func New() *Router {
	return &Router{trees: make(map[string]*node)}
}

// Use appends middleware applied to every route registered afterward.
func (r *Router) Use(mw ...Middleware) {
	r.middleware = append(r.middleware, mw...)
}
```

One tree per method is a deliberate choice. Dispatching on the method *first* means the path matcher never has to consider method at all — `GET /users` and `POST /users` live in entirely separate trees. It's simpler and faster than threading the method through every node.

## Method Helpers

The `GET`/`POST`/`PUT`/`DELETE` helpers are thin wrappers over a single `handle` method. Resist the urge to be clever here; the repetition is the [DRY principle](/go/philosophy/dry) understood correctly — these are not duplication, they're four names for four genuinely different HTTP semantics.

```go
func (r *Router) GET(path string, h Handler)    { r.handle(http.MethodGet, path, h) }
func (r *Router) POST(path string, h Handler)   { r.handle(http.MethodPost, path, h) }
func (r *Router) PUT(path string, h Handler)    { r.handle(http.MethodPut, path, h) }
func (r *Router) DELETE(path string, h Handler) { r.handle(http.MethodDelete, path, h) }

func (r *Router) handle(method, path string, h Handler) {
	if r.trees[method] == nil {
		r.trees[method] = &node{}
	}
	r.trees[method].insert(path, h)
}
```

`node` and `insert` are stubs for now — the next step builds them. We're defining the *boundary*: the router talks to the tree through `insert(path, handler)` and `search(path)`. That boundary is what lets us swap a naive map for a radix tree later without touching a single line of router code.

## Serving Requests

The router becomes an `http.Handler` by implementing `ServeHTTP`. This is where method dispatch, path matching, the [middleware chain](/go/patterns/structural/decorator), and the [Context](/go/courses/api-framework/foundations/design-the-core) from Chapter 1 all come together.

```go
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	tree := r.trees[req.Method]
	if tree == nil {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	h, params, ok := tree.search(req.URL.Path)
	if !ok {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}

	// Wrap the matched handler in the global middleware stack.
	h = Chain(h, r.middleware...)

	ctx := &Context{Writer: w, Request: req, params: params}
	if err := h(ctx); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
```

That is the entire request lifecycle in fifteen lines: dispatch by method, match the path, wrap in middleware, build the context, run the handler, handle the error. Every later chapter slots into a line you can already see — `Chain` gets fleshed out in Chapter 3, the error branch in Chapter 4.

## Groups

Groups share a path prefix and a middleware stack. The cleanest implementation is a tiny struct that remembers its prefix and delegates back to the router.

```go
type Group struct {
	prefix     string
	router     *Router
	middleware []Middleware
}

func (r *Router) Group(prefix string) *Group {
	return &Group{prefix: prefix, router: r}
}

func (g *Group) Use(mw ...Middleware) { g.middleware = append(g.middleware, mw...) }

func (g *Group) GET(path string, h Handler) {
	// Prepend the group's middleware to the handler, then register
	// the prefixed path on the underlying router.
	wrapped := Chain(h, g.middleware...)
	g.router.GET(g.prefix+path, wrapped)
}
```

A group is not a new router — it's a *view* onto the same trees with a prefix and some pre-applied middleware. That keeps a single source of truth for matching and avoids the bug where nested routers each match independently.

## What's Next

We have a clean registration API and a request lifecycle, but `insert` and `search` are stubs. A naive implementation would store routes in a slice and loop over them comparing strings — O(routes) per request, and no way to capture `:id`. In the next step we build a radix tree that matches in O(path length) and extracts parameters as it walks.
