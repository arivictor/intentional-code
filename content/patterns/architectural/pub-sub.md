---
title: "Publish/Subscribe"
description: "Decouple senders from receivers through named topics: publishers send messages to a topic without knowing who listens, and any number of subscribers receive their own copy — broker-backed fan-out, distinct from in-process event handling."
---

# Publish/Subscribe

Publish/Subscribe (pub/sub) is messaging organised around **topics**. A publisher sends a message to a named topic and is done; it does not know, and does not care, how many subscribers exist or who they are. Every subscriber to that topic receives its own copy of the message. This is the defining difference from a point-to-point queue (where each message goes to exactly one consumer) and from a direct call (where the sender knows the receiver): pub/sub is **one-to-many fan-out across a named channel**.

It's worth distinguishing this page from two neighbours. From [Event-Driven Architecture](/go/patterns/architectural/event-driven): Event-Driven is the system-level *style* — designing around facts that have happened — while Pub/Sub is the concrete *messaging mechanism* (topics, subscriptions, and brokers) such systems are usually built on. And from [Observer](/go/patterns/behavioral/observer): Observer is the *in-process* answer to one-to-many notification, doing it with direct method calls inside a single program. Pub/Sub is what you reach for when that one-to-many fan-out has to cross process boundaries — and that means a broker-backed system (NATS, Kafka, Redis, Google Pub/Sub) for delivery, durability, and surviving restarts. The in-process example below exists only to make the topic mechanics visible; in real single-process code you'd use Observer, not a hand-rolled broker.

## Scenario

When a user signs up, several unrelated things must happen: send a welcome email, kick off analytics, provision a workspace. Wiring the signup handler to call each one directly couples it to every consumer, and adding a new reaction means editing the handler.

```go
// The signup handler knows about — and must not fail because of — every consumer.
func (h *SignupHandler) Handle(ctx context.Context, u User) error {
    if err := h.emailer.SendWelcome(ctx, u); err != nil {
        return err // a flaky email service now blocks signup
    }
    h.analytics.Track(ctx, "signup", u.ID)
    h.provisioner.CreateWorkspace(ctx, u.ID)
    // Add a fourth reaction? Edit this function again.
    return nil
}
```

## Solution

The handler publishes one message to a `user.signup` topic. Each interested party subscribes independently. Publisher and subscribers know only the topic name and the message schema.

```text:title="diagram"
                    topic: "user.signup"
   publisher ─────────────►┌───────────┐────────► subscriber A (email)
   (signup handler)        │  broker   │────────► subscriber B (analytics)
                           └───────────┘────────► subscriber C (provisioning)
                       each subscriber gets its own copy
```

The example below builds a tiny in-process broker to make the topic-and-fan-out shape concrete. **It's a teaching aid, not production code** — if your publisher and subscribers live in the same process, you don't want a hand-rolled broker at all, you want the [Observer](/go/patterns/behavioral/observer) pattern, which does in-process notification directly and with less machinery. The reason to reach for pub/sub *proper* is the broker: durability, back-pressure, and crossing process boundaries (covered after the example). Read the code for the mental model, then use a real broker.

```go:title="main.go":run=true:editable=true
package main

import (
	"fmt"
	"sort"
	"sync"
)

// Broker is an in-process, topic-based pub/sub hub. Publishers send to a topic
// without knowing who subscribes; each subscriber gets its own channel and
// receives every message published to topics it subscribes to (fan-out).
type Broker struct {
	mu   sync.RWMutex
	subs map[string][]chan string
}

func NewBroker() *Broker {
	return &Broker{subs: map[string][]chan string{}}
}

func (b *Broker) Subscribe(topic string) <-chan string {
	b.mu.Lock()
	defer b.mu.Unlock()
	ch := make(chan string, 8)
	b.subs[topic] = append(b.subs[topic], ch)
	return ch
}

func (b *Broker) Publish(topic, msg string) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, ch := range b.subs[topic] {
		ch <- msg // buffered; a real broker handles slow/absent consumers
	}
}

func (b *Broker) Close() {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, chans := range b.subs {
		for _, ch := range chans {
			close(ch)
		}
	}
}

func main() {
	broker := NewBroker()

	// Two independent subscribers to the same topic. Both see every message.
	emailFeed := broker.Subscribe("user.signup")
	analyticsFeed := broker.Subscribe("user.signup")

	var wg sync.WaitGroup
	var mu sync.Mutex
	var log []string

	consume := func(name string, feed <-chan string) {
		defer wg.Done()
		for msg := range feed {
			mu.Lock()
			log = append(log, fmt.Sprintf("%s handled %q", name, msg))
			mu.Unlock()
		}
	}

	wg.Add(2)
	go consume("email", emailFeed)
	go consume("analytics", analyticsFeed)

	broker.Publish("user.signup", "alice")
	broker.Publish("user.signup", "bob")
	broker.Close() // closing channels lets the consumers' range loops finish
	wg.Wait()

	sort.Strings(log) // stable output regardless of goroutine scheduling
	for _, line := range log {
		fmt.Println(line)
	}
}
```

