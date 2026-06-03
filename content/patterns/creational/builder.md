---
title: "Builder"
description: "Construct complex objects step by step, separating construction from representation so the same process can create different results."
---

# Builder

The Builder pattern constructs complex objects step by step, separating the construction process from the final representation. This allows you to create different representations of an object using the same construction process. In Go, the functional options pattern is a common way to implement Builder: you define a set of option functions that modify a configuration struct, and a constructor that applies those options to build the final object. The classic chained builder pattern can also be used when construction has a meaningful order or when you want to reuse a partially configured builder across multiple similar objects.

## Scenario

You're building an HTTP client with many optional configuration parameters: timeouts, retry count, a base URL, and custom headers. A constructor with many parameters is unreadable. A config struct helps, but requires the caller to know which zero values are meaningful and which mean "use the default."

```go
// client_naive.go
package client

import "time"

// Which parameters are required? What do the zero values mean?
// Does timeout=0 mean "no timeout" or "instant timeout"?
func NewClient(
    baseURL     string,
    timeout     time.Duration,
    retries     int,
    userAgent   string,
    apiKey      string,
    maxIdleConn int,
) *Client {
    // ...
}

// Calling this is painful:
// c := NewClient("https://api.example.com", 5*time.Second, 3, "myapp/1.0", "key-123", 10)
```

The caller must remember the position of every argument. Zero values are ambiguous: is `retries=0` "no retries" or "use the default"? Adding a new parameter changes every call site.

## Solution

The functional options pattern fixes this cleanly. Define an `Option` type as a function that modifies a config. The constructor accepts a variadic list of options. Set defaults inside the constructor, then pass only the options you care about.

```
┌──────────────────────────────────┐
│        NewClient(baseURL,        │
│          ...Option)              │
│──────────────────────────────────│
│  1. Set defaults in config       │
│  2. Apply each Option func       │
│  3. Build and return *Client     │
└──────────────────────────────────┘

Option = func(*config)

WithTimeout(d)   ──► func(c *config) { c.timeout = d }
WithRetries(n)   ──► func(c *config) { c.retries = n }
WithUserAgent(s) ──► func(c *config) { c.userAgent = s }
```

```go
package intentionalcode

import (
	"fmt"
	"time"
)

type config struct {
	timeout     time.Duration
	retries     int
	userAgent   string
	apiKey      string
	maxIdleConn int
}

type Option func(*config)

func WithTimeout(d time.Duration) Option  { return func(c *config) { c.timeout = d } }
func WithRetries(n int) Option            { return func(c *config) { c.retries = n } }
func WithUserAgent(ua string) Option      { return func(c *config) { c.userAgent = ua } }
func WithAPIKey(key string) Option        { return func(c *config) { c.apiKey = key } }
func WithMaxIdleConns(n int) Option       { return func(c *config) { c.maxIdleConn = n } }

type Client struct {
	BaseURL string
	cfg     config
}

func NewClient(baseURL string, opts ...Option) *Client {
	cfg := config{
		timeout:     5 * time.Second,
		retries:     3,
		userAgent:   "go-client/1.0",
		maxIdleConn: 10,
	}
	for _, opt := range opts {
		opt(&cfg)
	}
	return &Client{BaseURL: baseURL, cfg: cfg}
}

func (c *Client) String() string {
	return fmt.Sprintf("Client{url=%s, timeout=%v, retries=%d, ua=%s}",
		c.BaseURL, c.cfg.timeout, c.cfg.retries, c.cfg.userAgent)
}

func main() {
	c1 := NewClient("https://api.example.com")
	fmt.Println(c1)

	c2 := NewClient("https://api.example.com",
		WithTimeout(30*time.Second),
		WithRetries(5),
		WithAPIKey("secret-key"),
		WithUserAgent("myapp/2.0"),
	)
	fmt.Println(c2)
}
```

Output:

```
Client{url=https://api.example.com, timeout=5s, retries=3, ua=go-client/1.0}
Client{url=https://api.example.com, timeout=30s, retries=5, ua=myapp/2.0}
```

## When to Use

- A constructor needs more than 3–4 optional parameters.
- You want sensible defaults with the ability to override any subset.
- The API needs to be extensible: adding options shouldn't break existing callers.
- Configuration is provided at construction time and doesn't change afterward.

## When Not to Use

- The object has only a few required fields and no optional ones. A plain `NewX(a, b)` is simpler.
- Construction has a meaningful sequence of steps that must be followed in order. Use a chained builder or a step-interface builder instead.
- You need to reuse a partially configured builder to stamp out similar objects. The functional options pattern creates a new config each time.

## The Decision

The functional options pattern costs almost nothing at the call site: callers only name what they care about, and adding a new option never breaks existing code. The cost is one extra function per option, which adds up in large APIs. A twenty-option type means twenty small functions to write and test. Option validation happens at runtime inside the constructor, not at compile time, so an invalid combination (mutually exclusive options, out-of-range values) won't be caught until the constructor runs. The pattern also doesn't compose naturally when you want to reuse a partially built object: each `NewClient` call starts fresh from defaults, so you can't cheaply stamp out five clients that share most settings without building a preset slice of options yourself.

## Related Patterns

- **Factory Method**: Use Factory Method when the choice of *which type* to create is the core decision; use Builder when you need fine-grained control over *how* one specific type is constructed with many optional parameters.
- **Abstract Factory**: Use Abstract Factory when you need a consistent family of related objects created together; use Builder when you need one complex object configured precisely, with defaults and overrides.
