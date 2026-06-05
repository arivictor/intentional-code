---
title: "Microkernel (Plugin)"
description: "Keep a minimal core that provides only essential mechanism, and push every feature into independent plugins that register against a stable extension contract — so the system grows by adding plugins, not by editing the core."
---

# Microkernel (Plugin)

The Microkernel pattern (also called the Plugin architecture) splits a system into two parts: a small, stable **core** that provides only the essential mechanism, and a set of **plugins** that supply the actual features. The core knows nothing about any specific feature; it knows only a plugin *contract* (an interface) and how to discover, register, and dispatch to whatever plugins are present. New capabilities arrive as new plugins. The core never changes to accommodate them.

This is the architecture behind editors (VS Code), browsers (extensions), CI systems, and Go tooling that loads drivers or processors at runtime. The payoff is the **Open/Closed Principle** at system scale: open for extension (add a plugin), closed for modification (don't touch the core).

## Scenario

A payment-processing pipeline applies a growing list of steps: fraud checks, surcharges, loyalty points, currency conversion. Implemented as a hard-coded sequence, every new rule means editing the same central function, which becomes a tangle of unrelated concerns and a magnet for merge conflicts.

```go
// The core keeps growing and accumulating knowledge of every feature.
func Process(e PaymentEvent) PaymentEvent {
    // fraud
    if e.Amount > 100000 {
        e.Tags = append(e.Tags, "review")
    }
    // surcharge
    e.Amount += e.Amount * 3 / 100
    // loyalty... currency... — every new rule edits THIS function
    return e
}
```

## Solution

Define a `Plugin` contract. The core holds a registry and runs each registered plugin in turn, knowing nothing about what any of them actually does. Features become self-contained types you register at startup.

```text:title="diagram"
            ┌──────────────────────────────┐
            │           Core / Kernel      │
   input ──►│  for p in registry: p.Run()  │──► output
            └──────────────┬───────────────┘
                           │ depends only on Plugin interface
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐        ┌──────────┐       ┌──────────┐
   │ Fraud   │        │ Surcharge│       │ Loyalty  │   ← add a plugin,
   │ plugin  │        │ plugin   │       │ plugin   │     don't edit core
   └─────────┘        └──────────┘       └──────────┘
```

```go:title="main.go":run=true
package main

import (
	"fmt"
	"sort"
	"strings"
)

// --- The microkernel: a minimal core that knows nothing about concrete
// features. It only knows the Plugin contract and how to dispatch to plugins
// registered against it. ---

// Plugin is the extension contract. The core depends on this interface only.
type Plugin interface {
	Name() string
	// Transform processes a payment event and returns a (possibly) modified one.
	Transform(event PaymentEvent) PaymentEvent
}

type PaymentEvent struct {
	Amount int      // in cents
	Tags   []string // annotations added by plugins
}

// Kernel is the core. It holds a registry and runs every plugin in order.
type Kernel struct {
	plugins []Plugin
}

func (k *Kernel) Register(p Plugin) {
	k.plugins = append(k.plugins, p)
}

func (k *Kernel) Process(event PaymentEvent) PaymentEvent {
	for _, p := range k.plugins {
		event = p.Transform(event)
	}
	return event
}

// --- Plugins: each is a self-contained feature the core has no knowledge of. ---

type FraudCheck struct{}

func (FraudCheck) Name() string { return "fraud" }
func (FraudCheck) Transform(e PaymentEvent) PaymentEvent {
	if e.Amount > 100000 {
		e.Tags = append(e.Tags, "review")
	}
	return e
}

type Surcharge struct{ Percent int }

func (Surcharge) Name() string { return "surcharge" }
func (s Surcharge) Transform(e PaymentEvent) PaymentEvent {
	e.Amount += e.Amount * s.Percent / 100
	e.Tags = append(e.Tags, "surcharged")
	return e
}

func main() {
	// The core is assembled at startup from whatever plugins are registered.
	// Adding a feature means writing a new Plugin, not editing the kernel.
	kernel := &Kernel{}
	kernel.Register(FraudCheck{})
	kernel.Register(Surcharge{Percent: 3})

	out := kernel.Process(PaymentEvent{Amount: 200000})

	sort.Strings(out.Tags)
	fmt.Printf("amount: %d\n", out.Amount)
	fmt.Printf("tags:   %s\n", strings.Join(out.Tags, ", "))
}
```

```
// Output:
// amount: 206000
// tags:   review, surcharged
```

Go gives you three levels of "plugin", trading flexibility for operational simplicity:

- **Compile-time registration (above).** Plugins are ordinary types wired in at startup, often via an `init()`-based registry keyed by name. This is by far the most common and the most robust: one binary, full type safety, no runtime loading. It's how `database/sql` drivers and `image` decoders work.
- **`plugin` package (`.so` files).** Go's standard `plugin` package loads shared objects at runtime via `plugin.Open`. It's genuinely dynamic but fragile: Linux/macOS only, every plugin must be built with the *exact* same Go toolchain and dependency versions, and there's no unloading. Use sparingly.
- **Process isolation (HashiCorp `go-plugin`).** Plugins run as **separate processes** and communicate over gRPC. This is what Terraform and Vault use. A crashing or slow plugin can't take down the host, plugins can be written in other languages, and versioning is explicit — at the cost of an RPC hop per call.

```go
// using github.com/hashicorp/go-plugin — plugins are separate processes,
// so a misbehaving plugin can't crash the core.
plugin.Serve(&plugin.ServeConfig{
    HandshakeConfig: handshake,
    Plugins:         map[string]plugin.Plugin{"processor": &ProcessorPlugin{}},
    GRPCServer:      plugin.DefaultGRPCServer,
})
```

## When to Use

- The system has a stable core but an open-ended, growing set of features that vary by customer, deployment, or release.
- You want third parties (or other teams) to extend the product without modifying or recompiling the core.
- Features are largely independent and conform to a common contract (processors, validators, exporters, codecs).
- You want to enable/disable capabilities per deployment by registering a different plugin set.

## When Not to Use

- The set of features is small and fixed. The registry and interface are overhead for what a simple sequence of calls expresses more clearly.
- Plugins are deeply interdependent and must share rich internal state. The clean contract a microkernel relies on breaks down, and you get a distributed ball of mud.
- You need runtime `.so` loading but can't accept the `plugin` package's toolchain-lockstep and platform constraints — prefer process-based plugins or compile-time registration.
- The "core" would end up containing most of the real logic anyway. If the plugins are trivial, you don't have a microkernel; you have indirection.

## Tradeoffs

The microkernel's power is also its hazard: the **contract is everything**. A well-designed plugin interface lets the system grow for years without core changes; a poorly designed one forces a breaking change to every plugin the moment a new feature needs data the interface doesn't expose. Invest in the contract, and version it.

Indirection has a cost in **discoverability**. With a hard-coded sequence you can read top-to-bottom what happens; with a plugin registry the behaviour is the sum of whatever happened to register, which is harder to trace and debug. Good registration logging and an inspectable plugin list help.

Then there's the **isolation spectrum**. Compile-time plugins are simplest and safest but require a rebuild to change the feature set. Runtime/process plugins give true dynamism and fault isolation but add loading, versioning, and (for `go-plugin`) IPC complexity. Most Go systems should default to compile-time registration and only climb the ladder when dynamic loading is a real requirement.

## Related Patterns

- **Strategy:** A plugin is essentially a Strategy selected and registered at the system level. Microkernel is Strategy scaled up from one swappable algorithm to an open registry of features.
- **Chain of Responsibility:** When plugins run in sequence and each may handle or pass along the work, the kernel's dispatch loop is a Chain of Responsibility over the registered plugins.
- **Pipe and Filter:** The transform-in-sequence kernel above is a pipeline whose filters are plugins; the two patterns overlap when each plugin is a pure data transformation.
- **Dependency Inversion (SOLID):** The core depends on the plugin abstraction, and plugins depend on it too — the inversion that lets the core stay closed while the system stays open.
- **Modular Monolith:** Both keep a system extensible via boundaries; a modular monolith partitions one codebase into modules, while a microkernel partitions it into a core plus pluggable features.
