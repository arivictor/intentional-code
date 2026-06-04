---
title: "Fan-out / Fan-in"
description: "Distribute work from a single channel across multiple goroutines, then merge their results back into one channel."
---

# Fan-out / Fan-in

Fan-out distributes work from a single source channel to multiple goroutines processing in parallel. Fan-in merges the results from multiple goroutines back into a single channel for the downstream consumer. Together they turn a single-threaded pipeline stage into a parallel one, without changing the interface: the caller still reads from one channel.

The pattern addresses a specific bottleneck: a pipeline stage that is slower than its upstream and downstream. Rather than replacing the slow stage, you run N copies of it simultaneously.

## Scenario

An image processing pipeline fetches images from a channel, runs a CPU-intensive resize operation on each one, and emits the result. The resize step is the bottleneck: it's CPU-bound and takes 100ms per image. The upstream can produce images faster than a single goroutine can resize them.

```go
// Single-stage pipeline — resize is the bottleneck.
// All resizes happen sequentially despite having multiple CPUs available.
func resize(in <-chan Image) <-chan Image {
    out := make(chan Image)
    go func() {
        defer close(out)
        for img := range in {
            out <- resizeImage(img) // 100ms, blocks the whole pipeline
        }
    }()
    return out
}
```

## Solution

Fan out the resize stage across N goroutines, fan in their results to a single output channel.

```go
package gomark

import (
	"fmt"
	"runtime"
	"sync"
)

type Image struct {
	Name   string
	Width  int
	Height int
}

func resizeImage(img Image) Image {
	return Image{Name: img.Name, Width: img.Width / 2, Height: img.Height / 2}
}

func resize(in <-chan Image) <-chan Image {
	out := make(chan Image)
	go func() {
		defer close(out)
		for img := range in {
			out <- resizeImage(img)
		}
	}()
	return out
}

func fanOut(in <-chan Image, workers int) []<-chan Image {
	channels := make([]<-chan Image, workers)
	for i := range workers {
		channels[i] = resize(in)
	}
	return channels
}

func fanIn(channels ...<-chan Image) <-chan Image {
	var wg sync.WaitGroup
	merged := make(chan Image)

	forward := func(c <-chan Image) {
		defer wg.Done()
		for img := range c {
			merged <- img
		}
	}

	wg.Add(len(channels))
	for _, c := range channels {
		go forward(c)
	}

	go func() {
		wg.Wait()
		close(merged)
	}()

	return merged
}

func processImages(images <-chan Image) <-chan Image {
	workers := fanOut(images, runtime.NumCPU())
	return fanIn(workers...)
}

func main() {
	in := make(chan Image, 4)
	in <- Image{"photo1.jpg", 1920, 1080}
	in <- Image{"photo2.jpg", 3840, 2160}
	in <- Image{"photo3.jpg", 1280, 720}
	in <- Image{"photo4.jpg", 2560, 1440}
	close(in)

	for img := range processImages(in) {
		fmt.Printf("resised %s → %dx%d\n", img.Name, img.Width, img.Height)
	}
}
```

The caller's interface is unchanged: they read from a single `<-chan Image`. The parallelism is entirely internal.

## With cancellation

When the consumer exits early, the fan-in goroutines must not block forever on `merged <- img`. Pass a context and select on `ctx.Done()` in the forward function.

```go
func fanIn(ctx context.Context, channels ...<-chan Image) <-chan Image {
    var wg sync.WaitGroup
    merged := make(chan Image)

    forward := func(c <-chan Image) {
        defer wg.Done()
        for img := range c {
            select {
            case merged <- img:
            case <-ctx.Done():
                return
            }
        }
    }

    wg.Add(len(channels))
    for _, c := range channels {
        go forward(c)
    }

    go func() {
        wg.Wait()
        close(merged)
    }()

    return merged
}
```

## Choosing the worker count

The right number of workers depends on whether the stage is CPU-bound or I/O-bound:

```go
// CPU-bound (image processing, encoding, hashing):
// more workers than CPUs gives no benefit and adds scheduling overhead.
workers := runtime.NumCPU()

// I/O-bound (HTTP calls, database queries, disk reads):
// goroutines spend most of their time waiting; more workers overlap the waits.
// Tune based on the upstream limit (API rate limit, DB connection pool size).
workers := 50
```

For I/O-bound work, consider a [Worker Pool](/go/patterns/concurrency/worker-pool) instead. It bounds concurrency with a fixed pool rather than spawning N goroutines upfront.

## When to Use

- A single pipeline stage is slower than surrounding stages, and each item is independent.
- You have a CPU-bound operation and want to use all available cores.
- You have an I/O-bound operation (HTTP calls, DB queries) where parallelism reduces total latency.
- You need to preserve the single-channel interface for the downstream consumer.

## When Not to Use

- Items are not independent; each depends on the result of the previous one.
- The bottleneck is downstream (a slow consumer). Adding parallel producers makes the fan-in goroutines block on a full channel. Fix the consumer instead.
- The work is cheap enough that channel overhead exceeds the benefit of parallelism. Measure first.
- You need a fixed upper bound on goroutines regardless of input size. Use a [Worker Pool](/go/patterns/concurrency/worker-pool).

## The Decision

Fan-out does not preserve input order in the output. If order matters, you need to tag each item with its index and reorder at the fan-in, or use a worker pool with an ordered results channel. The number of goroutines scales with the `workers` parameter, not with input size, so fan-out is safe for large input streams.

The primary risk is the fan-in's `merged` channel becoming a bottleneck: if it's unbuffered, fast workers will block waiting for the consumer. A modest buffer (equal to the worker count) is often the right call.

## Related Patterns

- **Pipeline**: fan-out/fan-in is how you parallelise a single pipeline stage; the surrounding structure remains a pipeline.
- **Worker Pool**: an alternative for bounded concurrency: a fixed goroutine count consuming from a job channel rather than N goroutines sharing an input channel.
- **Done Channel**: cancellation discipline to prevent fan-in goroutines leaking when the consumer exits.
- **Errgroup**: handles the case where workers can fail; cancels all workers on the first error.
