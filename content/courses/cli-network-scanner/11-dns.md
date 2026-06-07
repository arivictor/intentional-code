---
title: "Module 11: DNS Lookups — Strategy"
description: "DNS lookups are simple. The interesting part is how we handle five different record types without a switch statement growing forever."
---

# Module 11: DNS Lookups — Strategy

**Pattern: [Strategy](/go/patterns/behavioral/strategy)**

The DNS command is the simplest in the project — no goroutines, no channels, one call to the stdlib resolver. What makes it worth a module is the Strategy pattern applied to output formatting, and a case study in recognising when a switch statement should become an interface.

## The stdlib DNS resolver

Go's `net` package exposes lookup functions for every major record type:

```go
net.LookupHost(host)       // → []string (A records)
net.LookupMX(host)         // → []*net.MX
net.LookupNS(host)         // → []*net.NS
net.LookupTXT(host)        // → []string
net.LookupCNAME(host)      // → string
```

These use the system resolver — they respect `/etc/resolv.conf` and `/etc/hosts`. No DNS library needed.

Each function returns a different type. That's where the design question appears.

## The naïve switch

The obvious approach:

```go
func (c *DNSCommand) Run(ctx *cli.Context) error {
    host := ctx.Args[0]

    switch strings.ToUpper(c.recordType) {
    case "A":
        addrs, err := net.LookupHost(host)
        if err != nil { return err }
        for _, a := range addrs {
            fmt.Fprintf(ctx.Out, "A\t%s\n", a)
        }
    case "MX":
        mxs, err := net.LookupMX(host)
        if err != nil { return err }
        for _, mx := range mxs {
            fmt.Fprintf(ctx.Out, "MX\t%s (priority %d)\n", mx.Host, mx.Pref)
        }
    case "NS":
        nss, err := net.LookupNS(host)
        // ...
    case "TXT":
        // ...
    case "CNAME":
        // ...
    }
}
```

This is fine at five record types. Now: what if you add AAAA, SOA, SRV, PTR? Each case grows. `Run` becomes a long function that does resolution *and* formatting for every record type. Adding a new type means editing this function.

The signal: **when a switch has N arms that each do the same kind of thing differently, the arms want to be a polymorphic type**.

## The refactored version — shared result type

Rather than returning the stdlib types directly, we normalise all lookups into a shared result type:

```go
// internal/scanner/dns.go

type DNSRecord struct {
    Type  string
    Value string
}

func LookupDNS(host, recordType string) ([]DNSRecord, error) {
    switch strings.ToUpper(recordType) {
    case "A":
        return lookupA(host)
    case "MX":
        return lookupMX(host)
    case "NS":
        return lookupNS(host)
    case "TXT":
        return lookupTXT(host)
    case "CNAME":
        return lookupCNAME(host)
    default:
        return nil, fmt.Errorf("unsupported type %q", recordType)
    }
}
```

Each `lookup*` function is a private function that calls the stdlib, converts the result to `[]DNSRecord`, and returns. The command receives a `[]DNSRecord` and doesn't know which record type produced it.

Now the command is trivial:

```go
func (c *DNSCommand) Run(ctx *cli.Context) error {
    if len(ctx.Args) == 0 {
        return fmt.Errorf("hostname required")
    }

    records, err := scanner.LookupDNS(ctx.Args[0], c.recordType)
    if err != nil {
        return fmt.Errorf("DNS lookup failed: %w", err)
    }

    w := output.New(ctx.Out)
    rows := make([][]string, len(records))
    for i, r := range records {
        rows[i] = []string{r.Type, r.Value}
    }
    w.Table([]string{"TYPE", "VALUE"}, rows)
    return nil
}
```

The command doesn't have a switch at all. Each record type is handled in the scanner, and the output format is uniform. Adding a new record type means adding one private function in `scanner/dns.go` and one case in `LookupDNS` — no changes to the command.

## Where Strategy lives here

The Strategy pattern says: define a family of algorithms, encapsulate each one, make them interchangeable.

In this case:
- The "algorithms" are the lookup functions (`lookupA`, `lookupMX`, etc.)
- The "interface" is implicit: each takes a hostname and returns `([]DNSRecord, error)`
- The `LookupDNS` function selects the strategy based on `recordType`

We didn't need an explicit interface because Go functions are already first-class values and the strategies are stateless. We could have written:

```go
type lookupFn func(host string) ([]DNSRecord, error)

var lookups = map[string]lookupFn{
    "A":     lookupA,
    "MX":    lookupMX,
    "NS":    lookupNS,
    "TXT":   lookupTXT,
    "CNAME": lookupCNAME,
}

func LookupDNS(host, recordType string) ([]DNSRecord, error) {
    fn, ok := lookups[strings.ToUpper(recordType)]
    if !ok {
        return nil, fmt.Errorf("unsupported type %q", recordType)
    }
    return fn(host)
}
```

This is arguably cleaner — the map replaces the switch, and adding a new type means adding one map entry. Both approaches apply Strategy; the map version makes the extension point more visible.

The choice between a switch and a map for dispatch is worth discussing: the switch is more familiar, the map is more extensible. When you're likely to add new cases, the map signals that more clearly.

## The stdlib DNS caveat

`net.LookupHost` returns both IPv4 and IPv6 addresses mixed together. If you want only A records (IPv4), you'd need to filter:

```go
func lookupA(host string) ([]DNSRecord, error) {
    addrs, err := net.LookupHost(host)
    if err != nil {
        return nil, err
    }
    var records []DNSRecord
    for _, addr := range addrs {
        if strings.Contains(addr, ".") { // crude but effective IPv4 check
            records = append(records, DNSRecord{Type: "A", Value: addr})
        }
    }
    return records, nil
}
```

For a production tool you'd use `net.DefaultResolver.LookupIPAddr` with network type `"ip4"`. For this course, the simple version is sufficient — and mentioning the limitation is part of the lesson.

Next: the output package — where the Decorator pattern appears.
