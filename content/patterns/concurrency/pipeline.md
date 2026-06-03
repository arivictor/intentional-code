---
title: "Pipeline"
description: "Process a stream of data through a series of stages, each running in its own goroutine and connected to the next by a channel."
---

# Pipeline

A pipeline is a series of stages connected by channels. Each stage consumes values from an upstream channel, applies a transformation, and sends results to a downstream channel. Each stage runs in its own goroutine, so all stages run concurrently: while one stage processes item N, the next stage processes item N-1, and the previous stage is already fetching item N+1.

The pattern composes well. Stages are functions with a consistent signature, and you chain them by passing the output of one as the input to the next.

## Scenario

You need to read files from disk, parse their contents, and write results to a database. The naive approach is sequential: read all files, then parse all files, then write all results. This is slow and holds everything in memory. You want the three stages to overlap.

```go
// Sequential — disk I/O, CPU parsing, and DB writes never overlap.
// Also accumulates all results in memory before any stage begins.
func processSequential(paths []string) error {
    var records []Record
    for _, path := range paths {
        data, err := os.ReadFile(path)
        if err != nil {
            return err
        }
        r, err := parse(data)
        if err != nil {
            return err
        }
        records = append(records, r)
    }
    for _, r := range records {
        if err := db.Insert(r); err != nil {
            return err
        }
    }
    return nil
}
```

## Solution

Build a pipeline with three stages. Each stage runs in a goroutine and communicates via channels. The stages overlap automatically: while the reader is fetching file N+1, the parser is processing file N, and the writer is inserting file N-1.

```go
package intentionalcode

import (
	"fmt"
	"strings"
)

type Record struct {
	Name  string
	Score int
}

func parse(data []byte) (Record, error) {
	// stub: "Alice:95" → Record{Name:"Alice", Score:95}
	parts := strings.SplitN(string(data), ":", 2)
	if len(parts) != 2 {
		return Record{}, fmt.Errorf("bad format: %s", data)
	}
	var score int
	fmt.Sscan(parts[1], &score)
	return Record{Name: parts[0], Score: score}, nil
}

func dbInsert(r Record) error {
	fmt.Printf("  inserted: %+v\n", r)
	return nil
}

func generate(inputs []string) <-chan string {
	out := make(chan string)
	go func() {
		defer close(out)
		for _, s := range inputs {
			out <- s
		}
	}()
	return out
}

func readRecords(lines <-chan string) <-chan []byte {
	out := make(chan []byte)
	go func() {
		defer close(out)
		for line := range lines {
			out <- []byte(line)
		}
	}()
	return out
}

func parseRecords(files <-chan []byte) <-chan Record {
	out := make(chan Record)
	go func() {
		defer close(out)
		for data := range files {
			r, err := parse(data)
			if err != nil {
				continue
			}
			out <- r
		}
	}()
	return out
}

func main() {
	inputs := []string{"Alice:95", "Bob:87", "Charlie:91"}

	records := parseRecords(readRecords(generate(inputs)))
	for r := range records {
		if err := dbInsert(r); err != nil {
			fmt.Println("insert error:", err)
		}
	}
}
```

The call `parseRecords(readFiles(generate(paths)))` reads left-to-right as "generate paths, read files, parse records." Each stage starts running the moment its goroutine is launched, before the downstream stage has consumed a single value.

## Adding cancellation

A pipeline without cancellation has a goroutine leak problem: if the consumer exits early (an error, a deadline), upstream goroutines block on their send forever. Pass a context through every stage and select on `ctx.Done()`.

```go
func readFiles(ctx context.Context, paths <-chan string) <-chan []byte {
    out := make(chan []byte)
    go func() {
        defer close(out)
        for path := range paths {
            data, err := os.ReadFile(path)
            if err != nil {
                continue
            }
            select {
            case out <- data:
            case <-ctx.Done():
                return // consumer is gone, stop producing
            }
        }
    }()
    return out
}
```

See the [Done Channel](/go/patterns/concurrency/done-channel) pattern for the full cancellation discipline.

## Error handling

The simplified stages above discard errors. In production, propagate them out-of-band via a separate error channel, or use the [Errgroup](/go/patterns/concurrency/errgroup) pattern which cancels all goroutines on the first error.

```go
type result struct {
    record Record
    err    error
}

func parseRecords(ctx context.Context, files <-chan []byte) <-chan result {
    out := make(chan result)
    go func() {
        defer close(out)
        for data := range files {
            r, err := parse(data)
            select {
            case out <- result{r, err}:
            case <-ctx.Done():
                return
            }
        }
    }()
    return out
}
```

## When to Use

- You have a multi-step transformation where stages can overlap (I/O in one stage, CPU work in another).
- The data set is large enough that holding everything in memory between steps is undesirable.
- You want the throughput of concurrent processing while preserving the clarity of sequential logic.

## When Not to Use

- The transformation is a single step. A loop is simpler.
- Stages are so fast that channel overhead dominates. Benchmark before adding goroutines to a tight loop.
- You need all results before any downstream processing can start. A pipeline won't help you there.

## The Decision

The pipeline's strength (stages overlap) is also its diagnostic challenge. When something goes wrong, the error is in one goroutine and the symptom may appear in another. Each stage must propagate errors correctly or they silently disappear. Buffered channels between stages can improve throughput by reducing stage synchronisation, but they also mask backpressure: a fast upstream will outrun a slow downstream if you buffer too aggressively. Start with unbuffered channels and add buffering only when you have measured the bottleneck.

## Related Patterns

- **Fan-out / Fan-in**: extend any pipeline stage to run in parallel by fanning out to multiple goroutines and fanning in their results before the next stage.
- **Worker Pool**: a fan-out pattern with a fixed number of workers; use it when you need to cap goroutine count rather than spawning one per item.
- **Done Channel**: the cancellation discipline that prevents pipeline goroutines from leaking when a consumer exits early.
- **Errgroup**: coordinates goroutine groups with shared error handling and automatic cancellation on first failure; cleaner than managing a separate error channel per stage.
