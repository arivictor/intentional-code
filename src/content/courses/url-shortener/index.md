---
title: "Build a URL Shortener in Go"
description: "Build a URL shortener you can actually deploy — from nothing, using only the Go standard library, with every layer anchored to a design pattern."
level: beginner
tags: ["go", "http", "url-shortener", "stdlib", "production"]
isFeatured: true
---

## What you'll build

A URL shortener is the perfect first production service: small enough to finish, real enough to deploy, and it touches every layer of a backend — an HTTP API, an encoding scheme, a storage engine, a cache, rate limiting, background work, and graceful shutdown.

By the end you'll have a single Go binary that:

- accepts a long URL and returns a short code (`POST /shorten`)
- redirects `GET /{code}` to the original URL
- persists links to disk and survives a restart
- caches hot links, rate-limits abusers, and counts clicks without slowing redirects
- reads its config from the environment and shuts down cleanly under load

## The constraint: standard library only

No web framework. No database driver. No Redis client. No third-party router. **Everything is `net/http`, `database/sql`-free, pure Go.**

This isn't nostalgia. The constraint forces you to *build* each capability instead of importing it — and building it is where the design patterns earn their keep. You can't `go get` a cache, so you'll write one and discover it's the [Decorator pattern](/go/patterns/structural/decorator). You can't import a rate limiter, so you'll write a token bucket and recognise [Strategy](/go/patterns/behavioral/strategy). The patterns stop being vocabulary and become tools.

## How it maps to the patterns

Each chapter is anchored to a pattern or principle this site already teaches:

- **Foundations** — separating generation, storage, and transport → [Separation of Concerns](/go/philosophy/separation-of-concerns)
- **Generating Short Codes** — swappable code strategies → [Strategy](/go/patterns/behavioral/strategy)
- **Storage** — a storage interface, then a caching wrapper → [Repository](/go/patterns/architectural/repository) + [Decorator](/go/patterns/structural/decorator)
- **The HTTP API** — handlers that return errors → cross-links the [API Framework course](/go/courses/api-framework)
- **Hardening** — rate limiting and non-blocking analytics → [Worker Pool](/go/patterns/concurrency/worker-pool)
- **Production** — config and graceful shutdown → [The Twelve-Factor App](/go/philosophy/twelve-factor)

## Who this is for

If you know Go's syntax and have written a `main` function, you're ready. You don't need prior backend experience — every pattern is introduced where it's needed and linked to its reference page. If you've taken the [API Framework course](/go/courses/api-framework), you'll recognise the handler style and can move quickly.

Start with **Foundations → Why build a URL shortener**.
