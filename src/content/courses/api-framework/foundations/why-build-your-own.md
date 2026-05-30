---
title: "Why Build Your Own Framework?"
order: 1
description: "The honest case for building your own HTTP framework — when it pays off, when it is a mistake, and what we are actually going to ship."
---

## The Question You Should Ask First

Go has Gin, Echo, Chi, Fiber, and a standard library `net/http` that, since Go 1.22, routes by method and path on its own. So why would anyone write their own framework?

The wrong answer is "frameworks are bloated, I'll do better." You probably won't, and reinventing a worse Gin helps no one. The honest answer is narrower and more useful:

**You build your own framework to understand the one you'll actually use in production, and to own the thin layer where every team's API conventions diverge from the defaults.**

Every company that runs Go services at scale ends up with an internal `httpx` or `server` package. It is rarely a full framework. It is the standard library plus a handful of decisions like how errors become JSON, how requests get an ID, how the server shuts down, made *once* so that two hundred handlers don't each make them differently. That thin layer is what we are building. By the end you will understand exactly what Gin does for you, and you will be able to decide, per project, whether you even need it.

## When Building Your Own Is the Right Call

- **You have cross-cutting conventions that no off-the-shelf framework enforces.** Consistent error envelopes, mandatory request IDs, a specific logging schema your observability stack expects. A thin internal layer makes the right thing the default.
- **You want a dependency you fully understand.** When a request hangs in production at 2 a.m., reading 400 lines of your own code beats spelunking a framework's issue tracker.
- **You are learning.** Building the thing teaches you more about HTTP, `context.Context`, and Go interfaces than any number of tutorials using someone else's router.

## When It Is a Mistake

Be ruthless here. This is the [YAGNI principle](/go/philosophy/yagni) applied to infrastructure:

- **You need WebSockets, HTTP/2 server push, or automatic OpenAPI generation next week.** Use a mature framework. Rebuilding those is months of work to reach parity.
- **Your team is three people shipping a product.** Your competitive advantage is not your router. Reach for Chi or stdlib and move on.
- **You can't articulate what the framework would do that `net/http` doesn't.** If you can't name the thin layer, you don't need one yet. [Keep it simple](/go/philosophy/kiss) until a real need appears.

A framework is a bet that you'll write enough handlers to amortize its cost. Five endpoints don't justify it. Five hundred do.

## What We Are Actually Building

A focused, production-grade layer on top of `net/http` that gives you:

- A **handler signature that returns an error**, so error handling stops being copy-pasted into every handler.
- A **radix-tree router** with path parameters to understand how real routers match `/users/:id` in constant time.
- A **composable middleware chain** built from two classic design patterns.
- **Binding, validation, and structured errors** so the edges of your API are consistent.
- **Graceful shutdown, timeouts, and twelve-factor configuration** which makes the difference between "runs on my laptop" and "survives a deploy."

We will only use the standard library. No third-party dependencies. By the final chapter you'll have a single package you can copy into a real service and a `main.go` that runs.

## The One Design Decision That Drives Everything

Here is the seed the whole framework grows from. The standard library's handler looks like this:

```go
type Handler interface {
	ServeHTTP(http.ResponseWriter, *http.Request)
}
```

Notice what's missing: there is **no return value**. A handler that hits a database error has to decide, right there, how to turn that into an HTTP response — set the status, write the body, log it, and `return`. Multiply that across every handler and you get the exact mess the [Decorator pattern page](/go/patterns/structural/decorator) opens with: cross-cutting concerns smeared through business logic.

Our entire framework is a response to that one omission. We give handlers a return value:

```go
type Handler func(*Context) error
```

That single `error` return is the hinge. It lets a central place — not each handler — decide how errors become responses. It makes middleware able to inspect and transform outcomes. It is why our handlers will be three lines long instead of thirty.

In the next step we design that `Context` and prove the new signature still plugs into `net/http` without friction.
