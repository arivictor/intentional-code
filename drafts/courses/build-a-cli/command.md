---
title: "Module 3: The Command Interface"
description: "We define the Command interface — the first pattern in the framework. Here's why it has to exist before anything else."
order: 3
---

# Module 3: The Command Interface

**Pattern: [Command](/patterns/behavioral/command)**

Before we build the registry, or the middleware chain, or the App itself — we need to decide what a command *is*. Not what it does. What it *is*.

This distinction matters. Right now in our naïve version, each command is a function (`runHost`, `runPorts`). Functions are fine, but they can't be stored together, iterated, or dispatched without knowing each other's names. The switch in `main` knows about every command explicitly — that's the problem.

What we want instead: commands as **values**. Things we can put in a map, pass to middleware, and call without knowing the concrete type. That's what an interface gives us.

## Why the Command pattern

The [Command pattern](/patterns/behavioral/command) says: encapsulate a request as an object. In our case, a subcommand invocation is the request. Wrapping it in an interface means the dispatcher (the App) can hold and call any command without knowing its type.

The pattern also gives us something the naïve version doesn't: **closed dispatch**. In the switch version, adding a new command means editing `main`. With an interface and a registry, adding a command means implementing the interface and registering it. `main` doesn't change.

This is the Open/Closed Principle expressed in code: open for extension, closed for modification.

## The interface

```go
// internal/cli/command.go
package cli

import "flag"

// Command is the interface every subcommand must satisfy.
type Command interface {
    Name() string
    Synopsis() string
    Usage() string
    Flags() *flag.FlagSet
    Run(ctx *Context) error
}
```

Four methods worth explaining:

**`Name() string`** — the token the user types: `"host"`, `"ports"`, `"dns"`. The registry keys commands by name.

**`Synopsis() string`** — one line used in the top-level help listing. Short, imperative: `"scan TCP ports on a host concurrently"`.

**`Usage() string`** — the full help text shown when the user runs `netscan ports --help`. Can be as long as needed.

**`Flags() *flag.FlagSet`** — the command's own flag namespace. Why a `*flag.FlagSet` rather than just parsing `os.Args` directly? Because each command needs its own isolated set of flags. `ports --timeout` and `host --timeout` are the same flag *name* but completely independent definitions — different defaults, different variables, different FlagSets.

**`Run(ctx *Context) error`** — executes the command. `*Context` is our own type (not `context.Context`), defined in the next module. For now, think of it as the bag of things a command needs to do its job.

## BaseCommand — shared boilerplate

Every command needs to implement `Name`, `Synopsis`, `Usage`, and `Flags`. The implementations are always the same shape: return a stored string, return a stored FlagSet. That's boilerplate.

In Go you eliminate boilerplate through composition, not inheritance. We define a `BaseCommand` struct and embed it in each command:

```go
// BaseCommand holds the boilerplate every command shares.
// Embed it to avoid repeating Name/Synopsis/Usage/Flags.
type BaseCommand struct {
    name     string
    synopsis string
    usage    string
    flags    *flag.FlagSet
}

func NewBaseCommand(name, synopsis, usage string) BaseCommand {
    return BaseCommand{
        name:     name,
        synopsis: synopsis,
        usage:    usage,
        // Each command gets its own FlagSet.
        // flag.ContinueOnError means flag.Parse returns an error instead of
        // calling os.Exit — essential for testability.
        flags: flag.NewFlagSet(name, flag.ContinueOnError),
    }
}

func (b *BaseCommand) Name() string         { return b.name }
func (b *BaseCommand) Synopsis() string     { return b.synopsis }
func (b *BaseCommand) Usage() string        { return b.usage }
func (b *BaseCommand) Flags() *flag.FlagSet { return b.flags }
```

The embedding pattern in practice — here's what a command looks like:

```go
// internal/commands/host.go

type HostCommand struct {
    cli.BaseCommand          // embedded: gets Name, Synopsis, Usage, Flags for free
    timeout time.Duration    // command-specific state
}

func NewHost() *HostCommand {
    cmd := &HostCommand{}
    cmd.BaseCommand = cli.NewBaseCommand(
        "host",
        "probe a host and report reachability and latency",
        `Usage: netscan host <hostname|ip> [flags]

Probes the target via TCP and reports whether it is reachable.

Flags:
  --timeout duration   connection timeout (default 2s)`,
    )
    // Register flags on the command's own FlagSet.
    cmd.Flags().DurationVar(&cmd.timeout, "timeout", 2*time.Second, "connection timeout")
    return cmd
}

// Run is the only method HostCommand needs to implement itself.
func (c *HostCommand) Run(ctx *cli.Context) error {
    // ... implementation in Module 7
    return nil
}
```

`HostCommand` satisfies the `Command` interface with four methods from `BaseCommand` and one (`Run`) of its own. No interface declaration needed — Go's implicit satisfaction.

## What this unlocks

With the `Command` interface defined, we can write the registry:

```go
commands := map[string]cli.Command{
    "host":   commands.NewHost(),
    "ports":  commands.NewPorts(),
    "subnet": commands.NewSubnet(),
}

// Dispatch without a switch:
cmd, ok := commands[os.Args[1]]
if !ok {
    // unknown command
}
cmd.Run(ctx)
```

No switch. No modification when you add a new command. The registry is inert — it doesn't know what commands do, only how to look them up.

## A note on `flag.ContinueOnError`

Notice we create the FlagSet with `flag.ContinueOnError`, not `flag.ExitOnError`. This is important: `flag.ExitOnError` calls `os.Exit(2)` when flag parsing fails. That makes the application impossible to test — `os.Exit` terminates the test process, not just the test. `ContinueOnError` returns an error instead, which we can inspect and handle.

This is a consistent principle throughout the framework: **never call `os.Exit` except in `main`**. Everything else returns errors.

Next: we build the App — the registry, the Builder pattern, and the Facade.
