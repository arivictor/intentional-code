# Factory Method

Factory Method lets you produce objects without specifying their exact type. In Go, this means a constructor function that returns an interface type, so the caller works with the interface and doesn't know — or care — which concrete struct it got back.

This is one of the most natural patterns in Go. Unlike languages that need an abstract class with an overridable factory method, Go just uses a plain function that returns an interface. The "factory" is the function itself.

## Problem

You're building a notification system. Initially you only send emails, so you hardcode an email sender. Then you need SMS. Then Slack. Every new channel means editing the same function, retesting everything, and risking breakage in channels that were already working.

```go
// notify.go
package notify

import "fmt"

func Send(channel, recipient, message string) error {
    switch channel {
    case "email":
        fmt.Printf("Sending email to %s: %s\n", recipient, message)
        return nil
    case "sms":
        fmt.Printf("Sending SMS to %s: %s\n", recipient, message)
        return nil
    // Every new channel: add a case, redeploy, re-test everything.
    default:
        return fmt.Errorf("unsupported channel: %s", channel)
    }
}
```

This switch statement is a magnet for change. Every new notification channel requires modifying this function. You can't add channels from outside the package. Testing one channel means loading the code for all of them. And the string-based channel selection has no compile-time safety.

## Solution

Define a `Notifier` interface with a single method. Each channel implements it independently. A constructor function selects the right implementation and returns the interface. The caller never sees the concrete types.

```
┌─────────────────────────┐
│     <<interface>>       │
│       Notifier          │
│─────────────────────────│
│ + Notify(to, msg) error │
└────────────┬────────────┘
             │ implements
     ┌───────┼────────┐
     │       │        │
┌────▼──┐ ┌──▼───┐ ┌──▼────┐
│ Email │ │ SMS  │ │ Slack │
│Notif. │ │Notif.│ │Notif. │
└───────┘ └──────┘ └───────┘

NewNotifier(channel) ──► Notifier
```

First, define the interface. Keep it small — one method is ideal.

```go
// notifier.go
package notify

// Notifier sends a notification to a recipient.
type Notifier interface {
    Notify(recipient, message string) error
}
```

Each channel is its own struct satisfying the interface. They can live in separate files or even separate packages.

```go
// channels.go
package notify

import "fmt"

type EmailNotifier struct {
    SMTPAddr string
}

func (e *EmailNotifier) Notify(recipient, message string) error {
    fmt.Printf("[email] to=%s via=%s msg=%s\n", recipient, e.SMTPAddr, message)
    return nil
}

type SMSNotifier struct {
    APIKey string
}

func (s *SMSNotifier) Notify(recipient, message string) error {
    fmt.Printf("[sms] to=%s msg=%s\n", recipient, message)
    return nil
}

type SlackNotifier struct {
    WebhookURL string
}

func (sl *SlackNotifier) Notify(recipient, message string) error {
    fmt.Printf("[slack] channel=%s msg=%s\n", recipient, message)
    return nil
}
```

Now the factory: a constructor function that returns the interface. Using a map of constructors is cleaner than a switch — and it's extensible at runtime.

```go
// factory.go
package notify

import "fmt"

// constructor is a function that creates a Notifier.
type constructor func() Notifier

// registry maps channel names to their constructors.
var registry = map[string]constructor{
    "email": func() Notifier { return &EmailNotifier{SMTPAddr: "smtp.example.com:587"} },
    "sms":   func() Notifier { return &SMSNotifier{APIKey: "key-123"} },
    "slack": func() Notifier { return &SlackNotifier{WebhookURL: "https://hooks.slack.com/xxx"} },
}

// Register adds a new channel at runtime.
func Register(name string, c constructor) {
    registry[name] = c
}

// NewNotifier returns a Notifier for the given channel.
func NewNotifier(channel string) (Notifier, error) {
    ctor, ok := registry[channel]
    if !ok {
        return nil, fmt.Errorf("unknown channel: %s", channel)
    }
    return ctor(), nil
}
```

```go
// main.go
package main

import (
    "fmt"
    "notify"
)

func main() {
    for _, ch := range []string{"email", "sms", "slack"} {
        n, err := notify.NewNotifier(ch)
        if err != nil {
            fmt.Println(err)
            continue
        }
        n.Notify("alice@example.com", "Your order shipped")
    }
}
```

Output:

```
[email] to=alice@example.com via=smtp.example.com:587 msg=Your order shipped
[sms] to=alice@example.com msg=Your order shipped
[slack] channel=alice@example.com msg=Your order shipped
```

## When to Use

- You see a growing switch or if/else chain selecting which type to create based on a runtime value.
- Different parts of your system need to create objects that share a common interface but differ in implementation.
- You want to let packages or plugins register new implementations without modifying core code.
- You need to decouple object creation from usage — the caller should work with the interface, not know the concrete type.

## When Not to Use

- You have only one or two implementations and no expectation of more. A plain constructor function (`NewEmailNotifier`) is simpler and more direct.
- The concrete type matters to the caller — they need access to type-specific methods beyond the interface. In that case, return the concrete type.
- The factory adds indirection without benefit. Don't add a factory "just in case" — add it when you feel the switch-statement pain.

## Advantages

- New implementations require zero changes to existing code — just register a new constructor.
- Callers depend only on the interface, so they're easy to test with fakes.
- The map-of-constructors approach is extensible at runtime (plugins, configuration).
- Each implementation is isolated — changes to email don't risk breaking SMS.

## Disadvantages

- Adds indirection — you have to look up the registry to find the concrete type.
- Runtime errors (unknown channel) instead of compile-time errors for unregistered types.
- For small, stable sets of types, a simple switch or direct construction is clearer.
- The registry is package-level mutable state, which can complicate testing if not managed carefully.

## Related Patterns

- **Abstract Factory** — Groups related factory methods into a family-creating interface.
- **Builder** — Also about object creation, but focuses on step-by-step construction rather than type selection.
- **Prototype** — Creates objects by cloning rather than by calling constructors.
