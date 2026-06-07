---
title: "Module 9: Subnet Scanning — Worker Pool"
description: "Same shape of problem as port scanning, different constraint. We reach for the Worker Pool instead — and explain exactly why."
---

# Module 9: Subnet Scanning — Worker Pool

**Pattern: [Worker Pool](/go/patterns/concurrency/worker-pool)**

This module is a deliberate contrast with the last one. Port scanning and subnet scanning look like the same problem: probe a lot of things concurrently, collect results. But the constraints are different — and different constraints produce different patterns.

## The constraint that changes everything

Port scanning: we're hitting one host, one port at a time. The host is a public server; it can handle a flood of connections. We want maximum throughput. Fan-out is correct.

Subnet scanning: we're hitting every host in a CIDR block. A `/24` gives us 254 hosts. Spinning up 254 goroutines simultaneously on a LAN:

- Floods the ARP table — the router has to resolve 254 MAC addresses at once
- Can look like an attack — corporate security tools may block you or flag your machine
- Wastes resources — most hosts won't respond; keeping 200 goroutines alive waiting for their timeout is expensive

We need **bounded concurrency**. A ceiling on how many probes run simultaneously, regardless of how many hosts are in the subnet.

Fan-out doesn't give us this. Fan-out creates one goroutine per unit of work — 254 hosts, 254 goroutines. The Worker Pool does: you decide the pool size, and work flows through it.

## Fan-out vs Worker Pool — the exact difference

```
Fan-out:     1 goroutine per work item (unbounded)
Worker Pool: N goroutines, pulling from a queue (bounded)
```

Same goal (parallel work), different resource model. The tradeoff:

- **Fan-out**: maximum throughput, unbounded goroutine count
- **Worker Pool**: bounded goroutine count, slightly lower throughput per item

For subnet scanning, bounded is right. For port scanning, unbounded-but-capped-by-flag is right (the `--concurrency` flag does the bounding externally).

## Enumerating hosts in a CIDR

Before we can scan, we need the list of hosts. Given `"192.168.1.0/24"`:

```go
func enumerateHosts(cidr string) ([]string, error) {
    ip, ipNet, err := net.ParseCIDR(cidr)
    if err != nil {
        return nil, err
    }
    _ = ip // ParseCIDR returns both the host IP and the network; we use the network

    networkIP := ipNet.IP.To4()
    mask := ipNet.Mask

    // Broadcast = network address with all host bits set to 1
    broadcast := make(net.IP, 4)
    for i := range networkIP {
        broadcast[i] = networkIP[i] | ^mask[i]
    }

    // Convert to integers for arithmetic
    start := binary.BigEndian.Uint32(networkIP) + 1 // skip network address
    end := binary.BigEndian.Uint32(broadcast) - 1   // skip broadcast address

    hosts := make([]string, 0, end-start+1)
    for addr := start; addr <= end; addr++ {
        b := make([]byte, 4)
        binary.BigEndian.PutUint32(b, addr)
        hosts = append(hosts, net.IP(b).String())
    }
    return hosts, nil
}
```

We do the bit arithmetic explicitly. It would be tidier to hide it behind a library, but that would obscure what's actually happening. Understanding IP arithmetic is part of understanding network tools — and when something goes wrong, you need to know what the code is doing.

`binary.BigEndian.Uint32` converts a 4-byte IP address to an integer so we can do arithmetic on it. `binary.BigEndian.PutUint32` converts back. The "big endian" refers to byte order: the most significant byte first, which is standard for network addresses.

## The Worker Pool

```go
// internal/scanner/subnet.go

func ScanSubnet(ctx context.Context, dialer Dialer, cidr string, workers int) ([]ProbeResult, error) {
    hosts, err := enumerateHosts(cidr)
    if err != nil {
        return nil, err
    }

    // Enqueue all work upfront.
    work := make(chan string, len(hosts))
    for _, h := range hosts {
        work <- h
    }
    close(work) // closed immediately — all work is in the buffer

    results := make(chan ProbeResult, len(hosts))

    // Spin up exactly `workers` goroutines.
    var wg sync.WaitGroup
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for host := range work {
                select {
                case <-ctx.Done():
                    return
                default:
                }
                results <- ProbeHost(ctx, dialer, host)
            }
        }()
    }

    go func() {
        wg.Wait()
        close(results)
    }()

    var out []ProbeResult
    for r := range results {
        out = append(out, r)
    }
    return out, nil
}
```

The structure is simpler than `ScanPorts` because:

1. All work is known upfront — we can buffer the full `work` channel and close it before workers start
2. We don't need a separate producer goroutine — the `for host := range work` loop drains the pre-filled channel

With port scanning, the port range could be very large (1–65535) and we didn't want to buffer all 65535 entries. So we used a smaller buffer and a producer goroutine that feeds on demand. With subnets, the maximum is 65534 hosts (a /16), which is fine to buffer.

## What the command looks like

```go
// internal/commands/subnet.go

func (c *SubnetCommand) Run(ctx *cli.Context) error {
    if len(ctx.Args) == 0 {
        return fmt.Errorf("CIDR block required — e.g. 192.168.1.0/24")
    }

    cidr := ctx.Args[0]
    w := output.New(ctx.Out)
    w.Info("Scanning %s (%d workers, %s timeout)…", cidr, c.workers, c.timeout)

    dialer := scanner.NewDialer(c.timeout)
    results, err := scanner.ScanSubnet(ctx.Ctx, dialer, cidr, c.workers)
    if err != nil {
        return fmt.Errorf("subnet scan failed: %w", err)
    }

    var live []scanner.ProbeResult
    for _, r := range results {
        if r.Reachable {
            live = append(live, r)
        }
    }

    sort.Slice(live, func(i, j int) bool { return live[i].Host < live[j].Host })

    if len(live) == 0 {
        w.Info("No live hosts found in %s", cidr)
        return nil
    }

    rows := make([][]string, len(live))
    for i, r := range live {
        rows[i] = []string{r.Host, r.Latency.Round(time.Millisecond).String()}
    }
    w.Table([]string{"HOST", "LATENCY"}, rows)
    return nil
}
```

The command handles sorting and filtering of results. The scanner doesn't — it returns everything and lets the caller decide what to do with it. This keeps the scanner reusable: a different command might want to see unreachable hosts too (for gap analysis).

## The pattern in perspective

Worker Pool and Fan-out are siblings — both distribute work across goroutines, both collect results through channels. The distinguishing question is: **do you control the number of goroutines, or do you let it grow with the input?**

When the input size is bounded and small, fan-out is simpler. When the input is large or unbounded, or when you need to limit resource usage, worker pool is right. Network scanning sits in between — and the two commands in this project land on different sides of that line by design.

Next: the `watch` command — continuous monitoring via a goroutine pipeline.
