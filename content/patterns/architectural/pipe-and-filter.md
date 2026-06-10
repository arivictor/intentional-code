---
title: "Pipe and Filter"
description: "Process data through a sequence of independent, composable transformation steps where each step reads from input, transforms it, and writes to output."
---

# Pipe and Filter

**Buys independently testable, reorderable, composable stages with optional concurrency; pays in hard-to-diagnose channel stalls and per-stage allocation pressure.**

Pipe and Filter structures a processing workflow as a sequence of steps (filters) connected by data conduits (pipes). Each filter reads input, applies a single transformation, and writes output. Filters have no shared state and no knowledge of each other; they're connected by the pipe, not by direct calls.

This is the shell pipeline model (`cat file | grep pattern | sort | uniq`) applied to application architecture. In Go, the pipe is often a channel (for concurrent filters), an `io.Reader` chain (for stream processing), or simply a sequence of function calls that transform a value through stages.

The pattern appears under different names: data pipeline, processing pipeline, ETL pipeline. The core property is the same in all of them: independent stages, composable in any order, each testable in isolation.

## Scenario

An ETL job reads log records, filters out bot traffic, enriches each record with geo data, applies rate limits, and writes to a data warehouse. All five steps are written as one function. Adding a new transformation step requires modifying and retesting the whole function. Steps can't be reordered or reused elsewhere.

```go
// monolithic.go — all stages tangled in one function
func processLogs(records []LogRecord) []EnrichedRecord {
    var results []EnrichedRecord
    for _, r := range records {
        if isBot(r.UserAgent) {
            continue
        }
        r.GeoData = geoLookup(r.IP)
        if exceedsRateLimit(r.UserID) {
            continue
        }
        results = append(results, enrich(r))
    }
    // Adding a new step: modify this function.
    // Testing geo lookup alone: impossible without the whole pipeline.
    return results
}
```

## Solution

Define a `Filter` type and connect filters through a simple pipe. Each filter handles one transformation.

**Function-based pipeline (simplest form):**

```go:title="main.go":run=true:editable=true
package main

import "fmt"

type LogRecord struct {
	UserAgent string
	IP        string
	UserID    string
	GeoData   string
}

func isBot(ua string) bool        { return ua == "bot" }
func geoLookup(ip string) string  { return "US" }
func exceedsRateLimit(id string) bool { return id == "spammer" }

type Filter func([]LogRecord) []LogRecord

func Chain(filters ...Filter) Filter {
	return func(input []LogRecord) []LogRecord {
		result := input
		for _, f := range filters {
			result = f(result)
		}
		return result
	}
}

func RemoveBots(records []LogRecord) []LogRecord {
	out := records[:0]
	for _, r := range records {
		if !isBot(r.UserAgent) {
			out = append(out, r)
		}
	}
	return out
}

func EnrichWithGeo(records []LogRecord) []LogRecord {
	for i := range records {
		records[i].GeoData = geoLookup(records[i].IP)
	}
	return records
}

func ApplyRateLimit(records []LogRecord) []LogRecord {
	out := records[:0]
	for _, r := range records {
		if !exceedsRateLimit(r.UserID) {
			out = append(out, r)
		}
	}
	return out
}

func main() {
	rawRecords := []LogRecord{
		{UserAgent: "Mozilla/5.0", IP: "1.2.3.4", UserID: "alice"},
		{UserAgent: "bot", IP: "5.6.7.8", UserID: "bot-user"},
		{UserAgent: "Chrome/120", IP: "9.10.11.12", UserID: "spammer"},
		{UserAgent: "Firefox/121", IP: "13.14.15.16", UserID: "bob"},
	}

	process := Chain(
		RemoveBots,
		EnrichWithGeo,
		ApplyRateLimit,
	)
	results := process(rawRecords)

	for _, r := range results {
		fmt.Printf("user=%s geo=%s\n", r.UserID, r.GeoData)
	}
}
```

**Channel-based concurrent pipeline:**

Use channels when filters can run concurrently. Each filter runs in its own goroutine, and output channels feed the next stage.

