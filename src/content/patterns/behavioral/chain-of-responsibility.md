# Chain of Responsibility

Chain of Responsibility passes a request along a sequence of handlers. Each handler decides whether to process the request, modify it, or pass it to the next handler. In Go, this is most commonly seen as HTTP middleware chains, but it applies anywhere you need a pipeline of processors.

The Go idiom favors a slice of handlers or composed middleware functions over linked lists of handler objects.

## Problem

You're building a request processing pipeline. Incoming requests need validation, rate limiting, authentication, and finally handling. The logic for deciding which checks to apply is tangled into a single function with deeply nested conditionals.

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
        return Response{Status: 401, Body: "unauthorized"}
    }
    return Response{Status: 200, Body: "processed: " + req.Body}
}
```

Every new check requires editing this function. The order is implicit. You can't reuse the auth check without the rate limiter. And testing one check requires setting up all the others.

## Solution

Define a `Handler` function type and chain them. Each handler either stops the chain (by returning a response) or calls the next handler.

```
Request ──► Validate ──► RateLimit ──► Auth ──► Handle
               │             │           │          │
             stop?         stop?       stop?     respond
```

```go
// pipeline.go
package pipeline

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

// Handler processes a request. If it returns true, the chain continues.
type Handler func(req Request) (Response, bool)

// Chain runs handlers in order until one stops the chain.
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
        return Response{Status: 401, Body: "unauthorized"}, false
    }
    return Response{}, true
}

func Handle(req Request) (Response, bool) {
    return Response{Status: 200, Body: fmt.Sprintf("processed: %s", req.Body)}, false
}
```

```go
// main.go
package main

import (
    "fmt"
    "pipeline"
)

func main() {
    handler := pipeline.Chain(
        pipeline.Validate,
        pipeline.RateLimit,
        pipeline.RequireAuth,
        pipeline.Handle,
    )

    requests := []pipeline.Request{
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

Output:

```
[200] processed: hello
[401] unauthorized
[429] rate limited
[400] empty body
```

## When to Use

- You need a pipeline of checks or transformations that should be composable and reorderable.
- Each handler is independent and should be testable in isolation.
- You're building HTTP middleware.

## When Not to Use

- The processing order is fixed and unlikely to change. A straightforward function may be clearer.
- There's only one or two steps — the chain machinery adds overhead without benefit.

## Advantages

- Each handler is single-responsibility and independently testable.
- The chain is composable — add, remove, or reorder handlers without changing existing code.
- Naturally maps to Go's HTTP middleware pattern.

## Disadvantages

- Harder to trace which handler responded — debugging can require logging at each step.
- If handlers need to share context, you need to pass it explicitly (e.g., via `context.Context`).

## Related Patterns

- **Decorator** — HTTP middleware is both Decorator and Chain of Responsibility.
- **Command** — Commands can be chained into a pipeline.
