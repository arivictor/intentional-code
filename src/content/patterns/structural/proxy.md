---
title: "Proxy"
category: structural
intent: "Provide a surrogate or placeholder for another object to control access, add lazy initialization, logging, or caching."
idiomSummary: "Same-interface wrapper for lazy init, access control, logging, caching; contrast with Decorator."
relatedSlugs: ["adapter", "decorator"]
tags: [interfaces, state, performance, testability, concurrency]
---

# Proxy

Proxy wraps an object with the same interface to control access to it. The wrapper can add lazy initialization, access control, caching, or logging — all without the client knowing it's not talking to the real object.

In Go, Proxy and Decorator look structurally identical (both wrap an interface). The distinction is intent: Decorator adds new behavior; Proxy controls access to existing behavior.

## Problem

You have an image loader that reads files from disk — expensive on first access. Some callers also shouldn't see certain images. You want to defer loading until the image is actually displayed and enforce visibility rules, but you don't want to modify the loader or check permissions at every call site.

```go
// eager.go
package images

type ImageLoader struct {
    path string
    data []byte
}

func NewImageLoader(path string) *ImageLoader {
    // Reads from disk immediately, even if the image is never displayed.
    data, _ := os.ReadFile(path)
    return &ImageLoader{path: path, data: data}
}

func (l *ImageLoader) Display() string {
    return fmt.Sprintf("[image: %s (%d bytes)]", l.path, len(l.data))
}
```

The loader reads the file on construction. If the image is never displayed — a collapsed section, an off-screen element — you've paid the I/O cost for nothing. And there's no access control.

## Solution

Create a proxy that implements the same interface. It lazily loads the image on first display and checks access before delegating.

```
┌────────────────────────┐
│    <<interface>>       │
│      Image             │
│────────────────────────│
│ Display() string       │
└────────────┬───────────┘
             │ implements
     ┌───────┼───────┐
     │               │
┌────▼────────┐ ┌────▼───────────┐
│ ImageLoader │ │  ImageProxy    │
│ (real)      │ │ (proxy)        │
│             │ │ - lazy load    │
│ Display()   │ │ - access ctrl  │
└─────────────┘ │ Display()      │
                └────────────────┘
```

```go
package main

import (
	"fmt"
	"sync"
)

type Image interface {
	Display() string
}

type RealImage struct {
	path string
	data []byte
}

func (img *RealImage) load() {
	fmt.Printf("[disk] loading %s\n", img.path)
	img.data = []byte("...binary data...")
}

func (img *RealImage) Display() string {
	return fmt.Sprintf("[image: %s (%d bytes)]", img.path, len(img.data))
}

type ImageProxy struct {
	path string
	real *RealImage
	once sync.Once
	role string
}

func NewImageProxy(path, role string) *ImageProxy {
	return &ImageProxy{path: path, role: role}
}

func (p *ImageProxy) Display() string {
	if p.role != "viewer" && p.role != "admin" {
		return fmt.Sprintf("[access denied: role %q cannot view images]", p.role)
	}
	p.once.Do(func() {
		p.real = &RealImage{path: p.path}
		p.real.load()
	})
	return p.real.Display()
}

func show(img Image) { fmt.Println(img.Display()) }

func main() {
	viewer := NewImageProxy("photo.jpg", "viewer")
	guest := NewImageProxy("photo.jpg", "guest")

	show(viewer) // triggers lazy load on first call
	show(viewer) // uses cached real image
	show(guest)  // denied
}
```

Output:

```
[disk] loading photo.jpg
[image: photo.jpg (16 bytes)]
[image: photo.jpg (16 bytes)]
[access denied: role "guest" cannot view images]
```

## When to Use

- You need lazy initialization — the real object is expensive to create and may not be needed.
- You need access control — check permissions before delegating to the real object.
- You need caching around an interface without modifying the implementation.
- You want a local representative for a remote object.

## When Not to Use

- The real object is cheap to create. Lazy initialization adds complexity without benefit.
- Access control belongs at a higher level (HTTP middleware, gateway) rather than at the object level.
- You're adding behavior without restricting access — that's [Decorator](/go/patterns/structural/decorator), not Proxy.

## Tradeoffs

`sync.Once` makes lazy initialization goroutine-safe with no lock contention after the first call — it's the right tool here. The proxy is otherwise transparent: callers use the same interface and never know whether they're talking to the real object or the proxy. The cost is that the proxy must stay in sync with the real interface; if you add a method to `Image`, every proxy in the codebase must implement it too, and the compiler will enforce this — which is actually a feature, not a bug. The harder problem is debuggability: when a call goes wrong, the stack trace shows the proxy method, not the real one, and the first-call latency from lazy loading can surface as an intermittent slowness in the caller rather than a consistent cost at construction time.

## Related Patterns

- **Adapter** — Adapter provides a different interface to bridge a mismatch; Proxy preserves the same interface — if your wrapper changes the API, it's an Adapter; if it intercepts calls through the same API, it's a Proxy.
- **Decorator** — Proxy and Decorator are structurally identical in Go; the distinction is purpose — Proxy controls or intercepts access (lazy init, auth, caching), Decorator adds new capabilities while allowing unrestricted access to the original object.
