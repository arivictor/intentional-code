---
title: "Base62 Encoding"
description: "Turn a number into the shortest URL-safe string and back — the primitive every code scheme is built on, with a table-driven test."
---

## Why Not Just Use the Number?

The simplest possible code is the link's sequence number written out: link #1,000,000 becomes `/1000000`. It works, but it's wasteful. Seven digits encode a million values using only ten symbols (`0`–`9`). URLs can safely carry far more than ten symbols, and every extra symbol you allow makes each character do more work.

Base62 uses `0-9`, `a-z`, and `A-Z` — 62 characters, all URL-safe, no escaping, no `+` or `/` from base64 to break a path. The payoff is density: base62 packs the same million values into **four** characters instead of seven, and a billion into six. More values per character is the whole game when your product is measured in characters.

We deliberately stop at the alphanumerics. Base64 is denser still, but `+`, `/`, and `=` need percent-encoding in a URL path, which defeats the point. [Keep it simple](/go/philosophy/kiss): the 62 characters that never need escaping.

## A Package of Its Own

Encoding is a self-contained, pure-function concern with zero dependencies on the rest of the system — the textbook case for its own package. A separate package gives it a clean boundary and, more importantly, a place to be tested in isolation.

```go
// Package base62 encodes unsigned integers as compact, URL-safe strings
// using the 62 alphanumeric characters. It is pure and dependency-free.
package base62

import (
	"errors"
	"strings"
)

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
const base = uint64(len(alphabet)) // 62

// Encode turns n into a base62 string. Encode(0) is "0".
func Encode(n uint64) string {
	if n == 0 {
		return string(alphabet[0])
	}
	// Build digits least-significant first, then reverse.
	var b strings.Builder
	for n > 0 {
		b.WriteByte(alphabet[n%base])
		n /= base
	}
	return reverse(b.String())
}

func reverse(s string) string {
	r := []byte(s)
	for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
		r[i], r[j] = r[j], r[i]
	}
	return string(r)
}
```

The algorithm is ordinary positional notation, base 62 instead of base 10: peel off `n % 62` for the lowest digit, divide by 62, repeat. Because that produces digits from least- to most-significant, we reverse at the end. The `n == 0` guard matters — the loop body never runs for zero, so without the guard `Encode(0)` would return `""`, an empty code that silently collides with itself.

## Decoding: The Inverse

We need the round trip — a code back to its number — both to validate codes and to test the encoder. Decoding walks the string left to right, and this is where input validation lives: a character outside the alphabet means a malformed code, and we return an error rather than guessing.

```go
var ErrInvalidCode = errors.New("base62: code contains an invalid character")

// Decode parses a base62 string back into its number. It returns
// ErrInvalidCode for any character outside the alphabet.
func Decode(s string) (uint64, error) {
	var n uint64
	for i := 0; i < len(s); i++ {
		idx := strings.IndexByte(alphabet, s[i])
		if idx < 0 {
			return 0, ErrInvalidCode
		}
		n = n*base + uint64(idx)
	}
	return n, nil
}
```

`n = n*base + digit` is Horner's method: each new character shifts the running total up one base-62 place and adds the new digit. It's the exact inverse of the encode loop.

A subtlety worth naming: `strings.IndexByte` over a 62-byte string is a tiny linear scan. For a hot path you'd precompute a `[256]int` reverse-lookup table and index it directly. We're not doing that yet — it's an optimisation we can't justify until a profiler tells us this matters, and so far nothing says it does. [Don't build it until you need it.](/go/philosophy/yagni)

## Proving It With a Table

A pure function with a clear contract is the easiest thing in Go to test well, and the idiom is the table-driven test. The most valuable single property is the **round trip**: for any number, decoding its encoding returns the original.

```go
package base62

import "testing"

func TestEncodeKnownValues(t *testing.T) {
	cases := []struct {
		n    uint64
		want string
	}{
		{0, "0"},
		{1, "1"},
		{61, "Z"},
		{62, "10"},
		{3843, "ZZ"}, // 62*62 - 1
		{1000000, "4c92"},
	}
	for _, c := range cases {
		if got := Encode(c.n); got != c.want {
			t.Errorf("Encode(%d) = %q, want %q", c.n, got, c.want)
		}
	}
}

func TestRoundTrip(t *testing.T) {
	for _, n := range []uint64{0, 1, 9, 42, 62, 12345, 1 << 32, 1<<64 - 1} {
		s := Encode(n)
		got, err := Decode(s)
		if err != nil {
			t.Fatalf("Decode(%q): unexpected error %v", s, err)
		}
		if got != n {
			t.Errorf("round trip %d -> %q -> %d", n, s, got)
		}
	}
}

func TestDecodeRejectsJunk(t *testing.T) {
	if _, err := Decode("ab-cd"); err == nil {
		t.Error("Decode(\"ab-cd\") should reject the hyphen")
	}
}
```

Run it:

```
$ go test ./base62/
ok  	example/urlshortener/base62	0.002s
```

The table form makes the cases readable as a specification: `61` is the last single character `Z`, `62` rolls over to `10`, the largest `uint64` survives the round trip. Adding a case is one line, and a failure names exactly which input broke. This is the testing style the whole course uses — see [Test-Driven Development](/go/philosophy/tdd) for the discipline behind it.

## Tradeoffs

Base62 of a sequence number is dense and reversible, but reversibility is a double-edged sword. Because `/9aX2` decodes straight back to a number, **the codes are enumerable**: anyone who shortens one link and decodes its code learns roughly how many links you've issued, and can walk `/0`, `/1`, `/2`… to enumerate them. For a public service that's an information leak — your growth rate and your users' links, both exposed.

That isn't a flaw in base62; it's a flaw in feeding it a *predictable* number. The encoder is just a number-to-string primitive doing its job. The fix is to control what number (or what bytes) go in — which is exactly the generation *strategy*, and exactly why the next step makes it swappable.

## What's Next

We have the primitive: numbers in, short URL-safe strings out, provably reversible. Now we answer the question base62 raised — *what should we encode?* Sequential numbers are short but enumerable; random bytes are unguessable but can collide. Rather than pick once, we'll put all three answers behind the `Generator` interface using the [Strategy pattern](/go/patterns/behavioral/strategy).
