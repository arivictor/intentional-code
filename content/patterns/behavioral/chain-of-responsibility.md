---
title: "Chain of Responsibility"
description: "Pass a request along a chain of handlers, where each handler decides whether to process it or pass it to the next handler."
---

# Chain of Responsibility

**Buys composable, independently testable pipeline steps that can short-circuit; pays in debuggability — you must add logging to see where a request stopped.**

Chain of Responsibility passes a request along a sequence of handlers. Each handler decides whether to process the request, short-circuit with a response, or pass it on. In Go, this is most commonly seen as HTTP middleware chains, but the pattern applies anywhere you need a composable pipeline of independent checks or transformations.

The Go idiom favours a slice of handler functions over linked-list objects: simpler to construct, reorder, and test in isolation.

## Scenario

You're building a request processing pipeline. Incoming requests need validation, rate limiting, authentication, and finally handling. The logic for all of this is tangled into a single function with nested conditionals.

```go
// tangled.go
func processRequest(req Request) Response {
    if req.Body == "" {
        return Response{Status: 400, Body: "empty body"}
    }
    if isRateLimited(req.IP) {
        return Response{Status: 429, Body: "too many requests"}
    }
    if !isAuthenticated(req.Token) {
        return Response{Status: 401, Body: "unauthorised"}
    }
    return Response{Status: 200, Body: "ok: " + req.Body}
}
```

Every new check requires editing this function. The order is implicit. You can't reuse the auth check without the rate limiter. Testing one check requires setting up all the others.

## Solution

Define a `Handler` function type and chain them. Each handler either stops the chain (by returning a response) or signals the next handler to continue.

```
Request ──► Validate ──► RateLimit ──► Auth ──► Handle
               │             │           │          │
             stop?         stop?       stop?     respond
```

```go:title="main.go":run=true:editable=true
package main

import "fmt"

type Request struct {
	IP    string
	Token string
	Body  string
}

type Response struct {
	Status int
	Body   string
}

type Handler func(req Request) (Response, bool)

func Chain(handlers ...Handler) Handler {
	return func(req Request) (Response, bool) {
		for _, h := range handlers {
			resp, cont := h(req)
			if !cont {
				return resp, false
			}
		}
		return Response{Status: 500, Body: "no handler responded"}, false
	}
}

func Validate(req Request) (Response, bool) {
	if req.Body == "" {
		return Response{Status: 400, Body: "empty body"}, false
	}
	return Response{}, true
}

func RateLimit(req Request) (Response, bool) {
	if req.IP == "blocked" {
		return Response{Status: 429, Body: "rate limited"}, false
	}
	return Response{}, true
}

func RequireAuth(req Request) (Response, bool) {
	if req.Token == "" {
		return Response{Status: 401, Body: "unauthorised"}, false
	}
	return Response{}, true
}

func Handle(req Request) (Response, bool) {
	return Response{Status: 200, Body: fmt.Sprintf("ok: %s", req.Body)}, false
}

func main() {
	handler := Chain(Validate, RateLimit, RequireAuth, Handle)

	requests := []Request{
		{IP: "1.2.3.4", Token: "valid", Body: "hello"},
		{IP: "1.2.3.4", Token: "", Body: "hello"},
		{IP: "blocked", Token: "valid", Body: "hello"},
		{IP: "1.2.3.4", Token: "valid", Body: ""},
	}

	for _, req := range requests {
		resp, _ := handler(req)
		fmt.Printf("[%d] %s\n", resp.Status, resp.Body)
	}
}
```

Run it to push four requests through the chain and see which link stops each one:

```
[200] ok: hello
[401] unauthorised
[429] rate limited
[400] empty body
```

## When to Use

- You need a pipeline of checks or transformations that should be composable and reorderable.
- Each handler is independent and should be testable in isolation.
- You're building HTTP middleware.

## When Not to Use

- The processing order is fixed and unlikely to change. A straightforward function may be clearer.
- There's only one or two steps. The chain machinery adds overhead without benefit.

## Tradeoffs

Each handler is independently testable, which is the main win. The cost you pay is debuggability: when a request returns 401, you know the chain stopped somewhere, but you have to add logging or introspection to know where. If handlers need to share mutable context across the chain (adding a user ID after auth so later handlers can read it), you need to thread that through explicitly, typically via `context.Context` rather than mutating the request. The pattern also silently discards the "continue" bool from the final handler, so forgetting to add a terminal handler produces a confusing 500 from the fallthrough case rather than a compile error.

## Related Patterns

- **Decorator:** HTTP middleware is both Decorator and Chain of Responsibility. Each middleware wraps the next (Decorator) and may short-circuit without calling the inner handler (Chain of Responsibility). If every step always calls the next, it's pure Decorator; if steps may stop the chain, it's Chain of Responsibility.
- **Command:** Commands can be the handlers in a chain, combining pipeline composability with undo and queuing capabilities.
