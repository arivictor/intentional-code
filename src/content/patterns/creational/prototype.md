---
title: "Prototype"
category: creational
intent: "Create new objects by cloning an existing instance, avoiding the cost of building from scratch and decoupling code from concrete types."
idiomSummary: "A Clone() method; be explicit about shallow vs deep copy with pointers, slices, maps."
relatedSlugs: ["factory-method", "memento"]
tags: [state, composition]
---

# Prototype

Go's struct assignment copies by value — clean for `string` and `int` fields, but silently dangerous for `[]string`, `map[string]string`, and pointer fields, which share the same underlying memory with the original. The value of Prototype in Go is not performance (avoiding expensive constructors) but correctness: a `Clone()` method makes deep-copy semantics explicit and localized, so reference types are never accidentally shared between what you thought were independent copies.

## Problem

You have an HTTP request template — a base request with preset headers and query parameters that many parts of the code build on. The template has nested structures: a header map, a slice of query parameters. You need independent copies per request, but Go's assignment operator only does a shallow copy. Modifying the "copy" mutates the template.

```go
// shallow_bug.go
package main

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

Implement a `Clone()` method that explicitly deep-copies every reference type. Making it a method ensures the copy logic lives with the type rather than scattered across callers.

```
┌───────────────────┐    Clone()    ┌───────────────────┐
│      base         │──────────────►│      copy         │
│───────────────────│               │───────────────────│
│ Method: "GET"     │               │ Method: "GET"     │
│ Headers ────────►{Accept:json}    │ Headers ────────►{Accept:json}  ◄── new map
│ Tags ───────────►["v1"]           │ Tags ───────────►["v1"]         ◄── new slice
└───────────────────┘               └───────────────────┘
```

```go
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
- You want to decouple code from the concrete types it copies — work with a `Cloneable` interface.
- Your types contain reference types (slices, maps, pointers) and you need truly independent copies.

## When Not to Use

- Your type is simple and has only value fields — plain struct assignment is the correct copy mechanism.
- Deep copying is too expensive for your use case — consider immutable shared state ([Flyweight](/go/patterns/structural/flyweight)) instead.
- You only need a few variations — a constructor with parameters is simpler than cloning and modifying.

## Tradeoffs

The `Clone()` method is the right tool when correctness requires truly independent copies of reference types — but it has to be maintained manually. Every time you add a slice, map, or pointer field to a struct, you must also update `Clone()` or you silently introduce a sharing bug. The Go compiler gives you no help here: a forgotten field passes all type checks and only fails at runtime when a mutation bleeds through. Deep-copying large object graphs is also proportionally expensive — if the object you're cloning contains many nested pointers, the clone walks all of them. For objects with circular references, you need to track visited nodes, which adds real complexity. If the primary goal is snapshotting state for undo rather than creating a new independent instance, [Memento](/go/patterns/behavioral/memento) is a more targeted fit.

## Related Patterns

- **Factory Method** — Use Factory Method when creating an object from scratch is straightforward and the choice of which concrete type matters; use Prototype when the existing state of an instance is the right starting point for a new independent copy.
- **Memento** — Memento also copies object state, but for undo/restore rather than creating new independent instances; the distinction is purpose — Memento saves a snapshot to roll back to, Prototype creates a new peer to build on separately.
