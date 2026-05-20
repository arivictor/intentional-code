---
title: "Bridge"
category: structural
intent: "Split a large type into two separate hierarchies — abstraction and implementation — that can vary independently."
idiomSummary: "Split abstraction and implementation into two interfaces composed by struct fields."
relatedSlugs: ["adapter", "strategy"]
tags: [interfaces, composition, dependency-inversion]
---

# Bridge

Bridge's identifying signal is a type hierarchy growing in two independent directions at once. Left unchecked, this produces a cartesian explosion: 3 channels × 3 urgency levels = 9 types; add a channel and you add 3 types; add an urgency level and you add 3 more. Bridge collapses this to 3 + 3 = 6 by splitting the two dimensions into two interfaces that compose via struct field, not inheritance.

The key question before reaching for Bridge: are these two dimensions truly independent? If they always change together, Bridge adds interfaces for no gain. If adding to one dimension never requires touching the other, Bridge is the right structure.

## Problem

You're building a notification system that sends messages through different channels (email, SMS, push) with different urgency levels (regular, urgent). Without Bridge, you'd need `RegularEmail`, `UrgentEmail`, `RegularSMS`, `UrgentSMS`, `RegularPush`, `UrgentPush` — six types, growing quadratically.

```go
// explosion.go
package notify

// Without Bridge: one type per (urgency × channel) combination.
// Adding a new channel means adding one type per urgency level.
// Adding a new urgency level means adding one type per channel.
// 3 channels × 3 urgency levels = 9 types.

type RegularEmailNotification struct{}
func (n *RegularEmailNotification) Send(msg string) { /* ... */ }

type UrgentEmailNotification struct{}
func (n *UrgentEmailNotification) Send(msg string) { /* prefix [URGENT], send email */ }

type RegularSMSNotification struct{}
func (n *RegularSMSNotification) Send(msg string) { /* ... */ }

type UrgentSMSNotification struct{}
func (n *UrgentSMSNotification) Send(msg string) { /* prefix [URGENT], send SMS */ }

// ... and so on. Adding "push" means 3 more types.
```

Every combination of two independent dimensions produces a new type. This is a cartesian product that grows unmanageable. Worse, the urgency logic (how to format the message) is duplicated across every channel-specific type.

## Solution

Separate the two dimensions into two interfaces. The abstraction (urgency formatter) holds a reference to the implementation (delivery channel). They vary independently.

```
┌────────────────────┐         ┌──────────────────┐
│   <<interface>>    │         │  <<interface>>   │
│   MessageSender    │         │   Channel        │
│────────────────────│         │──────────────────│
│ Send(msg)          │────────►│ Deliver(msg)     │
└────────┬───────────┘  uses   └────────┬─────────┘
         │                              │
   ┌─────┼──────┐               ┌───────┼──────┐
   │            │               │              │
Regular     Urgent           Email          SMS
Sender      Sender          Channel        Channel
```

Define the implementation interface — the delivery channel:

```go
// channels.go
package notify

import "fmt"

// Channel is the implementation dimension — how messages are delivered.
type Channel interface {
    Deliver(message string) error
}

type EmailChannel struct{ Addr string }

func (e *EmailChannel) Deliver(message string) error {
    fmt.Printf("[Email → %s] %s\n", e.Addr, message)
    return nil
}

type SMSChannel struct{ Phone string }

func (s *SMSChannel) Deliver(message string) error {
    fmt.Printf("[SMS → %s] %s\n", s.Phone, message)
    return nil
}
```

Define the abstraction — message senders with different urgency handling:

```go
// senders.go
package notify

import "fmt"

// Sender is the abstraction dimension — how messages are formatted.
type Sender struct {
    channel Channel
}

type RegularSender struct{ Sender }

func NewRegularSender(ch Channel) *RegularSender {
    return &RegularSender{Sender{channel: ch}}
}

func (s *RegularSender) Send(msg string) error {
    return s.channel.Deliver(msg)
}

type UrgentSender struct{ Sender }

func NewUrgentSender(ch Channel) *UrgentSender {
    return &UrgentSender{Sender{channel: ch}}
}

func (s *UrgentSender) Send(msg string) error {
    return s.channel.Deliver(fmt.Sprintf("🚨 URGENT: %s", msg))
}
```

```go
// main.go
package main

import "notify"

func main() {
    email := &notify.EmailChannel{Addr: "ops@example.com"}
    sms := &notify.SMSChannel{Phone: "+1-555-0123"}

    // Mix and match freely — no combinatorial explosion
    notify.NewRegularSender(email).Send("Deployment complete")
    notify.NewUrgentSender(email).Send("Server on fire")
    notify.NewRegularSender(sms).Send("Daily report ready")
    notify.NewUrgentSender(sms).Send("Database unreachable")
}
```

Output:

```
[Email → ops@example.com] Deployment complete
[Email → ops@example.com] 🚨 URGENT: Server on fire
[SMS → +1-555-0123] Daily report ready
[SMS → +1-555-0123] 🚨 URGENT: Database unreachable
```

## When to Use

- You have two or more independent dimensions of variation that would otherwise create a type explosion.
- You want to change the implementation at runtime (swap email for SMS).
- The abstraction and implementation should be able to evolve independently.

## When Not to Use

- You only have one dimension of variation. Use a simple interface instead.
- The two dimensions are tightly coupled and always change together — separation adds complexity without benefit.
- Your type hierarchy is small and unlikely to grow. Two or three concrete types are fine.

## Advantages

- Eliminates combinatorial type explosion — N + M instead of N × M.
- Abstraction and implementation evolve independently.
- You can swap implementations at runtime.

## Disadvantages

- Adds structural complexity — more interfaces and types to understand.
- Can be overkill for simple hierarchies that don't face a real explosion.
- The abstraction/implementation split can be hard to identify correctly upfront.

## Related Patterns

- **Adapter** — Adapter fixes an existing mismatch between two interfaces after the fact; Bridge designs the separation upfront so two dimensions can evolve independently without ever creating the mismatch.
- **Strategy** — Strategy varies one algorithm pluggably via an interface; Bridge varies two dimensions simultaneously — if you only have one dimension of variation, Strategy is simpler and clearer.
