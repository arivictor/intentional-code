---
title: "Flyweight"
category: structural
intent: "Minimize memory usage by sharing as much data as possible between similar objects, separating intrinsic from extrinsic state."
idiomSummary: "Share immutable intrinsic state via interning and lookup map; mention sync.Pool as a related but different reuse tool."
relatedSlugs: ["composite", "singleton"]
tags: [state, performance, concurrency]
recognitionHook: "You're allocating thousands of objects with mostly shared data and memory pressure is visible."
---

# Flyweight

Flyweight is a memory optimization: when you have thousands of similar objects, most of their data is identical. Instead of each object storing its own copy of that shared data, they all point to one shared instance. In Go this is usually a cache keyed on the shared value. The first time you need a particular entry you create it and store it; every subsequent request returns the same pointer. The data that never changes (a font, a colour, a locale) lives in the shared instance; the data that varies per object (a position, a timestamp, a count) stays on each individual instance.

`sync.Pool` is a related but different tool: it recycles mutable temporary objects to reduce GC pressure, whereas Flyweight shares immutable permanent state.

## Problem

You're rendering a text editor with thousands of characters on screen. Each character has a glyph style (font name, size, bold, italic: large, repeated data) and a position (small, unique data). Storing the full style on every character wastes memory.

```go
// bloated.go
package editor

type Character struct {
    Char     rune
    X, Y     int
    FontName string  // "Helvetica" — same across thousands of characters
    FontSize int     // 14 — same across a whole paragraph
    Bold     bool
    Italic   bool
}

// A 10,000-character document where every character stores its own
// font name string is wasting memory on identical data.
```

The font name, size, and style flags are the same for all characters in a paragraph. Storing them on every `Character` instance is wasteful. With 10,000 characters, you have 10,000 copies of data that could be stored once.

## Solution

Extract the shared intrinsic state (glyph style) into a separate type. Use a factory that interns these types: returning the existing instance if one with the same key already exists.

```
┌────────────────────┐
│  GlyphStyle (shared)│ ◄── interned, one per unique style
│  FontName, Size,   │
│  Bold, Italic      │
└────────┬───────────┘
         │ many characters reference same GlyphStyle
┌────────▼───────────┐
│  Character (unique) │
│  Char, X, Y        │
│  Style *GlyphStyle  │
└────────────────────┘
```

```go
package main

import (
	"fmt"
	"sync"
)

type GlyphStyle struct {
	FontName string
	FontSize int
	Bold     bool
	Italic   bool
}

type Character struct {
	Char  rune
	X, Y  int
	Style *GlyphStyle
}

func (c *Character) Render() string {
	return fmt.Sprintf("'%c' at (%d,%d) font=%s/%d bold=%v",
		c.Char, c.X, c.Y, c.Style.FontName, c.Style.FontSize, c.Style.Bold)
}

type styleRegistry struct {
	mu    sync.RWMutex
	cache map[string]*GlyphStyle
}

var styles = &styleRegistry{cache: make(map[string]*GlyphStyle)}

func GetStyle(font string, size int, bold, italic bool) *GlyphStyle {
	key := fmt.Sprintf("%s-%d-%v-%v", font, size, bold, italic)
	styles.mu.RLock()
	if s, ok := styles.cache[key]; ok {
		styles.mu.RUnlock()
		return s
	}
	styles.mu.RUnlock()
	styles.mu.Lock()
	defer styles.mu.Unlock()
	if s, ok := styles.cache[key]; ok {
		return s
	}
	s := &GlyphStyle{FontName: font, FontSize: size, Bold: bold, Italic: italic}
	styles.cache[key] = s
	return s
}

func main() {
	body := GetStyle("Helvetica", 14, false, false)
	heading := GetStyle("Helvetica", 20, true, false)

	chars := []*Character{
		{Char: 'H', X: 0, Y: 0, Style: heading},
		{Char: 'e', X: 12, Y: 0, Style: body},
		{Char: 'l', X: 20, Y: 0, Style: body},
		{Char: 'l', X: 28, Y: 0, Style: body},
		{Char: 'o', X: 36, Y: 0, Style: body},
	}

	for _, c := range chars {
		fmt.Println(c.Render())
	}
	fmt.Printf("\nUnique styles: 2 (shared across %d characters)\n", len(chars))
}
```

Output:

```
'H' at (0,0) font=Helvetica/20 bold=true
'e' at (12,0) font=Helvetica/14 bold=false
'l' at (20,0) font=Helvetica/14 bold=false
'l' at (28,0) font=Helvetica/14 bold=false
'o' at (36,0) font=Helvetica/14 bold=false

Unique styles: 2 (shared across 5 characters)
```

## When to Use

- You have a large number of objects that share significant amounts of identical data.
- Memory usage is a measurable problem. Profile before optimizing.
- The shared state is immutable (or can be made immutable).
- You can clearly separate intrinsic (shared) from extrinsic (unique) state.

## When Not to Use

- You don't have enough objects for the sharing to matter. Profile first.
- The shared state is mutable: concurrent mutation of shared state creates race conditions.
- The distinction between intrinsic and extrinsic state is unclear or unstable.

## Tradeoffs

The memory savings are real and dramatic when the sharing ratio is high: two style objects serving ten thousand characters is the intended use. The cost is that the intern cache is package-level mutable state. In concurrent code you need a `sync.RWMutex` around reads and writes, and the cache itself never shrinks. An intern cache that grows without bound can leak memory if new keys arrive continuously (per-request keys built from user input, for example).

The split between intrinsic and extrinsic state also has to be stable. If what you thought was "shared" turns out to vary per object, you end up with either incorrect sharing bugs or a cache that's just a thin wrapper around individual allocations with extra indirection.

## Related Patterns

- **Composite**: Flyweight types often appear as leaves in a Composite tree: the shared Flyweight instance holds common data (style, type) while each Composite node holds unique data (position, quantity, parent).
- **Singleton**: Singleton means one instance of one type; Flyweight means one instance per distinct key. The interning map acts like a keyed singleton registry. Use Singleton when there's genuinely only one, Flyweight when there are several distinct shared values.
