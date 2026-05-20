---
title: "Factory Method"
category: creational
intent: "Define an interface for creating an object, but let the calling code decide which concrete type to instantiate via constructor functions returning an interface."
idiomSummary: "A callable, classmethod, or small factory object that hides concrete class selection."
relatedSlugs: ["abstract-factory", "builder", "prototype"]
tags: [interfaces, dependency-inversion, testability]
isFeatured: true
---

# Factory Method

In class-based languages, Factory Method is an abstract class with an overridable creation method. In Python, it's a function that returns an interface — the entire pattern reduces to that. The "factory" is the constructor; the "method" is its return type.

The pattern earns its keep when you find yourself extending a switch statement every time you add a new type. That switch is a signal: move the selection logic into one place, hide it behind a constructor, and let new implementations register without touching existing code. This is the [Open/Closed Principle](/python/philosophy/solid) in practice — open for extension, closed for modification.

## Problem

You're building a notification system. Initially you only send emails, so you hardcode an email sender. Then you need SMS. Then Slack. Every new channel means editing the same function, retesting everything, and risking breakage in channels that were already working.

```python
# notify.py


def send(channel, recipient, message):
    match channel:
    case "email":
        fmt.Printf("Sending email to %s: %s\n", recipient, message)
        return None
    case "sms":
        fmt.Printf("Sending SMS to %s: %s\n", recipient, message)
        return None
        # Every new channel: add a case, redeploy, re-test everything.
    case _:
        return fmt.Errorf("unsupported channel: %s", channel)
    pass
```

This switch statement is a magnet for change. Every new notification channel requires modifying this function. You can't add channels from outside the package. Testing one channel means loading the code for all of them. And the string-based channel selection has no structural safety.

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

```python
from typing import Protocol

# notifier.py

# Notifier sends a notification to a recipient.
class Notifier(Protocol):
    def notify(self, recipient, message): ...
```

Each channel is its own struct satisfying the interface. They can live in separate files or even separate packages.

```python
# channels.py


class EmailNotifier:
    smtp_addr: string

def notify(self, recipient, message):
    fmt.Printf("[email] to=%s via=%s msg=%s\n", recipient, e.SMTPAddr, message)
    return None

class SMSNotifier:
    api_key: string

def notify(self, recipient, message):
    fmt.Printf("[sms] to=%s msg=%s\n", recipient, message)
    return None

class SlackNotifier:
    webhook_url: string

def notify(self, recipient, message):
    fmt.Printf("[slack] channel=%s msg=%s\n", recipient, message)
    return None
```

Now the factory: a constructor function that returns the interface. Using a map of constructors is cleaner than a switch — and it's extensible at runtime.

```python
# factory.py


# constructor is a function that creates a Notifier.
type constructor func() Notifier

# registry maps channel names to their constructors.
registry = map[string]constructor{
"email": func() Notifier : return &EmailNotifier:SMTPAddr: "smtp.example.com:587"
"sms":   func() Notifier : return &SMSNotifier:APIKey: "key-123"
"slack": func() Notifier : return &SlackNotifier:WebhookURL: "https://hooks.slack.com/xxx"

# Register adds a new channel at runtime.
def register(name, c):
    registry[name] = c

# NewNotifier returns a Notifier for the given channel.
def new_notifier(channel):
    ctor, ok := registry[channel]
    if !ok :
        return None, fmt.Errorf("unknown channel: %s", channel)
    return ctor(), None
```

```python
# main.py

"fmt"
"notify"

def main():
    for ch in []string{"email", "sms", "slack"}:
        n, err := notify.NewNotifier(ch)
        if err is not None :
            print(err)
            continue
        n.Notify("alice@example.com", "Your order shipped")
    pass
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
- Runtime errors (unknown channel) instead of structural errors for unregistered types.
- For small, stable sets of types, a simple switch or direct construction is clearer.
- The registry is package-level mutable state, which can complicate testing if not managed carefully.

## Related Patterns

- **Abstract Factory** — Use Abstract Factory when you need to guarantee that multiple created types come from the same family and work together (e.g., a macOS button always paired with a macOS dialog); Factory Method is simpler when you only need to select one type.
- **Builder** — Use Builder when construction requires many optional parameters or a meaningful sequence of steps; Factory Method is for selecting *which* type to create, not for configuring a complex one.
- **Prototype** — Use Prototype when cloning an existing instance is cheaper or more convenient than calling a constructor; Factory Method when you want to encapsulate the constructor selection logic.
