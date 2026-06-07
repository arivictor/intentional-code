---
title: "Module 13: Testing Without a Network"
description: "How to test the framework and commands thoroughly without hitting a real network, calling os.Exit, or writing to a terminal."
---

# Module 13: Testing Without a Network

Tests that hit the network are slow, flaky, and environment-dependent. A CI machine behind a firewall can't reach `google.com`. A test that probes `192.168.1.1` on a laptop fails on a CI server where that host doesn't exist.

Every design decision in this course was made with testability in mind. This module shows the payoff.

## What makes code testable

Three things in `netscan` were designed specifically to enable testing without a network:

1. **`Dialer` interface** — lets tests inject a fake dialer that doesn't make real TCP connections
2. **`io.Writer` in Context** — lets tests capture output via `bytes.Buffer`
3. **`flag.ContinueOnError`** — lets tests trigger parsing errors without `os.Exit` killing the test process

These aren't test-specific constructs. They're seams — points in the production code where behaviour can be varied without changing the code under test.

## The fake Dialer

```go
// internal/scanner/probe_test.go

type fakeConn struct{}

func (f *fakeConn) Read(b []byte) (int, error)         { return 0, io.EOF }
func (f *fakeConn) Write(b []byte) (int, error)        { return len(b), nil }
func (f *fakeConn) Close() error                       { return nil }
func (f *fakeConn) LocalAddr() net.Addr                { return nil }
func (f *fakeConn) RemoteAddr() net.Addr               { return nil }
func (f *fakeConn) SetDeadline(t time.Time) error      { return nil }
func (f *fakeConn) SetReadDeadline(t time.Time) error  { return nil }
func (f *fakeConn) SetWriteDeadline(t time.Time) error { return nil }

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

`fakeConn` implements `net.Conn` — seven methods, none of which do anything real. `fakeDialer` returns a `fakeConn` (success) or an error (simulated failure).

```go
func TestProbeHost_reachable(t *testing.T) {
    dialer := &fakeDialer{latency: 10 * time.Millisecond}
    result := ProbeHost(context.Background(), dialer, "example.com")

    if !result.Reachable {
        t.Fatalf("expected reachable, got: %v", result.Error)
    }
    if result.Latency < 10*time.Millisecond {
        t.Errorf("expected latency >= 10ms, got %s", result.Latency)
    }
}

func TestProbeHost_unreachable(t *testing.T) {
    dialer := &fakeDialer{err: errors.New("connection refused")}
    result := ProbeHost(context.Background(), dialer, "example.com")

    if result.Reachable {
        t.Fatal("expected unreachable")
    }
    if result.Error == nil {
        t.Fatal("expected an error on the result")
    }
}
```

No network. Runs in milliseconds. Deterministic.

## Testing the framework with a command double

For framework tests, we control the command's behaviour with a test double:

```go
// internal/cli/app_test.go

type fakeCommand struct {
    cli.BaseCommand
    ranWith *cli.Context
    err     error
}

func newFake(name string) *fakeCommand {
    c := &fakeCommand{}
    c.BaseCommand = cli.NewBaseCommand(name, "fake synopsis", "fake usage")
    return c
}

func (f *fakeCommand) Run(ctx *cli.Context) error {
    f.ranWith = ctx
    return f.err
}
```

Now we can test the App without any real command logic:

```go
// Does App dispatch to the right command?
func TestApp_dispatch(t *testing.T) {
    cmd := newFake("scan")
    var out bytes.Buffer
    app := cli.New("test").Output(&out).Register(cmd)

    if err := app.Run([]string{"test", "scan"}); err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if cmd.ranWith == nil {
        t.Fatal("expected Run to be called")
    }
}

// Does --help short-circuit before Run?
func TestApp_helpFlag(t *testing.T) {
    cmd := newFake("scan")
    var out bytes.Buffer
    app := cli.New("test").Output(&out).Register(cmd)

    app.Run([]string{"test", "scan", "--help"})

    if cmd.ranWith != nil {
        t.Error("Run should not be called when --help is present")
    }
    if !strings.Contains(out.String(), "fake usage") {
        t.Errorf("expected usage in output, got: %s", out.String())
    }
}

