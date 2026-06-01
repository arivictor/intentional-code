---
title: "Why Build Your Own Framework?"
order: 1
description: "Why you build your own HTTP framework — to understand the one you'll run in production, and to own the thin layer every team ends up writing."
---

## Why Build Your Own Framework?

When you use a third-party framework, it is a dependency you don't understand. It's a black box that turns your handlers into something that runs on the network, and you have no idea how. So when something breaks in production, you're diving into GitHub issues instead of reading your own code. More often than not you'll find yourself bending to the opinion of the frameworks authors or trying to bend the framework to your will.

Build it yourself and the black box becomes glass. You understand every line, so you change it whenever you want — add what your use case needs, delete what it doesn't. And you come out knowing how HTTP and a Go web server actually work, not just how to configure someone else's.

Building your own also kills a myth: that the framework's way is the only way. There's nothing sacred about another team's opinions — you can build one that fits yours. By the end of this course you'll have a working HTTP framework you wrote yourself, and a real feel for the conventions every team eventually reinvents. From there you can extend it however you like, or, at worst, walk away with a sharper appreciation for whichever framework you choose.

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

## Getting Started

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
