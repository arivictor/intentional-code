---
title: "Build a Network Scanner CLI in Go"
description: "Build a real network scanner using only the Go standard library — and the mini-framework to support it. Every decision explained."
---

# Build a Network Scanner CLI in Go

This course teaches you to build `netscan` — a fully functional network scanner — using **only the Go standard library**. No Cobra, no Viper, no external dependencies.

But the scanner is just the excuse. The real thing you're building is a small, reusable CLI framework: a command registry, a middleware chain, a typed context, structured output. By the end you'll understand not just *how* to build it, but *why* each piece exists — and when you'd reach for it again.

Every structural decision in this course is explained before the code appears. Every pattern is introduced at the moment you feel the pain it solves. Nothing is assumed.

## What you'll build

```
netscan host <ip|hostname>                          # probe reachability and latency
netscan ports <host> --range=1-1024                 # concurrent TCP port scan
netscan subnet <cidr>                               # discover live hosts
netscan dns <host> --type=MX                        # DNS record lookup
netscan watch <host> --interval=5s                  # continuous monitoring
netscan help [command]                              # context-aware help
```

A single, self-contained binary. No install directory. No runtime dependencies. Ships with `go build`.

## Prerequisites

- You're comfortable writing Go: functions, structs, interfaces, goroutines, channels
- You've used `flag.Parse` before, even if only once
- You don't need to know any design patterns — this course introduces each one when the code needs it

## Patterns covered

| Pattern | Where it appears |
|---------|-----------------|
| [Command](/patterns/behavioral/command) | The subcommand interface |
| [Builder](/patterns/creational/builder) | Constructing the App |
| [Facade](/patterns/structural/facade) | Hiding dispatch complexity |
| [Chain of Responsibility](/patterns/behavioral/chain-of-responsibility) | Middleware |
| [Strategy](/patterns/behavioral/strategy) | Pluggable dialers and DNS formatters |
| [Fan-out / Fan-in](/patterns/concurrency/fan-out-fan-in) | Port scanning |
| [Done Channel](/patterns/concurrency/done-channel) | Cancellation |
| [Worker Pool](/patterns/concurrency/worker-pool) | Subnet scanning |
| [Pipeline](/patterns/concurrency/pipeline) | The watch loop |
| [Decorator](/patterns/structural/decorator) | Terminal output |

## Modules

1. [The naïve version — and why it breaks](/courses/cli-network-scanner/01-naive)
2. [Project structure — why before what](/courses/cli-network-scanner/02-structure)
3. [The Command interface](/courses/cli-network-scanner/03-command)
4. [The App: Builder and Facade](/courses/cli-network-scanner/04-app)
5. [Middleware: Chain of Responsibility](/courses/cli-network-scanner/05-middleware)
6. [Context: the data-passing spine](/courses/cli-network-scanner/06-context)
7. [Probing a host — no pattern needed](/courses/cli-network-scanner/07-probe)
8. [Port scanning: Fan-out / Fan-in](/courses/cli-network-scanner/08-ports)
9. [Subnet scanning: Worker Pool](/courses/cli-network-scanner/09-subnet)
10. [Watching a host: Pipeline](/courses/cli-network-scanner/10-watch)
11. [DNS lookups: Strategy](/courses/cli-network-scanner/11-dns)
12. [Output: Decorator](/courses/cli-network-scanner/12-output)
13. [Testing without a network](/courses/cli-network-scanner/13-testing)
14. [Shipping a single binary](/courses/cli-network-scanner/14-shipping)
