---
title: "Why Build a URL Shortener?"
order: 1
description: "The honest case for and against building your own — and why it's the ideal first production service to learn on."
---

## A Suspiciously Simple Problem

A URL shortener takes `https://example.com/some/very/long/path?with=params` and gives back `https://sho.rt/9aX2`. Visit the short link, get redirected. That's the entire product.

It sounds like a weekend toy, and the naive version *is* — a map and two HTTP handlers:

```go
var links = map[string]string{}

func shorten(w http.ResponseWriter, r *http.Request) {
	code := fmt.Sprintf("%d", len(links)) // "0", "1", "2"...
	links[code] = r.FormValue("url")
	fmt.Fprintln(w, code)
}

func redirect(w http.ResponseWriter, r *http.Request) {
	url := links[r.PathValue("code")]
	http.Redirect(w, r, url, http.StatusFound)
}
```

This works on your laptop, for one user, until you restart the process and every link evaporates. It's the right place to *start* and the wrong place to *stop*. The interesting part of a URL shortener isn't the redirect — it's everything the toy version ignores: codes that don't leak how many links exist, storage that survives a restart, reads that stay fast under load, and abusers who can't fill your disk with junk.

That gap between the toy and the real thing is exactly why this is the best first production service to build. The problem is small enough to hold in your head, but every layer you add is a layer you'll add in *every* backend you ever write.

## When You Should Just Use a Service

Intellectual honesty first: most of the time, you should **not** build this. If you need short links for a marketing campaign, Bitly, a cloud provider's redirect service, or a five-line Cloudflare Worker will outlast and outperform anything you stand up yourself. They handle abuse, analytics, custom domains, and 99.99% uptime as someone else's problem.

This is [YAGNI](/go/philosophy/yagni) talking: *you aren't gonna need* a bespoke shortener for a bespoke shortener's sake. Build your own when one of these is actually true:

- **The links can't leave your network.** Internal tools, healthcare, finance — the long URLs are sensitive and can't be handed to a third party.
- **You need it embedded.** The shortener is a feature *inside* a product you already run (a paste service, a link-in-bio app), not a standalone tool.
- **You're learning.** You want to understand storage, caching, and concurrency by building them, not by reading a vendor's docs.

This course is mostly the third reason, honestly held. We're going to build the real thing — abuse handling and all — because the *building* is the lesson. Just don't mistake "I built a URL shortener" for "I should run a URL shortener."

## What "Production-Ready" Actually Means

We'll use the phrase a lot, so let's pin it down. A production-ready service isn't one with the most features — it's one that behaves predictably when things go wrong. For our shortener that means six concrete properties, and each one is a chapter:

| Property | What it rules out | Where we build it |
|---|---|---|
| **Unguessable codes** | Competitors counting your growth by incrementing IDs | Generating Short Codes |
| **Durable storage** | Losing every link on restart | Storage |
| **Fast reads** | A slow disk making every redirect crawl | Storage (caching) |
| **Abuse resistance** | One client filling your disk | Hardening (rate limiting) |
| **Non-blocking analytics** | Click-counting slowing the redirect | Hardening (worker pool) |
| **Clean lifecycle** | Dropped requests on deploy | Production (graceful shutdown) |

Notice what's *not* on the list: custom domains, a web UI, user accounts, QR codes. Those are real features, but they're not what makes a service production-ready — they're what makes it a product. We're drawing the line deliberately ([KISS](/go/philosophy/kiss)): the smallest system that has all six properties, and nothing past it.

## Why Standard-Library-Only

Every line of this service is the Go standard library. No router, no ORM, no cache library, no rate-limiter package. That's a teaching choice, and worth defending.

When you `go get` a rate limiter, you get a working rate limiter and *zero understanding* of how it works. When you're forced to write one with nothing but `time` and a mutex, you discover it's a token bucket, you discover why the bucket needs a maximum, and you discover that the shape of the problem — "swap the limiting algorithm without touching the middleware" — is the [Strategy pattern](/go/patterns/behavioral/strategy). The constraint manufactures the lessons.

It also happens to be honest about Go's strengths. The standard library's `net/http` is a complete, production-grade HTTP server. `crypto/rand` gives you unguessable codes. `expvar` exposes metrics. Goroutines and channels give you a worker pool. Go ships with most of a backend in the box — and a URL shortener is the perfect size to prove it.

## What's Next

We've decided *what* we're building and *why*. Next we make the one architectural decision the entire course rests on: cleanly separating the three things this service does — generating codes, storing links, and speaking HTTP — so each can change without disturbing the others. That's [Separation of Concerns](/go/philosophy/separation-of-concerns), and it's what turns the toy above into something you can grow.
