---
title: "Module 6: Context — The Data-Passing Spine"
description: "Every command receives a *Context. This module explains what it carries, why it's not context.Context, and how it makes commands testable."
order: 6
---

# Module 6: Context — The Data-Passing Spine

No pattern reference for this module — because `Context` isn't a named pattern. It's a deliberate Go idiom, and it's worth explaining from first principles before we accept it as convention.

## The problem: getting data into commands

Every command's `Run` method needs certain things: somewhere to write output, a way to honour cancellation, the positional arguments the user typed. How do those things get in?

Three options, all worse than what we'll do:

**Global variables.** `var stdout = os.Stdout`. Simple — until you write tests. Two tests running the same command concurrently will race on the global. Also: globals make it impossible to see what a function depends on without reading its body.

**Long parameter lists.** `Run(w io.Writer, errW io.Writer, ctx context.Context, args []string) error`. Fine for now. Add one more need — say, a working directory, or a verbosity flag — and every `Run` signature changes. Every middleware that calls `Run` changes. Every test changes.

**context.Context.** Stuffing things into `context.Context` values is a common Go anti-pattern: `ctx.Value("output").(io.Writer)`. You lose type safety, it's invisible at call sites, and `context.Context` is specifically documented as being for cancellation and deadlines, not for carrying application data.

The right choice: a purpose-built struct.

## The Context struct

```go
// internal/cli/context.go
package cli

import (
    "context"
    "io"
)

// Context is the data-passing spine of the framework.
// Every Command.Run receives a *Context containing everything it needs.
type Context struct {
    // Ctx is the standard library context.Context. Commands pass this to
    // net.DialContext and other cancellable stdlib functions.
    Ctx context.Context

    // Out is where commands write normal output.
    // io.Writer (not *os.File) so tests can use bytes.Buffer.
    Out io.Writer

    // Err is where commands write error messages.
    // Keeping stderr separate from stdout means piped output stays clean
    // even when errors occur.
    Err io.Writer

    // Args holds the positional arguments after flag parsing.
    // For "netscan host google.com --timeout=2s", Args = ["google.com"].
    Args []string
}

func NewContext(out, errOut io.Writer) *Context {
    return &Context{
        Ctx: context.Background(),
        Out: out,
        Err: errOut,
    }
}
```

## Why `Ctx context.Context` alongside the struct?

Notice we have both our `*Context` and `context.Context` (named `Ctx`). They do different things:

- **`*cli.Context`** carries application-level data: the output writer, the parsed args. It's our invention.
- **`context.Context`** carries cancellation signals and deadlines. It's the stdlib's mechanism for propagating "stop what you're doing" through a call stack.

Commands use `ctx.Ctx` when making network calls:

```go
func (c *HostCommand) Run(ctx *cli.Context) error {
    probeCtx, cancel := context.WithTimeout(ctx.Ctx, c.timeout)
    defer cancel()

    result := scanner.ProbeHost(probeCtx, dialer, host)
    // ...
}
```

When the user presses Ctrl-C, the signal propagates through `ctx.Ctx` to `probeCtx`, which cancels the in-flight dial. The scanner package doesn't know anything about CLI commands — it just respects the standard `context.Context` it was handed.

## The testability payoff

Here's a command test, no mocks needed:

```go
func TestHostCommand_missingArg(t *testing.T) {
    var out, errOut bytes.Buffer

    cmd := commands.NewHost()
    ctx := cli.NewContext(&out, &errOut)
    ctx.Args = []string{} // no positional args

    err := cmd.Run(ctx)

    if err == nil {
        t.Fatal("expected an error when no host is provided")
    }
}
```

No network. No terminal. No test doubles. `bytes.Buffer` satisfies `io.Writer`; we pass it as `out` and assert on its contents.

Here's a command test that checks the output format:

```go
func TestHostCommand_outputFormat(t *testing.T) {
    // A fake dialer that always succeeds in 10ms.
    dialer := &fakeDialer{latency: 10 * time.Millisecond}

    var out bytes.Buffer
    cmd := commands.NewHost(dialer) // dialer injected at construction
    ctx := cli.NewContext(&out, io.Discard)
    ctx.Args = []string{"example.com"}

    if err := cmd.Run(ctx); err != nil {
        t.Fatal(err)
    }
    if !strings.Contains(out.String(), "reachable") {
        t.Errorf("expected 'reachable' in output, got: %s", out.String())
    }
}
```

The command doesn't know it's in a test. It received a `*Context` with a `bytes.Buffer` for output and a fake dialer. It did its job. We checked the result.

This is the entire point of the `Context` design. Commands that write to `os.Stdout` directly cannot be tested without capturing the process's stdout — which is fragile and subprocess-dependent. Commands that write to `ctx.Out` can be tested with a buffer.

## What middleware does with Context

Middleware modifies `Context` before passing it to the next handler. `FlagParserMiddleware` sets `ctx.Args` to the post-parse positional args. A hypothetical timeout middleware would replace `ctx.Ctx` with a context that has a deadline:

```go
func TimeoutMiddleware(d time.Duration) Middleware {
    return func(next Handler) Handler {
        return func(ctx *Context, cmd Command) error {
            timedCtx, cancel := context.WithTimeout(ctx.Ctx, d)
            defer cancel()
            ctx.Ctx = timedCtx
            return next(ctx, cmd)
        }
    }
}
```

The command receives a context with a deadline already set. It doesn't know where the deadline came from — it just passes `ctx.Ctx` to network calls and the stdlib handles the rest.

## Summary

`*Context` is simple — four fields, one constructor. Its design decisions are all in service of one goal: making commands testable without mocking, test doubles, or subprocesses. The constraints that produced it:

- Don't use globals (untestable, racy)
- Don't use long parameter lists (fragile to change)
- Don't use `context.Context` values (loses type safety, wrong abstraction level)
- Use `io.Writer` not `*os.File` (allows `bytes.Buffer` in tests)
- Carry `context.Context` separately for cancellation (correct use of the stdlib primitive)

Next: we write the first domain code — probing a single host. And notably, we don't reach for a pattern.
