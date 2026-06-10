---
title: "Strategy"
description: "Define a family of algorithms, encapsulate each one, and make them interchangeable at runtime."
---

# Strategy

**Buys runtime-interchangeable algorithms at near-zero cost via function types; pays because the selection switch doesn't vanish — it relocates to the caller.**

Strategy defines a family of algorithms and makes them interchangeable. In Go, the most idiomatic form is a function type: pass a function value rather than creating an interface with a single method. Use the interface form when the strategy has multiple methods or carries state.

This is the [Open/Closed Principle](/go/philosophy/keep-changes-local#solid) applied to algorithms. The context is open to new behaviours without modifying existing code. It's also one of the patterns that becomes nearly invisible in Go. When someone passes a `func` to a constructor or a `sort.Slice` call, they're using Strategy without naming it.

## Scenario

You need to send notifications through different channels. The current approach switches on a channel name inside the sending function. Every new channel means editing that function, and you can't test one channel's logic without compiling in all the others.

```go
func Notify(channel, msg string) error {
    switch channel {
    case "email":
        return sendEmail(msg)
    case "sms":
        return sendSMS(msg)
    case "slack":
        return sendSlack(msg)
    default:
        return fmt.Errorf("unknown channel: %s", channel)
    }
}
```

The switch is stringly typed. Adding a new channel means modifying `Notify`. Testing email logic requires the SMS and Slack code to compile too.

## Solution

Pull the "how to send" out of `Notify` and pass it in as a value. In Go, the simplest form is a function type.

```
type NotifyFunc func(msg string) error

Notify(msg, Email)   ──► func(string) error
Notify(msg, SMS)     ──► func(string) error
Notify(msg, Console) ──► func(string) error
```

The function-type approach, idiomatic Go. Run it to send the same kind of message through three interchangeable strategies:

```go:title="func_strategy.go":run=true:editable=true
package main

import "fmt"

type NotifyFunc func(msg string) error

func Email(msg string) error {
	fmt.Println("email:", msg)
	return nil
}

func SMS(msg string) error {
	fmt.Println("sms:", msg)
	return nil
}

func Console(msg string) error {
	fmt.Println(msg)
	return nil
}

func Notify(msg string, send NotifyFunc) error {
	return send(msg)
}

func main() {
	Notify("server started", Console)
	Notify("order placed", Email)
	Notify("login alert", SMS)
}
```

When a strategy needs configuration or multiple methods, use an interface instead. Run this version to see two configured notifiers handle the same event:

```go:title="interface_strategy.go":run=true:editable=true
package main

import "fmt"

type Notifier interface {
	Send(msg string) error
}

type EmailNotifier struct {
	From string
	To   string
}

func (n *EmailNotifier) Send(msg string) error {
	fmt.Printf("[email] %s → %s: %s\n", n.From, n.To, msg)
	return nil
}

type SlackNotifier struct {
	Channel string
}

func (n *SlackNotifier) Send(msg string) error {
	fmt.Printf("[slack] #%s: %s\n", n.Channel, msg)
	return nil
}

func main() {
	email := &EmailNotifier{From: "ops@example.com", To: "team@example.com"}
	slack := &SlackNotifier{Channel: "alerts"}

	email.Send("deploy complete")
	slack.Send("deploy complete")
}
```

> In Go, a function type IS a strategy. `sort.Slice(data, func(i, j int) bool { ... })` is Strategy. You don't need an interface for single-method strategies; a `func` type is simpler and more idiomatic.

## When to Use

- You see a switch or if/else selecting an algorithm based on a type or configuration.
- The algorithm should be interchangeable at runtime.
- You want to test business logic independently of the algorithm choice.
- In Go: if the strategy is a single function, use a function type. If it has state or multiple methods, use an interface.

## When Not to Use

- There's only one algorithm and no expectation of alternatives. Just call the function directly.
- The algorithms are trivially different. Abstracting them adds ceremony without value.

## The Decision

The function-type form costs almost nothing in Go. Passing a `func` is idiomatic and adds no boilerplate. The interface form adds a little more structure but buys you config state and the ability to introspect the strategy (for example, a `Name()` method for logging).

The cost that never goes away is that the switch doesn't disappear; it moves to the caller. If every call site does `if userType == "premium" { send = PremiumNotifier{} }`, you've relocated the problem rather than solved it. Centralise strategy selection in a factory or constructor, not scattered across call sites.

That near-zero cost is the point: a function value *is* the whole pattern, so [the abstraction you borrow is almost free](/go/philosophy/borrowed-abstraction). The only debt is where the selection switch lives — keep it in one place and Strategy stays cheap.

## Related Patterns

- **Bridge**: Strategy varies one interchangeable algorithm; Bridge separates two independent dimensions of variation simultaneously. If you have two axes (abstraction + implementation), use Bridge. If you have one (algorithm selection), use Strategy.
- **State**: Both swap behaviour at runtime. The distinction is who controls the swap: Strategy is chosen and set by an external caller; State transitions internally in response to events.
- **Template Method**: Template Method holds the algorithm skeleton fixed and plugs in one or two steps; Strategy replaces the whole algorithm. Prefer Template Method when the structure matters, Strategy when it doesn't.
- **Command**: Both encapsulate behaviour as a value; Command adds undo and queuing on top. If you need those capabilities, use Command. If you only need interchangeability, Strategy is simpler.
