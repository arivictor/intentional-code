---
title: "Competing Consumers"
description: "Run several consumers against one shared queue so each message is processed by exactly one of them — spreading load and scaling throughput, distinct from fan-out where every consumer gets a copy."
---

# Competing Consumers

Competing Consumers runs multiple consumers against a **single shared queue**, where each message is delivered to exactly one consumer. The consumers *compete* for work: whichever is free grabs the next message. Add consumers and throughput rises; lose one and the others pick up its share. In Go, the queue is a channel and the consumers are goroutines ranging over it — the runtime hands each value to exactly one waiting receiver.

The distinction that matters: this is **load distribution, not duplication**. It's the opposite of [Pub/Sub](/go/patterns/architectural/pub-sub) and [Fan-out](/go/patterns/concurrency/fan-out-fan-in), where *every* consumer receives a copy of *every* message. Here each message is handled once, by one consumer. If you've used a [Worker Pool](/go/patterns/concurrency/worker-pool), you've already used competing consumers in-process — this page names the pattern and extends it to consumers that may be separate processes draining a broker queue (SQS, a NATS queue group, a Kafka consumer group).

## Scenario

A single goroutine drains a queue of jobs one at a time. Each job takes 100ms of I/O, so the queue drains at ten jobs per second no matter how much hardware you have. Throughput is capped by one consumer's serial speed.

```go
// Single consumer — throughput bounded by one goroutine's pace.
func consume(jobs <-chan Job) {
    for job := range jobs {
        process(job) // 100ms each → max 10 jobs/sec, forever
    }
}
```

## Solution

Start several consumers on the same channel. Each ranges the shared queue; the runtime delivers each message to exactly one of them, so work spreads across all of them automatically.

```text:title="diagram"
                      ┌──────────► consumer 1 ──┐
   producer ──► queue ┼──────────► consumer 2 ──┼──► results
   (one channel)      └──────────► consumer 3 ──┘
            each message goes to exactly ONE consumer
```

```go:title="main.go":run=true
package main

import (
	"fmt"
	"sort"
	"sync"
)

// Competing Consumers: many consumers read from ONE shared queue. Each message
// is delivered to exactly one consumer, so the consumers compete for work and
// the load spreads across them. This differs from fan-out/pub-sub, where every
// consumer receives a copy of every message.

type Result struct {
	Msg      int
	Consumer int
}

func main() {
	const numConsumers = 3
	const numMessages = 9

	queue := make(chan int)      // the single shared work queue
	results := make(chan Result) // where consumers report what they handled

	var wg sync.WaitGroup
	wg.Add(numConsumers)
	for c := 1; c <= numConsumers; c++ {
		go func(consumerID int) {
			defer wg.Done()
			// Each ranges the same channel; the runtime hands each message to
			// exactly one waiting consumer.
			for msg := range queue {
				results <- Result{Msg: msg, Consumer: consumerID}
			}
		}(c)
	}

	// Producer enqueues work, then closes the queue so consumers' loops end.
	go func() {
		for m := 1; m <= numMessages; m++ {
			queue <- m
		}
		close(queue)
	}()

	// Close results once every consumer has exited.
	go func() {
		wg.Wait()
		close(results)
	}()

	var handled []Result
	for r := range results {
		handled = append(handled, r)
	}

	// Every message was processed exactly once (by some consumer).
	sort.Slice(handled, func(i, j int) bool { return handled[i].Msg < handled[j].Msg })
	for _, r := range handled {
		fmt.Printf("message %d processed by consumer %d\n", r.Msg, r.Consumer)
	}
	fmt.Printf("total processed: %d (each message exactly once)\n", len(handled))
}
```

```
// Output (which consumer handles which message varies between runs;
// the guarantee is that each message is processed exactly once):
// message 1 processed by consumer 2
// message 2 processed by consumer 1
// ...
// total processed: 9 (each message exactly once)
```

The same shape scales beyond one process. When consumers are *separate* services draining a broker queue, the broker enforces the "exactly one consumer" guarantee:

```go
// using github.com/nats-io/nats.go — a queue group is competing consumers.
// Run this on N instances with the SAME queue name ("workers"); NATS delivers
// each message to only one member of the group, load-balancing across them.
nc.QueueSubscribe("jobs", "workers", func(m *nats.Msg) {
    process(m.Data)
})
```

This is also how SQS (multiple pollers on one queue), Kafka (consumers in a group, partitions distributed among them), and RabbitMQ (multiple consumers on one queue) scale work horizontally. You add consumer instances to raise throughput, and the queue handles the distribution.

## When to Use

- A single consumer can't keep up with the arrival rate, and the work is parallelisable across messages.
- Messages are independent — processing one doesn't depend on another — so the order they're picked up doesn't matter.
- You want to scale throughput by adding consumers (goroutines or instances) without changing the producer.
- You want resilience: if one consumer dies, the rest keep draining the queue.

## When Not to Use

- Every consumer needs to *see* every message (cache invalidation, notifications). That's [Pub/Sub](/go/patterns/architectural/pub-sub) / fan-out, not competing consumers.
- Strict global ordering is required. Competing consumers process concurrently and finish out of order; if you need ordering, partition by key (so each key has one consumer) or use a single consumer.
- Messages have causal dependencies that demand serial processing.
- The work is so fast that channel/queue coordination costs more than the processing itself — a single loop may be faster.

## Tradeoffs

The core trade is **throughput for ordering**. Many consumers working in parallel finish in nondeterministic order, so any global sequencing guarantee is gone. When some ordering is needed, the usual fix is *partitioning*: route messages for the same key to the same consumer (Kafka does this per partition), preserving per-key order while still distributing different keys across consumers.

Then there's **delivery and failure semantics**, which differ sharply between in-process and broker-backed versions. With a Go channel, a message a consumer pulls is simply gone — if that goroutine panics mid-process, the work is lost unless you recover and requeue. A broker instead typically holds the message until the consumer acks it; on failure or timeout it's redelivered to another consumer (at-least-once), which means consumers must be **idempotent** and you must handle poison messages with a dead-letter queue so one bad message doesn't loop forever.

Finally, **scaling has a ceiling**. More consumers help only until you hit a shared bottleneck — a database connection pool, a downstream rate limit, CPU. Past that, adding consumers just adds contention. Size the consumer count to the real downstream constraint, exactly as you would a worker pool.

## Related Patterns

- **Worker Pool:** The in-process realization of this pattern — a fixed set of goroutines competing over one jobs channel. Competing Consumers is the same idea generalised to consumers that may be separate processes on a broker queue.
- **Fan-out / Fan-in:** The contrast to keep straight. Fan-out *distributes* work like competing consumers, but the broader fan-out/pub-sub family often *duplicates* messages to every consumer; competing consumers deliver each message exactly once.
- **Pub/Sub:** The complementary delivery mode. Pub/sub broadcasts to all subscribers; competing consumers share work across a group. Brokers offer both, and a queue group is competing consumers layered on a topic.
- **Semaphore:** An alternative way to bound concurrency when you don't want a persistent set of consumer goroutines — spawn per message but cap how many run at once.
- **Pipeline:** A competing-consumers stage is often one step in a larger pipeline, parallelising the slowest stage while the rest stay sequential.