```
// Output:
// analytics handled "alice"
// analytics handled "bob"
// email handled "alice"
// email handled "bob"
```

That in-process broker is deliberately naive: it loses every message on restart, can't reach another service, and silently drops to a buffer when a consumer stalls. Don't ship it. The moment pub/sub earns its keep, you want a real broker-backed system that handles delivery, durability, and back-pressure for you. With NATS, for example, the topic-and-subscribe shape is identical, but messages cross the network and survive process boundaries:

```go
// using github.com/nats-io/nats.go
nc, _ := nats.Connect(nats.DefaultURL)
defer nc.Close()

// Subscriber: every subscriber on this subject gets its own copy.
nc.Subscribe("user.signup", func(m *nats.Msg) {
    log.Printf("welcome email for %s", string(m.Data))
})

// Publisher: fire-and-forget to the subject.
nc.Publish("user.signup", []byte("alice"))
```

A key broker decision is **fan-out vs. load-balancing**. Plain pub/sub gives every subscriber a copy (the email *and* analytics services both react). When you instead want a *group* of identical workers to share the load — each message handled once by the group — you use a queue group / consumer group, which is the [Competing Consumers](/go/patterns/concurrency/competing-consumers) pattern layered on top of a topic. Most brokers support both per topic.

## When to Use

- One event has multiple independent reactions, and you want to add or remove reactions without touching the publisher.
- Producers and consumers are (or will become) separate processes or services that shouldn't call each other directly.
- You want temporal decoupling: the publisher proceeds immediately, and consumers process at their own pace.
- You need durable, replayable, or persistent message streams (with a broker like Kafka or NATS JetStream).

## When Not to Use

- The caller needs a response. Pub/sub is fire-and-forget; request/response wants an RPC, HTTP call, or a reply-topic correlation dance that's often not worth it.
- Everything lives in one process. If you just need multiple in-process listeners to react to a change, use [Observer](/go/patterns/behavioral/observer) — it's direct method-call notification with no broker to stand up. Pub/sub is the answer once you actually cross a process boundary.
- There's exactly one consumer and one producer — a direct function call is simpler and easier to follow.
- You need strong ordering and transactional coupling with the producer's database write; combine with a [Transactional Outbox](/go/patterns/architectural/outbox) rather than publishing naively.
- The added broker is operational weight your problem doesn't justify yet. If you don't cross a process boundary, you don't need pub/sub's broker — reach for [Observer](/go/patterns/behavioral/observer) instead, and adopt a broker when the boundary actually appears.

## Tradeoffs

Pub/sub buys decoupling and scalability at the cost of **observability and reasoning**. With direct calls you can read the code and see what happens next; with pub/sub the flow is implicit — to know who reacts to `user.signup` you must know who subscribes. Distributed tracing and a documented topic/schema catalog become essential, not optional.

Delivery semantics are the other sharp edge. In-process channel delivery can drop messages if a buffer fills or the process dies; broker delivery is typically at-least-once, so consumers must be idempotent. And a slow subscriber can apply back-pressure to the whole topic unless the broker buffers, drops, or isolates it — decide that policy deliberately.

Finally, the schema *is* the contract. Because publisher and subscriber never call each other, the message format is the only coupling left, and changing it carelessly breaks consumers silently. Version your message schemas and evolve them additively.

## Related Patterns

- **Event-Driven Architecture:** The system-level style; pub/sub is the messaging mechanism it's usually implemented with. Event-Driven answers *why* (decouple via facts); pub/sub answers *how* (topics and subscriptions).
- **Competing Consumers:** The complementary delivery mode. Pub/sub fans a message out to *every* subscriber; competing consumers share messages across a *group* so each is handled once. Brokers offer both via consumer/queue groups.
- **Observer:** The in-process counterpart, and the right tool whenever your listeners share a process. Observer notifies registered objects directly via method calls — no broker, no topics. Pub/sub is what Observer becomes once notification must cross process boundaries: the broker replaces the direct references, and named topics replace the observer list. Don't hand-roll an in-process broker; if you're not crossing a boundary, you want Observer.
- **Transactional Outbox:** Solves reliable *publishing* into a pub/sub topic, closing the dual-write gap between the producer's database and the broker.
- **Fan-out / Fan-in:** The concurrency primitive behind in-process fan-out; pub/sub is the messaging-level expression of the same one-to-many shape.
