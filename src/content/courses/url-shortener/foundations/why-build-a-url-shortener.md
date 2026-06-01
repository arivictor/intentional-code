---
title: "Why Build a URL Shortener?"
order: 1
description: "Why a URL shortener is the ideal first backend to build — and the six properties that separate the real thing from the toy."
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

## Why This Is the Project to Learn On

A URL shortener is the best first backend you can build, and its small surface area is exactly why. Three things line up:

- **It's small enough to finish.** The whole product is "store a mapping, redirect on lookup." You can hold it in your head, which means your attention goes to *how* you build each layer — not to keeping a sprawling spec straight.
- **Every layer generalises.** Unguessable IDs, durable storage, a read cache, rate limiting, background work, graceful shutdown — you will add every one of these to *every* backend you ever write. Here they arrive one at a time, in isolation, where you can actually watch each pattern do its job.
- **Building it yourself forces understanding.** You can't `go get` your way past the interesting parts, so you build them — and discover the cache is a Decorator, the code generator is a Strategy, the analytics path is a Worker Pool. The patterns stop being vocabulary and become tools you've used.

Build it end to end and you don't just have a URL shortener — you have a working model of how a production Go service fits together, with every layer anchored to a pattern you can reach for anywhere.

## What Separates the Real Thing from the Toy

The toy version breaks the moment anything goes wrong: a restart, a second user, a bored abuser. The version we build holds up — and "holds up" comes down to six concrete properties. Each one is a chapter:

| Property | What it rules out | Where we build it |
|---|---|---|
| **Unguessable codes** | Competitors counting your growth by incrementing IDs | Generating Short Codes |
| **Durable storage** | Losing every link on restart | Storage |
| **Fast reads** | A slow disk making every redirect crawl | Storage (caching) |
| **Abuse resistance** | One client filling your disk | Hardening (rate limiting) |
| **Non-blocking analytics** | Click-counting slowing the redirect | Hardening (worker pool) |
| **Clean lifecycle** | Dropped requests on deploy | Production (graceful shutdown) |

What's *not* on the list: custom domains, a web UI, user accounts, QR codes. Those are real features — they just make it a *product*, not a working service. We draw the line deliberately ([KISS](/go/philosophy/kiss)): the smallest system that has all six properties, and nothing past it. Build it and you can deploy it.

## Why Build It Yourself

Almost every line of this service is the Go standard library. No router, no ORM, no cache library, no rate-limiter package — you build those, because building them is where the learning lives. That's a teaching choice, and worth defending.

When you `go get` a rate limiter, you get a working rate limiter and *zero understanding* of how it works. When you're forced to write one with nothing but `time` and a mutex, you discover it's a token bucket, you discover why the bucket needs a maximum, and you discover that the shape of the problem — "swap the limiting algorithm without touching the middleware" — is the [Strategy pattern](/go/patterns/behavioral/strategy). Building it manufactures the lessons.

The exception proves the rule: for durable storage we reach for **SQLite** instead of hand-rolling one, because a database is commodity infrastructure a dependency does better than you would — and recognising *which* problems are worth solving yourself and which to offload is exactly the judgment a senior engineer is paid for. Build the parts that teach you something; buy the parts that don't.

It also happens to be honest about Go's strengths. The standard library's `net/http` is a complete, production-grade HTTP server. `crypto/rand` gives you unguessable codes. `expvar` exposes metrics. Goroutines and channels give you a worker pool. Go ships with most of a backend in the box — and a URL shortener is the perfect size to prove it.

## What's Next

We've decided *what* we're building and *why*. Next we make the one architectural decision the entire course rests on: cleanly separating the three things this service does — generating codes, storing links, and speaking HTTP — so each can change without disturbing the others. That's [Separation of Concerns](/go/philosophy/separation-of-concerns), and it's what turns the toy above into something you can grow.
