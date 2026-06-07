---
title: "Module 4: The App — Builder and Facade"
description: "We build the App type using two patterns: Builder for construction and Facade for dispatch. Here's why both are needed."
order: 4
---

# Module 4: The App — Builder and Facade

**Patterns: [Builder](/go/patterns/creational/builder), [Facade](/go/patterns/structural/facade)**

We now have a `Command` interface and a way to implement it. The next question: who holds the commands, and how does execution get from `os.Args` to the right `cmd.Run`?

That's the `App` type. It's the heart of the framework.

## Two patterns, one type

`App` uses two patterns simultaneously — which is worth naming explicitly so you recognise the combination later.

**[Builder](/go/patterns/creational/builder)** handles construction. An `App` has several optional parts: a version string, registered commands, middleware, custom output writers. A constructor with all of these as parameters would look like this:

```go
// Don't do this.
app := cli.NewApp("netscan", "0.1.0", cmds, middleware, os.Stdout, os.Stderr)
```

Six parameters, two of which are `io.Writer`. The reader has no idea which is stdout and which is stderr. And what do you pass for middleware when you don't want any? `nil`? An empty slice?

Builder trades that for a fluent interface where every option is named:

```go
// This is what we're building toward.
app := cli.New("netscan").
    Version("0.1.0").
    Register(commands.NewHost()).
    Register(commands.NewPorts()).
    Register(commands.NewSubnet()).
    Register(commands.NewDNS()).
    Register(commands.NewWatch())
```

Every call says exactly what it's doing. Nothing needs a zero value. New options can be added without changing existing call sites.

**[Facade](/go/patterns/structural/facade)** handles the public surface. From `main.go`'s perspective, the entire framework — argument slicing, command lookup, flag parsing, middleware chain, error formatting — collapses to one call:

```go
app.Run(os.Args)
```

`main.go` doesn't know there's a middleware chain. It doesn't know how flags are parsed. It doesn't know the commands are stored in a map. It calls `Run` and handles the error. That's the Facade: a simplified interface to a complex subsystem.

## The App type

```go
// internal/cli/app.go
package cli

import (
    "fmt"
    "io"
    "os"
)

type App struct {
    name       string
    version    string
    commands   map[string]Command
    middleware []Middleware
    out        io.Writer
    errOut     io.Writer
}
```

Note that `out` and `errOut` are `io.Writer`, not `*os.File`. This is the testability seam: in production they're `os.Stdout` and `os.Stderr`; in tests they're `*bytes.Buffer`. The App doesn't need to know which.

## The Builder methods

```go
func New(name string) *App {
    return &App{
        name:     name,
        version:  "dev",
        commands: make(map[string]Command),
        out:      os.Stdout,
        errOut:   os.Stderr,
    }
}

func (a *App) Version(v string) *App {
    a.version = v
    return a
}

func (a *App) Register(cmd Command) *App {
    a.commands[cmd.Name()] = cmd
    return a
}

func (a *App) Use(m Middleware) *App {
    a.middleware = append(a.middleware, m)
    return a
}

// Output overrides where the app writes normal output.
// Pass a *bytes.Buffer in tests.
func (a *App) Output(w io.Writer) *App {
    a.out = w
    return a
}
```

Each method returns `*App` so calls chain. This is standard Go Builder — not fancy, just consistent.

Why a map for commands and not a slice? Lookup is the hot path: every invocation does exactly one lookup by name. A map is O(1). The slice alternative would be O(n) linear search, and we'd need to remember to deduplicate.

## The Run method (the Facade)

```go
func (a *App) Run(args []string) error {
    // Slice off the binary name. os.Args[0] is the path to the executable.
    if len(args) > 0 {
        args = args[1:]
    }

    // No subcommand: print help.
    if len(args) == 0 {
        printHelp(a.out, a.name, a.version, a.commands)
        return nil
    }

    // "help" is a special built-in subcommand.
    if args[0] == "help" {
        if len(args) < 2 {
            printHelp(a.out, a.name, a.version, a.commands)
            return nil
        }
        cmd, ok := a.commands[args[1]]
        if !ok {
            return fmt.Errorf("unknown command %q", args[1])
        }
        fmt.Fprintln(a.out, cmd.Usage())
        return nil
    }

    // Look up the command.
    cmd, ok := a.commands[args[0]]
    if !ok {
        return fmt.Errorf("unknown command %q — run '%s help' for a list", args[0], a.name)
    }

    // Build a Context and dispatch through the middleware chain.
    ctx := NewContext(a.out, a.errOut)
    ctx.Args = args[1:] // strip the command name; pass flags + positional args

    dispatch := Chain(func(ctx *Context, cmd Command) error {
        return cmd.Run(ctx)
    }, append([]Middleware{HelpMiddleware, FlagParserMiddleware}, a.middleware...)...)

    return dispatch(ctx, cmd)
}
```

The `Chain` and `Middleware` types don't exist yet — we're building them in Module 5. For now, treat them as a black box: `Chain` wraps a handler in a sequence of middleware and returns the composed handler.

## What main.go looks like

With the framework in place, the composition root is genuinely thin:

```go
// cmd/netscan/main.go
package main

import (
    "fmt"
    "os"

    "github.com/yourname/netscan/internal/cli"
    "github.com/yourname/netscan/internal/commands"
)

var version = "dev" // set at build time via -ldflags

func main() {
    app := cli.New("netscan").
        Version(version).
        Register(commands.NewHost()).
        Register(commands.NewPorts()).
        Register(commands.NewSubnet()).
        Register(commands.NewDNS()).
        Register(commands.NewWatch())

    if err := app.Run(os.Args); err != nil {
        fmt.Fprintln(os.Stderr, err)
        os.Exit(1)
    }
}
```

Twenty lines, total. All of the complexity is real — it lives in packages with clear responsibilities. `main.go` knows about all of them and does nothing else.

Compare to our naïve version's `main`, which was 40+ lines and growing. The Facade moved the complexity without removing it, and in doing so gave it a place where it can be organised, tested, and evolved.

Next: we build the middleware chain — the piece that makes flag parsing and `--help` handling happen once instead of in every command.