```go:title="pipeline.go":run=true:editable=true
package main

import "fmt"

type LogRecord struct {
	UserAgent string
	IP        string
	UserID    string
	GeoData   string
}

func isBot(ua string) bool            { return ua == "bot" }
func geoLookup(ip string) string      { return "US" }
func exceedsRateLimit(id string) bool { return id == "spammer" }

func RemoveBotsStage(in <-chan LogRecord) <-chan LogRecord {
	out := make(chan LogRecord)
	go func() {
		defer close(out)
		for r := range in {
			if !isBot(r.UserAgent) {
				out <- r
			}
		}
	}()
	return out
}

func EnrichWithGeoStage(in <-chan LogRecord) <-chan LogRecord {
	out := make(chan LogRecord)
	go func() {
		defer close(out)
		for r := range in {
			r.GeoData = geoLookup(r.IP)
			out <- r
		}
	}()
	return out
}

func ApplyRateLimitStage(in <-chan LogRecord) <-chan LogRecord {
	out := make(chan LogRecord)
	go func() {
		defer close(out)
		for r := range in {
			if !exceedsRateLimit(r.UserID) {
				out <- r
			}
		}
	}()
	return out
}

func BuildPipeline(source <-chan LogRecord) <-chan LogRecord {
	return ApplyRateLimitStage(EnrichWithGeoStage(RemoveBotsStage(source)))
}

func main() {
	source := make(chan LogRecord, 4)
	source <- LogRecord{UserAgent: "Mozilla/5.0", IP: "1.2.3.4", UserID: "alice"}
	source <- LogRecord{UserAgent: "bot", IP: "5.6.7.8", UserID: "bot-user"}
	source <- LogRecord{UserAgent: "Chrome/120", IP: "9.10.11.12", UserID: "spammer"}
	source <- LogRecord{UserAgent: "Firefox/121", IP: "13.14.15.16", UserID: "bob"}
	close(source)

	for r := range BuildPipeline(source) {
		fmt.Printf("user=%s geo=%s\n", r.UserID, r.GeoData)
	}
}
```

**io.Reader chain for stream processing:**

```go
// For byte streams, Go's io.Reader interface is already a pipe-and-filter model
import (
    "compress/gzip"
    "crypto/aes"
    "io"
    "os"
)

func BuildStreamPipeline(raw io.Reader) (io.Reader, error) {
    // Each wrapper is a filter; they chain automatically
    decompressed, err := gzip.NewReader(raw)
    if err != nil {
        return nil, err
    }
    // decrypted := cipher.NewCBCDecrypter(decompressed, ...) — next filter
    return decompressed, nil
}
```

Each filter is independently testable:

```go
// pipeline/log_filters_test.go
func TestRemoveBots(t *testing.T) {
    input := []LogRecord{
        {UserAgent: "Googlebot/2.1"},
        {UserAgent: "Mozilla/5.0"},
    }
    got := RemoveBots(input)
    if len(got) != 1 || got[0].UserAgent != "Mozilla/5.0" {
        t.Fatalf("unexpected result: %v", got)
    }
}
```

## When to Use

- Data flows through a well-defined sequence of transformations: ETL, log processing, request validation, image processing.
- Steps need to be independently testable, reusable across different pipelines, or reorderable.
- Concurrent processing of independent stages would improve throughput (channel-based pipeline).
- The transformation sequence changes: different customers get different filter combinations, or A/B testing requires routing records through different filter chains.

## When Not to Use

- Stages need to share significant state or coordinate closely. The stateless filter model breaks down when filters need to communicate back.
- The pipeline has only one or two steps and the abstraction adds more indirection than it removes.
- Error handling across stages is complex. A filter that fails mid-stream needs careful shutdown signaling to avoid goroutine leaks in the channel-based form.

## The Decision

Each filter is testable with a single function call and a slice of test records. Reordering the pipeline is a one-line change. Adding a new step is additive. The channel-based form enables true concurrency: the geo lookup filter and the rate limit filter run simultaneously on different records, which matters when individual filters are I/O-bound.

However, the cost is operational. When a channel-based pipeline stalls, diagnosing which stage is blocked requires understanding the whole goroutine graph. Error propagation is non-obvious: a filter goroutine that panics or blocks without draining its input channel will block all upstream goroutines indefinitely. Always drain the input channel or use `context.Context` cancellation to unblock. For the simpler sequential form, the main cost is memory: each stage may allocate a new slice, increasing GC pressure for large record sets.

## Related Patterns

- **Hexagonal Architecture:** Each stage in a pipe-and-filter pipeline is a natural hexagonal component: it has an input port and an output port, and its internal logic is independent of how it's wired into the pipeline.
- **Event-Driven Architecture:** A distributed pipe-and-filter pattern. Filters are separate services; pipes are message topics. Each service subscribes to an input topic and publishes to an output topic.
- **Layered Architecture:** Layers are a special case of pipe-and-filter where the sequence is fixed (presentation, service, repository) and each layer communicates only with the adjacent layer.
