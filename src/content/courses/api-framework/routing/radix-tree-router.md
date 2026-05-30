---
title: "A Real Router: The Radix Tree"
order: 2
description: "Replace the stub with a working tree that matches static and parameterized paths in time proportional to path length, capturing :params as it walks."
---

## Why Not Just a Map?

The obvious router is a `map[string]Handler` keyed by path. It's O(1) and it works — until you need `/users/:id`. A map can't match `/users/42` to a route registered as `/users/:id` because the strings differ. You'd fall back to looping over every route, trying to pattern-match each one: O(routes) per request, and the matching logic gets hairy fast.

A tree solves both problems. We split each path into segments and store them as a tree of nodes. Matching walks the tree one segment at a time — O(path depth), independent of how many routes exist — and a parameter segment is just a special child that matches anything and captures the value.

This is the [Composite pattern](/go/patterns/structural/composite) in structural form: a node and a tree of nodes share the same type, and an operation (`search`) recurses uniformly over the structure.

## The Node

```go
package framework

import "strings"

// node is one segment in the routing tree. A path like "/users/:id"
// becomes a chain: root -> "users" -> ":id" (handler attached at the end).
type node struct {
	children   map[string]*node // static children, keyed by literal segment
	paramChild *node            // matches any single segment (the ":param" case)
	paramName  string           // the name to bind the matched segment to
	handler    Handler          // non-nil iff a route terminates here
}

// splitPath turns "/users/:id" into ["users", ":id"] and "/" into nil.
func splitPath(p string) []string {
	p = strings.Trim(p, "/")
	if p == "" {
		return nil
	}
	return strings.Split(p, "/")
}
```

Each method gets its own tree (we decided that in the previous step), so `node` never has to think about HTTP methods — only path segments.

## Insert

Insertion walks the path segment by segment, creating nodes as needed. A segment starting with `:` becomes the `paramChild`; everything else is a static child in the map.

```go
// insert registers handler h at the given path, creating nodes along
// the way. Called once per route at startup, never on the hot path.
func (n *node) insert(path string, h Handler) {
	cur := n
	for _, seg := range splitPath(path) {
		if strings.HasPrefix(seg, ":") {
			if cur.paramChild == nil {
				cur.paramChild = &node{}
			}
			cur.paramChild.paramName = seg[1:] // store "id", not ":id"
			cur = cur.paramChild
			continue
		}
		if cur.children == nil {
			cur.children = make(map[string]*node)
		}
		child := cur.children[seg]
		if child == nil {
			child = &node{}
			cur.children[seg] = child
		}
		cur = child
	}
	cur.handler = h
}
```

## Search — the Hot Path

Search runs on every request, so it stays allocation-light and simple. At each segment we try a static match first, then fall back to the parameter child. Trying static first is what makes `/users/me` win over `/users/:id` when both are registered — the specific route beats the wildcard.

```go
// search walks the tree for path, returning the handler, any captured
// path parameters, and whether a match was found.
func (n *node) search(path string) (Handler, map[string]string, bool) {
	var params map[string]string
	cur := n

	for _, seg := range splitPath(path) {
		if child, ok := cur.children[seg]; ok {
			cur = child
			continue
		}
		if cur.paramChild != nil {
			if params == nil {
				params = make(map[string]string)
			}
			params[cur.paramChild.paramName] = seg
			cur = cur.paramChild
			continue
		}
		return nil, nil, false // no static or param child matches
	}

	if cur.handler == nil {
		return nil, nil, false // path matched a prefix, but no route ends here
	}
	return cur.handler, params, true
}
```

Two subtle correctness points the comments flag: reading `cur.children[seg]` is safe even when `children` is nil (a nil map reads as empty in Go), and we only allocate the `params` map if a route actually has parameters — most requests pay nothing.

## Proving It Works

A self-contained program that registers routes and exercises the matcher, including the static-beats-param precedence and a miss:

```go
package main

import "fmt"

func main() {
	root := &node{}

	// Register a few routes with trivial handlers we can identify by output.
	root.insert("/health", func(c *Context) error { fmt.Print("health"); return nil })
	root.insert("/users/:id", func(c *Context) error { fmt.Print("user"); return nil })
	root.insert("/users/me", func(c *Context) error { fmt.Print("me"); return nil })

	for _, path := range []string{"/health", "/users/42", "/users/me", "/nope"} {
		h, params, ok := root.search(path)
		if !ok {
			fmt.Printf("%-12s -> 404\n", path)
			continue
		}
		fmt.Printf("%-12s -> ", path)
		_ = h(&Context{}) // prints the handler's tag
		fmt.Printf(" params=%v\n", params)
	}
}
```

Output:

```
/health      -> health params=map[]
/users/42    -> user params=map[id:42]
/users/me    -> me params=map[]
/nope        -> 404
```

`/users/42` captured `id=42` via the param child. `/users/me` matched the static child even though `/users/:id` also exists, because we try static first. `/nope` has no child and returns 404. The matcher does exactly what the API promised in the previous step.

## When Not to Reach for This

A hand-written tree is the right teaching tool and fine for most services, but be honest about the edges:

- **You need full regex constraints on segments** (`/users/:id(\d+)`). That's a different matcher; bolting regex onto each node erodes the O(depth) guarantee. Reach for a router that's designed for it.
- **You need catch-all/wildcard tails** (`/files/*path`). Our tree doesn't handle them yet — it's a focused extension (a `wildcardChild` that consumes the rest), but if you need it on day one, a mature router like Chi already has it.
- **Memory is tight and you have tens of thousands of routes.** Production routers compress single-child chains (the actual "radix" optimization) to save nodes. Our segment trie has identical match complexity but uses more nodes. Rarely worth the added code unless you've measured a problem — [premature optimization is its own trap](/go/philosophy/kiss).

## What's Next

The router is real now: registration, method dispatch, parameterized matching, and `Context` population all work together. But every handler still gets a raw 500 on error, and we have no logging, recovery, or request IDs. The next chapter builds the middleware system — and shows that the middleware chain is two design patterns you already know.
