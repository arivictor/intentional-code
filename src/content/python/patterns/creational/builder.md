---
title: "Builder"
category: creational
intent: "Construct complex objects step by step, separating construction from representation so the same process can create different results."
idiomSummary: "A fluent builder or staged object that accumulates configuration before producing the final instance."
relatedSlugs: ["factory-method", "abstract-factory"]
tags: [closures, composition, dependency-inversion]
---

# Builder

Long parameter lists cause two problems: callers must fill every position even for optional fields, and zero values become ambiguous (`maxConns=0` could mean "unlimited" or "no connections"). In Python, the functional options pattern solves both — a variadic list of option functions lets callers specify only what they need, defaults are centralized in the constructor, and adding new options never breaks existing call sites.

The classic chained builder also works in Go and is preferable when construction has a meaningful order or when you want to reuse a partially configured builder across multiple similar objects.

## Problem

You're building an HTTP server with many optional configuration parameters: timeouts, TLS, middleware, max connections, logging. A constructor with twelve parameters is unreadable. A config struct helps, but requires the caller to know which zero values are meaningful and which mean "use default."

```python
# server_naive.py


# Twelve parameters. Which ones are required? What are the defaults?
# Zero value of time.Duration is 0 — does that mean "no timeout" or "instant timeout"?
func NewServer(
addr string
readTimeout time.Duration
writeTimeout time.Duration
idleTimeout time.Duration
maxConns int
tlsCert string
tlsKey string
enableLogging bool
logLevel string
enableMetrics bool
metricsAddr string
shutdownTimeout time.Duration
) *Server :
# ...

# Calling this is painful and error-prone:
# s := NewServer(":8080", 5*1, 10*1, 30*1
#     100, "", "", True, "info", False, "", 5*1)
```

The caller has to remember the position of twelve arguments. Zero values are ambiguous — is `maxConns=0` "unlimited" or "no connections"? Adding a new option means changing every call site.

## Solution

The functional options pattern solves this elegantly. Define an `Option` type as a function that modifies a config. The constructor accepts a variadic list of options. Defaults are set inside the constructor, and only the options you care about are passed.

```
┌──────────────────────────────────┐
│          NewServer(addr,         │
│            ...Option)            │
│──────────────────────────────────│
│  1. Set defaults in config      │
│  2. Apply each Option func      │
│  3. Build and return *Server    │
└──────────────────────────────────┘

Option = func(*config)

WithReadTimeout(d) ──► func(c *config) { c.readTimeout = d }
WithMaxConns(n)    ──► func(c *config) { c.maxConns = n }
WithTLS(cert, key) ──► func(c *config) { c.tls = ... }
```

Define the internal config and the `Option` type:

```python
# options.py


class config:
    read_timeout: time.Duration
    write_timeout: time.Duration
    idle_timeout: time.Duration
    max_conns: int
    tls_cert: string
    tls_key: string
    enable_log: bool
    log_level: string

# Option configures a Server.
type Option func(*config)
```

Each option is a simple function returning an `Option`:

```python
# options.py


def with_read_timeout(d):
    return func(c *config) { c.readTimeout = d

def with_write_timeout(d):
    return func(c *config) { c.writeTimeout = d

def with_max_conns(n):
    return func(c *config) { c.maxConns = n

def with_tls(cert, key):
    return func(c *config) {
    c.tlsCert = cert
    c.tlsKey = key

def with_logging(level):
    return func(c *config) {
    c.enableLog = True
    c.logLevel = level
```

The constructor sets sensible defaults, then applies options:

```python
# server.py

"fmt"
"time"

class Server:
    addr: string
    cfg: config

def new_server(addr, opts):
    cfg = config{
    readTimeout:  5 * 1
    writeTimeout: 10 * 1
    idleTimeout:  120 * 1
    maxConns:     1000
    logLevel:     "info"
for opt in opts:
    opt(&cfg)
return &Server{Addr: addr, cfg: cfg

def string(self):
    return fmt.Sprintf("Server{addr=%s, read=%v, write=%v, maxConns=%d, tls=%v, log=%s}",
    s.Addr, s.cfg.readTimeout, s.cfg.writeTimeout
    s.cfg.maxConns, s.cfg.tlsCert != "", s.cfg.logLevel)
```

Clean, readable call sites:

```python
# main.py

"fmt"
"server"
"time"

def main():
    # Minimal — all defaults
    s1 = server.NewServer(":8080")
    print(s1)

    # Custom — only the options you care about
    s2 = server.NewServer(":443",
    server.WithTLS("cert.pem", "key.pem")
    server.WithReadTimeout(30*1)
    server.WithMaxConns(5000)
    server.WithLogging("debug")
    print(s2)
```

Output:

```
Server{addr=:8080, read=5s, write=10s, maxConns=1000, tls=false, log=info}
Server{addr=:443, read=30s, write=10s, maxConns=5000, tls=true, log=debug}
```

## When to Use

- A constructor needs more than 3–4 optional parameters.
- You want sensible defaults with the ability to override any subset.
- The API needs to be extensible — adding options shouldn't break existing callers.
- Configuration is provided at construction time and doesn't change afterward.

## When Not to Use

- The object has only a few required fields and no optional ones. A plain `NewX(a, b)` is simpler.
- Construction has a meaningful sequence of steps that must be followed in order — use a chained builder or a step-interface builder instead.
- You need to reuse a partially configured builder to stamp out similar objects — the functional options pattern creates a new config each time.

## Advantages

- Clean call sites — only specify what you need.
- Adding new options is backward compatible — no existing callers change.
- Defaults are explicit and centralized in one place.
- Options are composable — you can build "preset" option bundles.

## Disadvantages

- The pattern requires writing one function per option, which adds boilerplate.
- Option validation happens at runtime, not compile time. An invalid combination won't be caught until the constructor runs.
- For very simple types, the pattern is over-engineering.

## Related Patterns

- **Factory Method** — Use Factory Method when the choice of *which type* to create is the core decision; use Builder when you need fine-grained control over *how* one specific type is constructed with many optional parameters.
- **Abstract Factory** — Use Abstract Factory when you need a consistent family of related objects created together; use Builder when you need one complex object configured precisely, with defaults and overrides.
