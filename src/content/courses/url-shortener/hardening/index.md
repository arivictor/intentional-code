---
title: "Hardening"
order: 5
description: "Make the service survive the real world: a token-bucket rate limiter as middleware, and non-blocking click analytics powered by a worker pool."
---

## Surviving Contact With Users

The API works and validates its input. Now it meets the open internet, where two things go wrong that a demo never reveals.

First, **abuse**. Nothing stops one client from calling `POST /shorten` in a tight loop, filling your disk and starving everyone else. The fix is a rate limiter — and rather than import one, we'll build a token bucket and watch it turn out to be [Strategy](/go/patterns/behavioral/strategy) (the limiting algorithm) and [Decorator](/go/patterns/structural/decorator) (middleware wrapping a handler) working together.

Second, **slow side-work on a hot path**. We want to count clicks, but the redirect is the most latency-sensitive route we have, and incrementing a counter on disk for every click would drag it down. The fix is to do the counting *off* the request path: hand each click to a background [Worker Pool](/go/patterns/concurrency/worker-pool) and return the redirect immediately.

Both steps share a theme — the production version of a feature is usually about *what you refuse to do synchronously*.
