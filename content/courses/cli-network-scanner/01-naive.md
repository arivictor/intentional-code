---
title: "Module 1: The Naïve Version — and Why It Breaks"
description: "We start by writing the simplest possible CLI tool. Then we add a second subcommand, and watch the design collapse."
---

# Module 1: The Naïve Version — and Why It Breaks

Before writing a single abstraction, we're going to write code the dumb way. Not because it's useful — because it's honest. Every pattern in this course exists to solve a real problem, and you can't appreciate the solution until you've felt the pain.

So: let's write `netscan` as a typical Go beginner would.

## The first version

One file. One command. Probe a host and report whether it's reachable.

```go
package main

import (
    "flag"
    "fmt"
    "net"
    "os"
    "time"
)

func main() {
    timeout := flag.Duration("timeout", 2*time.Second, "connection timeout")
    flag.Parse()

    args := flag.Args()
    if len(args) == 0 {
        fmt.Fprintln(os.Stderr, "usage: netscan <host>")
        os.Exit(1)
    }

    host := args[0]
    address := net.JoinHostPort(host, "80")

    start := time.Now()
    conn, err := net.DialTimeout("tcp", address, *timeout)
    latency := time.Since(start)

    if err != nil {
        fmt.Fprintf(os.Stderr, "✗ %s unreachable: %v\n", host, err)
        os.Exit(1)
    }
    conn.Close()

    fmt.Printf("✓ %s reachable (latency %s)\n", host, latency.Round(time.Millisecond))
}
```

This is fine. It compiles, it works, it's readable. There's nothing wrong with it for one command.

## Adding a second command

Now the product needs port scanning. So we add a subcommand: `netscan ports <host>`.

The natural reflex: add an argument check at the top.

```go
func main() {
    if len(os.Args) < 2 {
        fmt.Fprintln(os.Stderr, "usage: netscan <command> [flags]")
        os.Exit(1)
    }

    switch os.Args[1] {
    case "host":
        runHost(os.Args[2:])
    case "ports":
        runPorts(os.Args[2:])
    default:
        fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
        os.Exit(1)
    }
}

func runHost(args []string) {
    fs := flag.NewFlagSet("host", flag.ExitOnError)
    timeout := fs.Duration("timeout", 2*time.Second, "connection timeout")
    fs.Parse(args)
    // ... probe logic
}

func runPorts(args []string) {
    fs := flag.NewFlagSet("ports", flag.ExitOnError)
    timeout := fs.Duration("timeout", 500*time.Millisecond, "connection timeout")
    rangeStr := fs.String("range", "1-1024", "port range")
    fs.Parse(args)
    // ... port scan logic
}
```

Still manageable. A little repetitive, but two commands is fine.

## The third command breaks it

`netscan subnet` arrives. Then `netscan dns`. Then `netscan watch`. After five commands the `main` function looks like this:

```go
func main() {
    if len(os.Args) < 2 {
        printHelp()
        os.Exit(0)
    }

    switch os.Args[1] {
    case "host":
        runHost(os.Args[2:])
    case "ports":
        runPorts(os.Args[2:])
    case "subnet":
        runSubnet(os.Args[2:])
    case "dns":
        runDNS(os.Args[2:])
    case "watch":
        runWatch(os.Args[2:])
    case "help":
        if len(os.Args) > 2 {
            printCommandHelp(os.Args[2])
        } else {
            printHelp()
        }
    default:
        fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
        os.Exit(1)
    }
}
```

And every `run*` function has this identical preamble:

```go
func runHost(args []string) {
    fs := flag.NewFlagSet("host", flag.ExitOnError)
    // ... register flags ...
    fs.Parse(args)

    if len(fs.Args()) == 0 {
        fmt.Fprintln(os.Stderr, "usage: netscan host <hostname>")
        os.Exit(1)
    }

    // ... same error handling pattern as every other command ...
    // ... same help flag check as every other command ...
}
```

Count what's wrong:

1. **Adding a command means editing `main`**. The switch is a modification point — every new command touches it.
2. **Flag parsing is copy-pasted** across every `run*` function. The error mode, the `--help` check, the `os.Exit` — all repeated.
3. **Help is manual**. You have to remember to update `printHelp()` every time you add a command. It will drift.
4. **Error formatting is inconsistent**. Each command decided independently how to print errors.
5. **Testing is impossible**. The functions call `os.Exit`, write to `os.Stderr` directly, and have no seam for injecting test inputs.

None of these problems are catastrophic at two commands. At five they're an active drag. At ten they're a maintenance nightmare.

## What we actually need

We need a system where:

- Adding a new command requires **no changes to the dispatch logic**
- Flag parsing and help handling happen **in one place**, not in every command
- Commands write to an **injected writer**, not directly to `os.Stdout`
- The whole app can be driven by **tests without hitting the network or calling os.Exit**

That's the framework we're going to build. The scanner is the excuse. The framework is the lesson.

Next: we design the folder structure — before writing a line of the framework itself.
