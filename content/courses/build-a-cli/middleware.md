---
title: "Module 5: Middleware — Chain of Responsibility"
description: "We extract flag parsing and help handling into middleware. Here's the moment that forces the extraction, and the pattern that makes it clean."
order: 5
---

# Module 5: Middleware — Chain of Responsibility

**Pattern: [Chain of Responsibility](/go/patterns/behavioral/chain-of-responsibility)**

Here's the moment that forces this pattern. You've written the `host` command. It works. Now you write the `ports` command, and you notice something: the first thing `ports.Run` does is check for `--help` and parse flags — exactly what `host.Run` does.

You copy the code. Fine for two commands. Then you write `subnet`, `dns`, `watch`. Same boilerplate, five times.

A rule: **when two commands share code, it belongs in neither command**. That's not just cleanliness — code repeated in five commands has to be maintained five times. Change the help format once and you'll forget to update command number four.

The extracted concern needs somewhere to live. That somewhere is middleware.

## The shape of middleware

Middleware is a function that wraps a handler and adds behaviour. You've seen this in HTTP servers — `http.Handler` wrapped in logging, authentication, CORS. Our CLI handler has the same shape:

```go
// A Handler processes a command invocation.
type Handler func(ctx *Context, cmd Command) error

// A Middleware wraps a Handler.
type Middleware func(next Handler) Handler
```

The chain works by wrapping the innermost handler (which calls `cmd.Run`) in middleware, outside-in:

```
HelpMiddleware → FlagParserMiddleware → cmd.Run
```

Each middleware can do work before calling `next`, after, or both. It can also short-circuit — return early without calling `next` at all (that's exactly what `HelpMiddleware` does when it sees `--help`).

## Building the chain

```go
// Chain composes middleware around a Handler.
// Middleware is applied right-to-left so the first in the slice is outermost.
func Chain(h Handler, middleware ...Middleware) Handler {
    for i := len(middleware) - 1; i >= 0; i-- {
        h = middleware[i](h)
    }
    return h
}
```

After `Chain`, calling the returned handler executes the middleware in left-to-right order: the first middleware runs first, calls next, which runs the second middleware, and so on until `cmd.Run`.

## HelpMiddleware — short-circuiting

```go
// HelpMiddleware intercepts --help/-h and prints usage without calling Run.
func HelpMiddleware(next Handler) Handler {
    return func(ctx *Context, cmd Command) error {
        for _, arg := range ctx.Args {
            if arg == "--help" || arg == "-h" {
                fmt.Fprintln(ctx.Out, cmd.Usage())
                return nil // short-circuit: Run is never called
            }
        }
        return next(ctx, cmd)
    }
}
```

Why intercept help here instead of letting `flag.Parse` handle it? Because the default `flag` package behaviour for `-h` is to call `os.Exit(2)`. We want to write to `ctx.Out` (not `os.Stderr`) and return `nil` (not exit). Taking control here means consistent behaviour across all commands at no cost per command.

## FlagParserMiddleware — and a stdlib gotcha

```go
// FlagParserMiddleware parses the command's flags before Run is called.
func FlagParserMiddleware(next Handler) Handler {
    return func(ctx *Context, cmd Command) error {
        fs := cmd.Flags()
        if fs == nil {
            return next(ctx, cmd)
        }
        flagArgs, positional := splitArgs(ctx.Args)
        if err := fs.Parse(flagArgs); err != nil {
            return err
        }
        ctx.Args = positional
        return next(ctx, cmd)
    }
}
```

Notice `splitArgs`. Here's the gotcha: `flag.FlagSet.Parse` **stops at the first non-flag argument**. That means:

```bash
netscan dns google.com --type=MX
#                      ^^^^^^^^^ LOST — parse stopped at "google.com"
```

`"google.com"` is not a flag (doesn't start with `-`), so `flag.Parse` stops. `--type=MX` is never seen. `cmd.recordType` stays at its default.

This is a genuine limitation of the stdlib flag package — one of the main reasons third-party packages like cobra and pflags exist. We solve it ourselves: separate the flag-shaped arguments from the positional arguments before calling `Parse`.

```go
func splitArgs(args []string) (flags, positional []string) {
    for _, arg := range args {
        if len(arg) > 0 && arg[0] == '-' {
            flags = append(flags, arg)
        } else {
            positional = append(positional, arg)
        }
    }
    return
}
```

After parsing, `ctx.Args` contains only the positional arguments — the non-flag strings the command actually needs (like `"google.com"`).

This implementation doesn't handle `--` (the end-of-flags sentinel) or negative numbers passed as positional args (e.g. `-1`). Those are left as exercises; the cases rarely arise in network tooling.

## How the chain is wired in App.Run

```go
dispatch := Chain(
    func(ctx *Context, cmd Command) error {
        return cmd.Run(ctx)
    },
    HelpMiddleware,
    FlagParserMiddleware,
    // ... any user-supplied middleware
)
```

The innermost function is the command dispatch. `HelpMiddleware` and `FlagParserMiddleware` wrap it. The resulting `dispatch` function, when called, runs the whole chain.

## What commands look like now

With middleware handling flags and help, `Run` can focus entirely on its actual job:

```go
func (c *HostCommand) Run(ctx *cli.Context) error {
    if len(ctx.Args) == 0 {
        // Middleware already parsed flags. ctx.Args now holds positional args only.
        return fmt.Errorf("host name required")
    }

    host := ctx.Args[0]
    // ... probe logic
    return nil
}
```

No `fs.Parse`. No help check. No `os.Exit`. Just the domain logic.

## Adding your own middleware

The `App.Use` method lets you add middleware at the application level:

```go
app := cli.New("netscan").
    Use(func(next cli.Handler) cli.Handler {
        return func(ctx *cli.Context, cmd cli.Command) error {
            fmt.Fprintf(ctx.Out, "[debug] running command: %s\n", cmd.Name())
            return next(ctx, cmd)
        }
    }).
    Register(commands.NewHost())
```

This is the Chain of Responsibility in action: your middleware sits outside the built-in middleware, and calls `next` to pass execution down the chain. It could also inspect the error on the way back:

```go
err := next(ctx, cmd)
if err != nil {
    fmt.Fprintf(ctx.Err, "[debug] command %s failed: %v\n", cmd.Name(), err)
}
return err
```

## The pattern in perspective

Chain of Responsibility is the right choice here because the concerns are genuinely independent — help interception has nothing to do with flag parsing, which has nothing to do with application-level logging. Each handler handles what it cares about and passes the rest down. None of them need to know what the others do.

The alternative is mixing all of these concerns into every command, or into a single monolithic dispatch function. The former produces duplication; the latter produces a function that does too many things to test or change independently.

Next: the `Context` type — what gets passed to every `Run` call, and why it's not `context.Context`.