// Does an unknown command return an error (not panic)?
func TestApp_unknownCommand(t *testing.T) {
    var out bytes.Buffer
    app := cli.New("test").ErrOutput(&out)
    err := app.Run([]string{"test", "doesnotexist"})
    if err == nil {
        t.Fatal("expected error for unknown command")
    }
}
```

## The flag-after-positional test

We talked about the stdlib flag gotcha in Module 5. Here's the test that verifies our fix works:

```go
func TestApp_flagsAfterPositional(t *testing.T) {
    cmd := newFakeWithFlag("scan") // has a --output flag registered
    var out bytes.Buffer
    app := cli.New("test").Output(&out).Register(cmd)

    // --output comes AFTER the positional arg — stdlib flag.Parse would lose it.
    app.Run([]string{"test", "scan", "192.168.1.1", "--output=json"})

    // Verify the flag was parsed correctly.
    got := cmd.Flags().Lookup("output")
    if got.Value.String() != "json" {
        t.Errorf("expected --output=json, got %q", got.Value.String())
    }

    // Verify the positional arg is still in ctx.Args.
    if len(cmd.ranWith.Args) == 0 || cmd.ranWith.Args[0] != "192.168.1.1" {
        t.Errorf("expected positional arg '192.168.1.1', got %v", cmd.ranWith.Args)
    }
}
```

This test would fail if we used raw `fs.Parse(ctx.Args)` without the `splitArgs` separation.

## Table-driven tests for port range parsing

The `parseRange` function in `commands/ports.go` has several edge cases. Table-driven tests cover them cleanly:

```go
func TestParseRange(t *testing.T) {
    tests := []struct {
        input     string
        wantStart int
        wantEnd   int
        wantErr   bool
    }{
        {"1-1024", 1, 1024, false},
        {"80-80", 80, 80, false},
        {"1-65535", 1, 65535, false},
        {"0-1024", 0, 0, true},   // port 0 invalid
        {"1024-80", 0, 0, true},  // start > end
        {"abc-1024", 0, 0, true}, // not a number
        {"1024", 0, 0, true},     // missing separator
    }

    for _, tt := range tests {
        t.Run(tt.input, func(t *testing.T) {
            start, end, err := parseRange(tt.input)
            if tt.wantErr {
                if err == nil {
                    t.Fatalf("expected error for input %q", tt.input)
                }
                return
            }
            if err != nil {
                t.Fatalf("unexpected error: %v", err)
            }
            if start != tt.wantStart || end != tt.wantEnd {
                t.Errorf("got start=%d, end=%d; want %d-%d", start, end, tt.wantStart, tt.wantEnd)
            }
        })
    }
}
```

## Golden file tests for table output

Table output is hard to assert with string comparisons — the format might be correct but the test is brittle to whitespace changes. Golden files are more maintainable:

```go
// internal/output/writer_test.go

func TestWriter_table(t *testing.T) {
    var out bytes.Buffer
    w := output.New(&out) // not a terminal → no colour

    w.Table(
        []string{"HOST", "LATENCY"},
        [][]string{
            {"192.168.1.1", "12ms"},
            {"192.168.1.100", "340ms"},
        },
    )

    golden := filepath.Join("testdata", "table.golden")
    if *update { // run with -update flag to regenerate
        os.WriteFile(golden, out.Bytes(), 0644)
    }
    want, _ := os.ReadFile(golden)
    if !bytes.Equal(out.Bytes(), want) {
        t.Errorf("table output mismatch:\ngot:\n%s\nwant:\n%s", out.Bytes(), want)
    }
}
```

The `testdata/table.golden` file contains the expected output. When the format changes intentionally, run `go test ./... -update` to regenerate all goldens. When it changes accidentally, the test catches it.

## Running tests

```bash
# All tests
go test ./...

# With race detector (essential for concurrent code)
go test -race ./...

# Verbose output
go test -v ./internal/cli/...

# Regenerate golden files
go test -update ./internal/output/...
```

The race detector (`-race`) is non-negotiable for the concurrency code in `scanner/portscan.go` and `scanner/subnet.go`. It slows tests by ~5x but catches data races that are invisible in normal test runs.

## The testability takeaway

Every pattern decision in this course that touched data flow — `Dialer` interface, `io.Writer` in `Context`, `BaseCommand` with `ContinueOnError` — was made with this module in mind. Testability is not a feature you add at the end. It's a constraint that shapes design from the start.

If you find yourself writing a function that's hard to test, the test difficulty is telling you something about the design. It's usually one of:
- A hidden dependency (reads from a file, dials a server, reads the clock) — introduce an interface
- Global state — inject it instead
- `os.Exit` — move it to `main`, return errors everywhere else

`netscan` follows all three rules. The tests are the proof.

Next: shipping the binary.
