---
title: "Module 12: Output Formatting — Decorator"
description: "We add colour, table formatting, and quiet mode to the output writer — without commands knowing any of it exists."
order: 12
---

# Module 12: Output Formatting — Decorator

**Pattern: [Decorator](/go/patterns/structural/decorator)**

There's a tension in every CLI tool between two uses: humans at a terminal (want colour, symbols, aligned tables) and scripts piping the output (want plain text, no escape codes, machine-parseable).

The naïve solution: an `if terminal { ... } else { ... }` in every command. Three commands in, it's boilerplate. Five commands in, it's the kind of thing that gets inconsistently maintained.

The Decorator solves it: wrap the underlying `io.Writer` in something that adds formatting behaviour. Commands write to the writer; whether formatting is applied is the wrapper's decision.

## Why Decorator fits here

The [Decorator pattern](/go/patterns/structural/decorator) adds behaviour to an object by wrapping it in another object with the same interface. Our decorating object (`output.Writer`) wraps an `io.Writer` and adds:

- Colour via ANSI escape codes (when the output is a terminal)
- Prefix symbols (`✓`, `✗`, `→`)
- Table formatting with column alignment
- Quiet mode (strips decoration for scripted use)

Commands don't know any of this is happening. They call `w.Success("...")` and the writer decides how to render it. Swap the writer for a `bytes.Buffer`-backed one in tests, and there's no colour, no escape codes — just the text.

## ANSI colour without a library

Colour terminals understand a simple escape sequence: `ESC[<code>m`. ESC is byte `\x1b`. The code tells the terminal what to do: `32` is green, `31` is red, `0` resets to normal.

```go
const (
    colReset  = "\x1b[0m"
    colRed    = "\x1b[31m"
    colGreen  = "\x1b[32m"
    colYellow = "\x1b[33m"
    colCyan   = "\x1b[36m"
    colBold   = "\x1b[1m"
)
```

Five constants. That's the entire "colour library." Adding a dependency to avoid five string constants is not a good trade.

## Detecting a terminal — no library

We need to know whether the output `io.Writer` is a real TTY or something else (a file, a pipe, `bytes.Buffer`). The stdlib gives us enough:

```go
func isTerminal(w io.Writer) bool {
    f, ok := w.(*os.File)
    if !ok {
        return false // not a file at all — definitely not a terminal
    }
    info, err := f.Stat()
    if err != nil {
        return false
    }
    return (info.Mode() & os.ModeCharDevice) != 0
}
```

`os.ModeCharDevice` is set for character devices — which includes terminals but not regular files or pipes. If the file mode has that bit, it's a terminal.

When output is piped (`netscan host google.com | grep reachable`), `w` is still `os.Stdout` but `isTerminal` returns false — the file descriptor is now connected to a pipe, not a terminal. So colour is automatically disabled when the output is piped. No `--no-color` flag needed.

## The Writer struct

```go
// internal/output/writer.go

type Writer struct {
    w     io.Writer
    color bool
    quiet bool
}

func New(w io.Writer) *Writer {
    return &Writer{
        w:     w,
        color: isTerminal(w),
    }
}

// Write implements io.Writer — making *Writer usable anywhere io.Writer is accepted.
func (wr *Writer) Write(p []byte) (int, error) {
    return wr.w.Write(p)
}

func (wr *Writer) Success(format string, args ...any) {
    wr.writePrefixed(colGreen, "✓", format, args...)
}

func (wr *Writer) Fail(format string, args ...any) {
    wr.writePrefixed(colRed, "✗", format, args...)
}

func (wr *Writer) Info(format string, args ...any) {
    wr.writePrefixed(colCyan, "→", format, args...)
}

func (wr *Writer) writePrefixed(color, prefix, format string, args ...any) {
    text := fmt.Sprintf(format, args...)
    if wr.quiet {
        fmt.Fprintln(wr.w, text)
        return
    }
    if wr.color {
        fmt.Fprintf(wr.w, "%s%s%s %s\n", color, prefix, colReset, text)
    } else {
        fmt.Fprintf(wr.w, "%s %s\n", prefix, text)
    }
}
```

## Table formatting — the multi-byte trap

A table formatter seems simple: measure column widths, pad cells, print. Here's the trap: **`len(s)` measures bytes, not characters**.

The "─" character (U+2500, BOX DRAWINGS LIGHT HORIZONTAL) is 3 bytes in UTF-8 but 1 visible character. If you use `len("─")` as the width of a separator cell, you get 3 — but the cell visually occupies 1 character. Every calculation based on that width is wrong by a factor of 3.

```go
// Wrong: measures bytes
widths[i] = len(cell)
padding := strings.Repeat(" ", widths[i]-len(cell)) // panics when cell contains multi-byte chars

// Right: measures runes (visible characters)
widths[i] = utf8.RuneCountInString(cell)
padding := strings.Repeat(" ", widths[i]-utf8.RuneCountInString(cell))
```

The fix: use `unicode/utf8.RuneCountInString` everywhere you measure column width or compute padding. This is a real bug that would only appear at runtime when the table formatter renders separator lines — the kind of bug that makes it into production because it doesn't affect the ASCII test cases.

## Quiet mode

```go
func (wr *Writer) Quiet() *Writer {
    return &Writer{w: wr.w, color: false, quiet: true}
}
```

In quiet mode, `writePrefixed` strips the prefix and writes the plain text. Scripts don't want `✓ google.com is reachable (latency 40ms)` — they want `google.com is reachable (latency 40ms)` or just the data.

The command would use it like:

```go
w := output.New(ctx.Out)
if c.quiet {
    w = w.Quiet()
}
```

This is Decorator at two levels: `output.Writer` decorates `io.Writer`, and `Quiet()` returns a new `Writer` that decorates the same underlying writer but with less decoration. The layers compose.

## What commands look like with the Writer

```go
func (c *HostCommand) Run(ctx *cli.Context) error {
    host := ctx.Args[0]
    w := output.New(ctx.Out)
    
    w.Info("Probing %s…", host)
    // ... probe ...
    w.Success("%s is reachable (latency %s)", host, latency)
    
    return nil
}
```

The command doesn't know or care:
- Whether the output is a terminal or a pipe
- What colour `Success` uses
- Whether ANSI codes are emitted
- How the prefix is formatted

The writer decides. The command just describes *what happened* — "this is a success" — and the writer decides *how to show it*.

## Testing with the Writer

In tests, commands receive a `bytes.Buffer` as `ctx.Out`:

```go
var out bytes.Buffer
ctx := cli.NewContext(&out, io.Discard)
```

`output.New(&out)` sees a `*bytes.Buffer`, which is not an `*os.File`, so `isTerminal` returns false, and colour is disabled. The output is plain text with prefix symbols only:

```
✓ google.com is reachable (latency 40ms)
```

You can assert on this without worrying about ANSI escape code noise in the comparison. No test double needed for the writer — the real one adapts automatically.

Next: testing the framework without a network.
