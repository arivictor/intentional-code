---
title: "Facade"
description: "Provide a simple, unified interface to a complex subsystem, shielding clients from internal complexity."
---

# Facade

The Facade pattern is a structural design pattern that provides a simple, unified interface to a complex subsystem, shielding clients from internal complexity. In Go, this is typically implemented as a struct that composes several subsystem interfaces and exposes a small API that orchestrates calls to them. The facade simplifies the client's interaction with the subsystem by hiding the details of how the subsystem's components work together.

## Scenario

You're building a file conversion tool. The process involves validating the file, converting the format, writing the result, and logging what happened. Each step has its own package. Orchestrating all of them in every place that needs "convert a file" is verbose and error-prone.

```go
// scattered.go
package handler

func HandleConvert(path string) {
    if err := validate.CheckFile(path); err != nil { /* ... */ }
    data, err := reader.Read(path)
    if err != nil { /* ... */ }
    converted, err := converter.ToJSON(data)
    if err != nil { /* ... */ }
    out := strings.TrimSuffix(path, filepath.Ext(path)) + ".json"
    if err := writer.Write(out, converted); err != nil { /* ... */ }
    logger.Log("converted " + path + " → " + out)
    // Every entry point that needs conversion must repeat this dance.
}
```

This orchestration logic is duplicated wherever conversion happens: the HTTP handler, a CLI tool, a batch job. Change the sequence (add a compression step) and you must find and update every copy.

## Solution

Create a `Converter` facade struct that encapsulates the multi-step process. Callers get one method; the facade coordinates the subsystems.

```
                  ┌──────────────────────┐
    Handler ─────►│   ConverterFacade    │
    CLI     ─────►│                      │
    Batch   ─────►│ Convert(src, dst)    │
                  └──────────┬───────────┘
                             │ coordinates
            ┌────────────────┼────────────────┐
            │                │                │
      ┌─────▼──────┐  ┌──────▼──────┐  ┌─────▼──────┐
      │  Validator  │  │  Converter  │  │   Writer   │
      └────────────┘  └─────────────┘  └────────────┘
```

```go
package gomark

import (
	"fmt"
	"strings"
)

type Validator interface {
	Validate(path string) error
}

type Transformer interface {
	Transform(data []byte) ([]byte, error)
}

type Writer interface {
	Write(path string, data []byte) error
}

type Logger interface {
	Log(msg string)
}

type Facade struct {
	validator   Validator
	transformer Transformer
	writer      Writer
	logger      Logger
}

func NewFacade(v Validator, t Transformer, w Writer, l Logger) *Facade {
	return &Facade{validator: v, transformer: t, writer: w, logger: l}
}

func (f *Facade) Convert(src, dst string, data []byte) error {
	if err := f.validator.Validate(src); err != nil {
		return fmt.Errorf("validation failed: %w", err)
	}
	result, err := f.transformer.Transform(data)
	if err != nil {
		return fmt.Errorf("transform failed: %w", err)
	}
	if err := f.writer.Write(dst, result); err != nil {
		return fmt.Errorf("write failed: %w", err)
	}
	f.logger.Log(fmt.Sprintf("converted %s → %s", src, dst))
	return nil
}

// Concrete implementations wired together in main.

type FileValidator struct{}

func (v *FileValidator) Validate(path string) error {
	if !strings.HasSuffix(path, ".yaml") && !strings.HasSuffix(path, ".yml") {
		return fmt.Errorf("unsupported format: %s", path)
	}
	return nil
}

type JSONTransformer struct{}

func (t *JSONTransformer) Transform(data []byte) ([]byte, error) {
	return []byte(`{"data":"` + strings.ReplaceAll(string(data), `"`, `\"`) + `"}`), nil
}

type DiskWriter struct{}

func (w *DiskWriter) Write(path string, data []byte) error {
	fmt.Printf("[write] %s: %s\n", path, data)
	return nil
}

type StdoutLogger struct{}

func (l *StdoutLogger) Log(msg string) { fmt.Println(msg) }

func main() {
	facade := NewFacade(
		&FileValidator{},
		&JSONTransformer{},
		&DiskWriter{},
		&StdoutLogger{},
	)

	data := []byte(`name: Alice, age: 30`)
	if err := facade.Convert("person.yaml", "person.json", data); err != nil {
		fmt.Println("conversion failed:", err)
	}
}
```

Output:

```
[write] person.json: {"data":"name: Alice, age: 30"}
converted person.yaml → person.json
```

## When to Use

- Multiple subsystems must be coordinated in a specific sequence, and that sequence is needed in more than one place.
- You want to isolate clients from subsystem complexity.
- You're wrapping a third-party library or legacy system with a cleaner API.

## When Not to Use

- The subsystem is already simple. A facade over one function is just indirection.
- Different callers need different orchestration sequences. The facade becomes a god object with many methods.
- You're hiding complexity that callers actually need to understand and control.

## The Decision

The benefit is clear when the same sequence appears in three or more places: one change propagates everywhere. The risk is that the facade becomes a magnet for new concerns. Someone adds compression, then encryption, then metrics, and the facade accumulates a dozen dependencies and a `Convert` method with a dozen steps. At that point it's a god object, not a simplification.

Fight this by keeping the facade focused on one workflow. If a second distinct workflow emerges, create a second facade rather than extending the first. The interface-based dependencies are worth the ceremony: they make the facade trivially testable with simple fakes, which is difficult if the facade instantiates its own subsystems.

## Related Patterns

- **Adapter**: Adapter makes one incompatible type compatible with one interface; Facade simplifies a whole subsystem into a more convenient API. Use Adapter when you have an interface mismatch, Facade when you have a repeated orchestration problem.
- **Mediator**: Mediator coordinates peers that know about each other and communicate through a central hub; Facade coordinates subsystems on behalf of an external caller. Use Mediator when objects need to send messages to each other, Facade when callers just need a simpler entry point into complex subsystem code.
