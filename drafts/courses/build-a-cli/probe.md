---
title: "Module 7: Probing a Host — No Pattern Needed"
description: "We write the first real network code. And we deliberately don't reach for a pattern. Knowing when not to use one is half the skill."
order: 7
---

# Module 7: Probing a Host — No Pattern Needed

This module is deliberately short. We're writing `scanner/probe.go` — the code that actually dials a host and measures latency. And we're not going to introduce a pattern.

This is intentional, and it's worth saying explicitly: **patterns are solutions to recurring problems. If you don't have the problem, you don't need the solution.**

A function that dials one host, returns a result, and cleans up after itself doesn't have a coordination problem, a variation problem, or an extension problem. It has exactly one job and it does it. A pattern would add indirection with no benefit.

But we *will* introduce an interface — not as a pattern, but for testability. There's a difference.

## What `ProbeHost` needs to do

1. Attempt a TCP connection to port 80 on the target host
2. If port 80 fails, try port 443 as a fallback
3. Measure round-trip time
4. Return a result struct

We use TCP dial, not ICMP ping. ICMP requires raw socket privileges (`CAP_NET_RAW` on Linux, root on macOS). TCP dial to port 80 works for most public hosts and requires no elevated permissions.

## The result type

```go
// internal/scanner/probe.go
package scanner

import (
    "context"
    "fmt"
    "net"
    "time"
)

type ProbeResult struct {
    Host      string
    Reachable bool
    Latency   time.Duration
    Error     error
}
```

An `Error` field on a non-error result type might look odd. It's there because we sometimes want to collect both successes and failures in the same slice (the subnet scanner does this) and filter them after. Returning `(ProbeResult, error)` would force the caller to handle two levels of error — the function-level error and the probe-level failure. A single result type with an embedded error field is cleaner for batch collection.

## The Dialer interface — for testability, not pattern

```go
// Dialer is an interface around the TCP dialling operation.
// The real implementation uses net.Dialer; tests use a fake.
type Dialer interface {
    DialContext(ctx context.Context, network, address string) (net.Conn, error)
}

// NetDialer is the real implementation.
type NetDialer struct {
    d net.Dialer
}

func NewDialer(timeout time.Duration) *NetDialer {
    return &NetDialer{d: net.Dialer{Timeout: timeout}}
}

func (nd *NetDialer) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
    return nd.d.DialContext(ctx, network, address)
}
```

This is the [Strategy pattern](/patterns/behavioral/strategy) in its minimal form — but we're not introducing it to vary behaviour at runtime. We're introducing it so that tests don't touch the network.

In tests:

```go
type fakeDialer struct {
    latency time.Duration
    err     error
}

func (f *fakeDialer) DialContext(_ context.Context, _, _ string) (net.Conn, error) {
    if f.err != nil {
        return nil, f.err
    }
    time.Sleep(f.latency)
    return &fakeConn{}, nil
}
```

We'll see `fakeDialer` in the testing module. For now: any function that accepts a `Dialer` can be tested without a network.

## ProbeHost

```go
func ProbeHost(ctx context.Context, dialer Dialer, host string) ProbeResult {
    address := net.JoinHostPort(host, "80")
    start := time.Now()

    conn, err := dialer.DialContext(ctx, "tcp", address)
    latency := time.Since(start)

    if err != nil {
        // Fallback: try port 443.
        address443 := net.JoinHostPort(host, "443")
        start = time.Now()
        conn, err = dialer.DialContext(ctx, "tcp", address443)
        latency = time.Since(start)
    }

    if err != nil {
        return ProbeResult{Host: host, Reachable: false, Error: err}
    }

    conn.Close()
    return ProbeResult{Host: host, Reachable: true, Latency: latency}
}
```

Plain Go. No pattern needed. `context.Context` propagates cancellation from the user (Ctrl-C) through to the dial operation — if the user cancels, `DialContext` returns immediately with a context error.

The `conn.Close()` call is not deferred. Why? Because we don't want to keep the connection open — we're measuring reachability, not maintaining a session. Deferring the close would leave the connection open for the rest of the function scope, which is fine but unnecessary. Closing immediately is more honest about intent.

## ProbePort

For port scanning we need a leaner version: just open and close, return a boolean.

```go
func ProbePort(ctx context.Context, dialer Dialer, host string, port int) (bool, error) {
    address := net.JoinHostPort(host, fmt.Sprintf("%d", port))
    conn, err := dialer.DialContext(ctx, "tcp", address)
    if err != nil {
        // A refused or filtered port is not a function error.
        // It's a successful probe that found a closed port.
        return false, nil
    }
    conn.Close()
    return true, nil
}
```

Notice we return `false, nil` on connection error rather than `false, err`. A closed port is not an error in the caller's sense — it's the expected result for most ports. Propagating the error would force every port scanner goroutine to handle "connection refused" as if it were exceptional. It's not.

The real `error` return exists for unexpected failures: network unreachable, permission denied, context cancelled. Those are worth surfacing; "connection refused to port 8192" is not.

## The host command

Now we can wire the command:

```go
// internal/commands/host.go

func (c *HostCommand) Run(ctx *cli.Context) error {
    if len(ctx.Args) == 0 {
        return fmt.Errorf("host name required — run 'netscan help host'")
    }

    host := ctx.Args[0]
    w := output.New(ctx.Out)
    w.Info("Probing %s (timeout %s)…", host, c.timeout)

    dialer := scanner.NewDialer(c.timeout)
    probeCtx, cancel := context.WithTimeout(ctx.Ctx, c.timeout)
    defer cancel()

    result := scanner.ProbeHost(probeCtx, dialer, host)

    if result.Reachable {
        w.Success("%s is reachable (latency %s)", host, result.Latency.Round(time.Millisecond))
    } else {
        w.Fail("%s is unreachable: %v", host, result.Error)
    }

    return nil
}
```

The command creates a dialer with the user's timeout (from the flag, parsed by middleware before `Run` was called). It wraps `ctx.Ctx` in a timeout context so the network call respects the flag value. It passes both to `scanner.ProbeHost` and formats the result.

Nothing in `ProbeHost` knows it's inside a CLI. Nothing in the command knows how `ProbeHost` implements its dial. Each piece has one job.

## What we resisted

We could have made `ProbeHost` a method on some `Prober` struct. We could have made the fallback port strategy pluggable. We could have defined a `ProbeStrategy` interface.

We didn't, because none of those variations are needed. The probe logic is stable, the fallback is always the same, and the only variation we need (real vs. fake dialer) is already handled by the `Dialer` interface.

Knowing when to stop adding abstraction is a skill. The test: *does this abstraction serve a real, present need?* If the answer is "it might be useful someday," leave it out.

Next: port scanning — where we *do* need a pattern, and we'll feel exactly why.
