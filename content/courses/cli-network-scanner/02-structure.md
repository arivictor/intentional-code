---
title: "Module 2: Project Structure — Why Before What"
description: "Before writing the framework, we decide where everything lives — and more importantly, why."
---

# Module 2: Project Structure — Why Before What

Most tutorials show you the folder structure and move on. This one won't, because the structure is itself a series of decisions — and the reasoning behind those decisions is part of what you're here to learn.

Here's what we're building toward:

```
netscan/
├── cmd/
│   └── netscan/
│       └── main.go
├── internal/
│   ├── cli/
│   │   ├── app.go
│   │   ├── command.go
│   │   ├── context.go
│   │   ├── middleware.go
│   │   └── help.go
│   ├── commands/
│   │   ├── host.go
│   │   ├── ports.go
│   │   ├── subnet.go
│   │   ├── dns.go
│   │   └── watch.go
│   ├── scanner/
│   │   ├── probe.go
│   │   ├── portscan.go
│   │   ├── subnet.go
│   │   └── dns.go
│   └── output/
│       └── writer.go
└── testdata/
```

Let's walk through each directory as a decision.

## `cmd/netscan/main.go` — the composition root

`main.go` has one job: wire everything together and start the engine. It knows about every package in the project — and nothing else. No business logic, no flag definitions, no formatting. Just dependency injection and `app.Run(os.Args)`.

Why `cmd/netscan/` instead of just `main.go` at the root?

The `cmd/` layout is a Go convention for projects that might produce more than one binary. But even if you never add a second binary, it's an architectural statement: **the binary is just an adapter**. The real code lives in `internal/`. If you later wanted a REST API or a TUI built on the same scanner logic, you'd add `cmd/netscan-api/main.go` with no changes to the packages underneath.

Practically: this constraint keeps `main.go` thin. When logic creeps into `main`, the layout makes it obvious it's in the wrong place.

## `internal/` — the visibility contract

`internal/` is not just convention. Go enforces it: **no code outside this module can import packages under `internal/`**. If you publish `netscan` as a module, users cannot import `internal/cli` or `internal/scanner` directly.

Why do we want that? Because it lets us change the framework freely. The public API of `netscan` is the binary — the command-line interface. The internal packages are implementation details. Marking them `internal/` makes that contract explicit and compiler-enforced.

## `internal/cli/` — the framework

This package has no knowledge of network scanning. It knows about commands, flags, middleware, and output writers. Nothing else.

That separation matters because it's what makes the framework reusable. When you build your next CLI tool — a deployment script, a database migration runner, whatever — you can copy `internal/cli/` wholesale and it will work unchanged.

The test for whether something belongs in `cli/`: **would it make sense in a completely different CLI tool?** If yes, it belongs here. If it mentions hosts, ports, or DNS, it doesn't.

## `internal/commands/` — the application layer

One file per subcommand. Each file's job: declare flags, validate input, call the scanner, format output.

Commands are the glue between the framework (`cli/`) and the domain (`scanner/`). They know about both. Nothing else should.

Why one file per command? Because each command is a coherent unit. When you need to change how `ports` works, you open `ports.go`. You don't scan through a 500-line file hunting for the right function.

## `internal/scanner/` — the domain

This is where the actual network work happens: TCP dials, DNS lookups, port scanning, subnet enumeration. It knows nothing about CLI flags, output formatting, or the command framework.

Why the separation? Three reasons:

1. **Testability.** The scanner can be tested with a fake dialer — no real network needed.
2. **Reusability.** The scanner packages could be imported by a different client (a web dashboard, a library) without pulling in CLI machinery.
3. **Clarity.** When something goes wrong with a port scan, you open `scanner/portscan.go`. You don't have to filter through flag parsing code to find the bug.

## `internal/output/` — formatting

Writing to a terminal is not the same as writing to a file, a pipe, or a test buffer. `output/` handles that distinction: colour detection, table formatting, prefix symbols, quiet mode.

Commands receive an `io.Writer` (via Context) and call methods on `output.Writer`. They never call `fmt.Fprintf(os.Stdout, ...)` directly.

Why not just use `fmt` in commands? Because then commands are hard to test (they always write to stdout) and inconsistently formatted (each command invents its own prefix style).

## `testdata/` — golden files

Test inputs and expected outputs. Nothing runs here; it's read by tests. We'll populate it in Module 13.

---

## Before you write any code: set up the module

```bash
mkdir netscan
cd netscan
go mod init github.com/yourname/netscan
mkdir -p cmd/netscan
mkdir -p internal/cli internal/commands internal/scanner internal/output
mkdir testdata
```

The module path (`github.com/yourname/netscan`) doesn't need to be a real GitHub URL — it's just a unique identifier. If you plan to publish it, use your actual GitHub username.

Next: we write the `Command` interface — the first real piece of the framework.
