---
title: "Prototype"
description: "Create new objects by cloning an existing instance, avoiding the cost of building from scratch and decoupling code from concrete types."
---

# Prototype

**Buys correct, independent deep copies of reference fields; pays in manual `Clone()` upkeep — a forgotten field is a silent sharing bug the compiler won't catch.**

The Prototype pattern creates new objects by cloning an existing instance, avoiding the cost of building from scratch and decoupling code from concrete types. In Go, this is typically implemented with a `Clone()` method that returns a copy of the object. The key value of Prototype in Go is correctness: Go's struct assignment does a shallow copy, which can lead to shared mutable state if your struct contains reference types (maps, slices, pointers). A `Clone()` method makes the deep-copy semantics explicit and localised, so you can ensure that each copy is truly independent.

## Scenario

You have an HTTP request template: a base request with preset headers and query parameters that many parts of the code build on. The template has nested structures (a header map, a slice of query parameters). You need independent copies per request, but Go's assignment operator only does a shallow copy. Modifying the "copy" mutates the template.

```go
// shallow_bug.go
package gomark

type Request struct {
    Method  string
    URL     string
    Headers map[string]string
    Tags    []string
}

func main() {
    base := &Request{
        Method:  "GET",
        Headers: map[string]string{"Accept": "application/json"},
        Tags:    []string{"v1"},
    }

    // WRONG: shallow copy — map and slice share underlying memory
    req := *base
    req.URL = "/users"
    req.Headers["Authorization"] = "Bearer token" // DANGER: mutates base!
    req.Tags = append(req.Tags, "auth")            // DANGER: may mutate base!
}
```

The struct assignment copies fields by value, but maps and slices hold references. The "copy" and the template share the same underlying data. This is a common source of subtle bugs in Go, especially when templates are reused concurrently.

## Solution

Implement a `Clone()` method that explicitly deep-copies every reference type. Making it a method ensures the copy logic lives with the type rather than scattered across callers. Run the example to confirm each clone is fully independent of the base:

```
┌───────────────────┐    Clone()    ┌───────────────────┐
│      base         │──────────────►│      copy         │
│───────────────────│               │───────────────────│
│ Method: "GET"     │               │ Method: "GET"     │
│ Headers ────────►{Accept:json}    │ Headers ────────►{Accept:json}  ◄── new map
│ Tags ───────────►["v1"]           │ Tags ───────────►["v1"]         ◄── new slice
└───────────────────┘               └───────────────────┘
```

```go:title="main.go":run=true:editable=true
package main

import "fmt"

type Request struct {
	Method  string
	URL     string
	Headers map[string]string
	Tags    []string
}

func (r *Request) Clone() *Request {
	clone := &Request{Method: r.Method, URL: r.URL}
	if r.Headers != nil {
		clone.Headers = make(map[string]string, len(r.Headers))
		for k, v := range r.Headers {
			clone.Headers[k] = v
		}
	}
	if r.Tags != nil {
		clone.Tags = make([]string, len(r.Tags))
		copy(clone.Tags, r.Tags)
	}
	return clone
}

func main() {
	base := &Request{
		Method:  "GET",
		Headers: map[string]string{"Accept": "application/json"},
		Tags:    []string{"v1"},
	}

	users := base.Clone()
	users.URL = "/users"
	users.Headers["Authorization"] = "Bearer token-a"
	users.Tags = append(users.Tags, "users")

	metrics := base.Clone()
	metrics.URL = "/metrics"
	metrics.Headers["Authorization"] = "Bearer token-b"

	fmt.Printf("base headers:    %v\n", base.Headers)
	fmt.Printf("users headers:   %v\n", users.Headers)
	fmt.Printf("metrics headers: %v\n", metrics.Headers)
	fmt.Printf("base tags:       %v\n", base.Tags)
	fmt.Printf("users tags:      %v\n", users.Tags)
}
```

Output:

```
base headers:    map[Accept:application/json]
users headers:   map[Accept:application/json Authorization:Bearer token-a]
metrics headers: map[Accept:application/json Authorization:Bearer token-b]
base tags:       [v1]
users tags:      [v1 users]
```

## When to Use

- You need to create objects that are variations of an existing instance, and construction from scratch is expensive or complex.
- You want to decouple code from the concrete types it copies: work with a `Cloneable` interface.
- Your types contain reference types (slices, maps, pointers) and you need truly independent copies.

## When Not to Use

- Your type is simple and has only value fields. Plain struct assignment is the correct copy mechanism.
- Deep copying is too expensive for your use case. Consider immutable shared state ([Flyweight](/patterns/structural/flyweight)) instead.
- You only need a few variations. A constructor with parameters is simpler than cloning and modifying.

## The Decision

The `Clone()` method is the right tool when correctness requires truly independent copies of reference types, but it has to be maintained manually. Every time you add a slice, map, or pointer field to a struct, you must also update `Clone()` or you silently introduce a sharing bug. The Go compiler gives you no help here: a forgotten field passes all type checks and only fails at runtime when a mutation bleeds through.

Deep-copying large object graphs is also proportionally expensive. If the object you're cloning contains many nested pointers, the clone walks all of them. For objects with circular references, you need to track visited nodes, which adds real complexity. If the primary goal is snapshotting state for undo rather than creating a new independent instance, [Memento](/patterns/behavioral/memento) is a more targeted fit.

The standard library ships a Prototype you've already used: `(*http.Request).Clone(ctx)` deep-copies the header map and trailers so the copy can be mutated without disturbing the original — and it's a method precisely because a shallow struct copy would share those maps.

## Related Patterns

- **Factory Method**: Use Factory Method when creating an object from scratch is straightforward and the choice of which concrete type matters; use Prototype when the existing state of an instance is the right starting point for a new independent copy.
- **Memento**: Memento also copies object state, but for undo/restore rather than creating new independent instances. The distinction is purpose: Memento saves a snapshot to roll back to, Prototype creates a new peer to build on separately.
