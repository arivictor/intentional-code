---
title: "Observer"
category: behavioral
intent: "Define a one-to-many dependency between objects so that when one changes state, all dependents are notified automatically."
idiomSummary: "Subscriber interface slice or channels; cover unsubscribe and goroutine/lifecycle concerns."
relatedSlugs: ["mediator", "command"]
tags: [interfaces, closures, concurrency, events, testability]
---

# Observer

In Go, Observer gives you three subscriber mechanisms: interface values (classic, stateful), function values (lighter, more composable), and channels (goroutine-friendly, but requiring careful lifecycle management - a subscriber goroutine that is never unsubscribed leaks). Picking the wrong form for your lifecycle requirements is the most common Observer mistake in Go.

The pattern's core guarantee: when the subject's state changes, it doesn't know or care who reacts. Registered observers are notified; the subject imports nothing from observer packages. This is the [Open/Closed Principle](/go/philosophy/solid) applied to event notification - you add new reactions without touching the thing that changed.

## Problem

You're building a config loader. When the config reloads, the logger needs to update its log level, the HTTP server needs to update its timeout, and a metrics counter needs to increment. Hardcoding all three reactions inside the reload function means every new listener requires modifying core config logic.

```go
// coupled.go
package config

func (c *Config) Reload() {
    c.load()
    // Direct coupling to every listener
    logger.SetLevel(c.LogLevel)
    server.SetTimeout(c.Timeout)
    metrics.Inc("config.reload")
    // Adding a new listener? Edit this function.
}
```

The config type directly calls every subsystem that cares about changes. Adding a new listener requires modifying `Reload`. The config package imports logger, server, and metrics packages - a dependency tangle.

## Solution

Define an `Observer` interface and let the subject maintain a list of observers. When state changes, iterate the list and notify each one.

```
┌─────────────────┐
│   Config        │
│─────────────────│
│ Subscribe(obs)  │
│ Unsubscribe(obs)│
│ notify()        │
│ observers []Obs │
└────────┬────────┘
         │ notifies
   ┌─────┼──────┐
   │     │      │
Logger  Server  Metrics
```

```go
package main

import "fmt"

type Config struct {
	LogLevel  string
	Timeout   int
	observers []Observer
}

type Observer interface {
	OnConfigChange(cfg Config)
}

func (c *Config) Subscribe(obs Observer) {
	c.observers = append(c.observers, obs)
}

func (c *Config) Unsubscribe(obs Observer) {
	for i, o := range c.observers {
		if o == obs {
			c.observers = append(c.observers[:i], c.observers[i+1:]...)
			return
		}
	}
}

func (c *Config) notify() {
	for _, obs := range c.observers {
		obs.OnConfigChange(*c)
	}
}

func (c *Config) Reload(logLevel string, timeout int) {
	c.LogLevel = logLevel
	c.Timeout = timeout
	fmt.Printf("Config reloaded: level=%s timeout=%d\n", c.LogLevel, c.Timeout)
	c.notify()
}

type LoggerObserver struct{ name string }

func (l *LoggerObserver) OnConfigChange(cfg Config) {
	fmt.Printf("  [logger] log level set to %s\n", cfg.LogLevel)
}

type ServerObserver struct{ name string }

func (s *ServerObserver) OnConfigChange(cfg Config) {
	fmt.Printf("  [server] timeout set to %ds\n", cfg.Timeout)
}

func main() {
	cfg := &Config{}

	log := &LoggerObserver{name: "logger"}
	srv := &ServerObserver{name: "server"}

	cfg.Subscribe(log)
	cfg.Subscribe(srv)

	cfg.Reload("info", 30)
	cfg.Reload("debug", 10)

	cfg.Unsubscribe(srv)
	cfg.Reload("warn", 30)
}
```

Output:

```
Config reloaded: level=info timeout=30
  [logger] log level set to info
  [server] timeout set to 30s
Config reloaded: level=debug timeout=10
  [logger] log level set to debug
  [server] timeout set to 10s
Config reloaded: level=warn timeout=30
  [logger] log level set to warn
```

## Async Notification

The synchronous `notify()` blocks the subject until every observer completes. When observers do I/O - sending emails, writing metrics - the subject pays for every observer's latency. The async alternative dispatches each observer in its own goroutine:

```go
// async notify - subject returns immediately; observers run in the background.
func (c *Config) notifyAsync() {
    for _, obs := range c.observers {
        go obs.OnConfigChange(*c)
    }
}
```

Tradeoff: observers may process out of order, and panics in observer goroutines are unrecovered unless you add `recover()`. Errors are silently lost unless the observer has its own error channel.

For tighter goroutine lifecycle control, use channel-based observers instead of an interface. The subject sends on a buffered channel; the observer owns a reader goroutine that exits when the channel is closed:

```go
// Channel-based observer - goroutine lifecycle is explicit.
type ConfigWatcher struct {
    ch chan Config
}

func NewConfigWatcher(c *Config, bufSize int) *ConfigWatcher {
    w := &ConfigWatcher{ch: make(chan Config, bufSize)}
    c.Subscribe(w)
    return w
}

func (w *ConfigWatcher) OnConfigChange(cfg Config) {
    select {
    case w.ch <- cfg:
    default:
        // drop if the reader hasn't kept up
    }
}

func (w *ConfigWatcher) Run(ctx context.Context, handler func(Config)) {
    for {
        select {
        case cfg := <-w.ch:
            handler(cfg)
        case <-ctx.Done():
            return
        }
    }
}
```

The reader goroutine exits when `ctx` is cancelled, preventing leaks. The buffered channel absorbs bursts; the `default` case in `OnConfigChange` prevents a slow reader from blocking the subject.

## When to Use

- Multiple independent components need to react to changes in another component.
- You want to add new reactions without modifying the thing that changes.
- The set of listeners is dynamic - subscribers come and go at runtime.

## When Not to Use

- You have exactly one listener and it won't change. A direct function call is simpler.
- Notification ordering matters - Observer doesn't guarantee order.
- The observer needs to send data back to the subject - this creates circular dependencies.

## Tradeoffs

The decoupling is genuine: the config package never imports the logger or server packages, which keeps the dependency graph clean. What you lose is traceability - "who's listening to this config?" is invisible from the source code, and a missing `Unsubscribe` call on a long-lived observer is a memory leak. In concurrent programs, the observer list needs a `sync.RWMutex`: reads during `notify` race with writes during `Subscribe`/`Unsubscribe`, and this is exactly the kind of bug that only surfaces under load. The channel-based form avoids the mutex but introduces goroutine lifecycle responsibility - a subscriber goroutine that never exits leaks permanently if the subject is long-lived. The async goroutine form (one `go` per notification) decouples observer latency from the subject - a slow email send no longer delays a metrics update - but removes ordering guarantees: if two notifications fire in quick succession, faster observers may process the second before the first. Channel-based observers restore ordering within each observer (events arrive in send order) while still keeping the subject non-blocking; the trade-off is that a slow reader can fall behind, requiring a decision between buffering (absorb bursts) and dropping (protect the subject) when the buffer fills.

## Related Patterns

- **Mediator** - Mediator is better when several peers need to coordinate bidirectionally (each can send and receive through the hub); prefer Observer when you need one broadcaster and many independent listeners that don't communicate back.
- **Command** - Use Command alongside Observer when you need to queue, log, or make event notifications undoable - the Command wraps the notification payload; the Observer dispatches it.
