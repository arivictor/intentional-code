---
title: "Production"
order: 6
description: "The last mile: configuration from the environment, graceful shutdown under load, and assembling every layer behind a small facade into one runnable binary."
---

## The Last Mile

Every piece works in isolation. What's left is everything *between* the pieces and the outside world — the unglamorous layer that decides whether a deploy is a non-event or an outage.

Two concerns finish the service. First, **configuration**: a production binary can't have its port and data path hard-coded, so it reads them from the environment, the way every twelve-factor service does. Second, **lifecycle**: when the orchestrator sends a shutdown signal, the service must stop accepting new requests, finish the ones in flight, drain the click buffer, and flush to disk — *then* exit. Dropping requests on every deploy is the difference between a toy and a service.

Then we assemble. All six chapters collapse into a single `main.go` that wires config → store → generator → service → analytics → router → server behind a small [Facade](/go/patterns/structural/facade), exposes a few metrics with `expvar`, and runs. By the end you can `go run .` and shorten a URL.
