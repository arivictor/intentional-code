---
title: "Why Build Your Own Framework?"
order: 1
description: "Why you build your own HTTP framework — to understand the one you'll run in production, and to own the thin layer every team ends up writing."
---

## The Real Reason to Build Your Own

Go has Gin, Echo, Chi, Fiber, and a standard library `net/http` that, since Go 1.22, routes by method and path on its own. So why build your own? Not to beat Gin at being Gin — the reason is narrower and more useful:

**You build your own framework to understand the one you'll actually use in production, and to own the thin layer where every team's API conventions diverge from the defaults.**

Every company that runs Go services at scale ends up with an internal `httpx` or `server` package. It is rarely a full framework. It is the standard library plus a handful of decisions like how errors become JSON, how requests get an ID, how the server shuts down, made *once* so that two hundred handlers don't each make them differently. That thin layer is what we are building — and by the end you'll understand exactly what Gin does for you, because you'll have built the heart of it yourself.

## What Building It Gives You

- **Conventions that become the default.** Consistent error envelopes, mandatory request IDs, the logging schema your observability stack expects — a thin internal layer makes the right thing automatic across two hundred handlers.
- **A dependency you fully understand.** When a request hangs in production at 2 a.m., reading 400 lines of your own code beats spelunking a framework's issue tracker.
- **Real fluency in HTTP and Go.** Building the thing teaches you more about `net/http`, `context.Context`, and Go interfaces than any number of tutorials wiring up someone else's router.

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
