---
title: "Pluggable Generators"
description: "Three code-generation strategies — sequential, random, and hashed — behind one interface, chosen at startup with the Strategy pattern."
---

## One Interface, Three Answers

The last step ended on a problem: base62 of a *sequential* number gives enumerable codes. The fix isn't to abandon base62 — it's to control what goes into it. And there's more than one good answer:

- **Sequential** — encode the sequence number. Shortest possible codes, assigned in order. Enumerable.
- **Random** — pull bytes from `crypto/rand`. Unguessable, but can collide.
- **Hash** — derive the code from the URL. Identical URLs get identical codes (free dedup), at the cost of leaking nothing about volume.

None is universally right. Internal link shorteners *want* short sequential codes; public ones need unguessable random ones; a paste service might want hash-based dedup. When you have several interchangeable algorithms and the right one depends on context, that's the textbook signal for the [Strategy pattern](/go/patterns/behavioral/strategy): define the behaviour as an interface, implement each algorithm once, and choose at runtime.

We already defined the interface in Chapter 1:

```go
type Generator interface {
	Generate(seq uint64, url string) (string, error)
}
```

One method, deliberately handed *both* a sequence number and the URL. Each strategy uses only what it needs — and that's fine. A uniform interface where implementations ignore some inputs is far cleaner than three different method signatures the `Service` would have to special-case.

## Strategy One: Sequential

The simplest generator hands the sequence number straight to the encoder.

```go
package shortener

import "example/urlshortener/base62"

// SequentialGenerator encodes the sequence number directly. Codes are the
// shortest possible and handed out in order — which is exactly what makes
// them enumerable. Fine for internal tools, risky for public links.
type SequentialGenerator struct{}

func (SequentialGenerator) Generate(seq uint64, _ string) (string, error) {
	return base62.Encode(seq), nil
}
```

No state, no error path, nothing to configure — an empty struct that satisfies the interface. The `_` for `url` documents that this strategy ignores it. This is the baseline every other strategy is measured against.

## A Shared Primitive: Random Strings

The random strategy needs cryptographically-random characters over the base62 alphabet. That alphabet lives in the `base62` package, so the helper belongs there too — extend the package from the last step with one function:

```go
// Add to package base62.

import "crypto/rand"

// RandomString returns n cryptographically-random base62 characters.
// It rejects byte values at or above maxUnbiased so every character is
// equally likely — a plain b%62 would favour the first few letters.
func RandomString(n int) (string, error) {
	const maxUnbiased = 256 - (256 % 62) // 248
	out := make([]byte, 0, n)
	buf := make([]byte, n)
	for len(out) < n {
		if _, err := rand.Read(buf); err != nil {
			return "", err
		}
		for _, b := range buf {
			if int(b) >= maxUnbiased {
				continue // would bias the distribution; draw again
			}
			out = append(out, alphabet[int(b)%62])
			if len(out) == n {
				break
			}
		}
	}
	return string(out), nil
}
```

Two details earn their place. First, `rand` here is **`crypto/rand`**, not `math/rand` — codes derived from a predictable PRNG are guessable, which defeats the entire reason for random codes. Second, the `maxUnbiased` rejection: 256 isn't a multiple of 62, so mapping every byte with `b % 62` would make the first eight alphabet characters very slightly more common. Rejecting the top eight byte values removes the bias. It's a small thing, but "the codes are uniformly distributed" is the kind of property you want to be *true*, not approximately true.

## Strategy Two: Random

With the primitive in place, the random generator is thin — and it's where we introduce configuration.

```go
// RandomGenerator produces unguessable codes from crypto/rand. It ignores
// seq and url entirely; only randomness matters. Code length is
// configurable through functional options.
type RandomGenerator struct {
	length int
}

// RandomOption configures a RandomGenerator. This is Go's lightweight
// cousin of the Builder pattern: each option is a function that tweaks
// the value, so the constructor stays clean as options accumulate and
// callers only specify what they want to change.
type RandomOption func(*RandomGenerator)

func WithLength(n int) RandomOption {
	return func(g *RandomGenerator) { g.length = n }
}

func NewRandomGenerator(opts ...RandomOption) *RandomGenerator {
	g := &RandomGenerator{length: 7} // 62^7 ≈ 3.5 trillion codes
	for _, opt := range opts {
		opt(g)
	}
	return g
}

func (g *RandomGenerator) Generate(_ uint64, _ string) (string, error) {
	return base62.RandomString(g.length)
}
```

The functional-options idiom (`NewRandomGenerator(WithLength(8))`) is how idiomatic Go does what the [Builder pattern](/go/patterns/creational/builder) does in other languages: assemble a configured object step by step, with sensible defaults and no giant parameter list. Here it's one knob, but the shape scales — add `WithAlphabet` or `WithMaxAttempts` later and no existing caller breaks.

A length of 7 gives 62⁷ ≈ 3.5 trillion possible codes. With only a few million links issued, the odds any two collide are tiny — and the `Service.Shorten` retry from Chapter 1 mops up the rare clash. That retry loop exists *precisely* for this strategy.

## Strategy Three: Hash (and an Honest Caveat)

The hash strategy derives the code from the URL, so the same URL always yields the same code:

```go
import (
	"crypto/sha256"
	"encoding/binary"
)

// HashGenerator derives a code from the URL, so identical URLs collapse to
// the same code. length controls how many characters we keep — shorter
// codes mean higher collision odds between *different* URLs.
type HashGenerator struct {
	length int
}

func NewHashGenerator(length int) *HashGenerator {
	return &HashGenerator{length: length}
}

func (g *HashGenerator) Generate(_ uint64, url string) (string, error) {
	sum := sha256.Sum256([]byte(url))
	n := binary.BigEndian.Uint64(sum[:8]) // first 8 bytes as a number
	code := base62.Encode(n)
	if len(code) > g.length {
		code = code[:g.length]
	}
	return code, nil
}
```

Here's the honest caveat, and it's a good lesson in how a strategy's behaviour ripples outward. Because the hash is *deterministic*, shortening the same URL twice produces the same code — so `store.Save` returns `ErrCodeExists`, and `Service.Shorten`'s retry loop will regenerate the *same* code five times and fail. For the hash strategy, "code exists" usually means "this exact URL is already shortened," which should return the *existing* link, not error.

We won't bend the `Service` to accommodate this — doing so cleanly means a `FindByURL` step and dedup semantics that only one of our three strategies wants. Instead we name it plainly: **the hash generator is a demonstration of the Strategy pattern's reach, not our default.** Our production default is `RandomGenerator`, whose occasional collisions are genuinely random and genuinely resolved by retrying. URL dedup is a worthwhile extension, left as an exercise. (This is the kind of cross-component coupling [Separation of Concerns](/go/philosophy/separation-of-concerns) makes *visible* — the strategy boundary didn't hide the problem, it localised it.)

## Choosing at Startup

The whole point of Strategy: the choice is one line, and nothing downstream changes.

```go
// Any one of these. Service, Store, and the handlers are identical.
gen := shortener.NewRandomGenerator(shortener.WithLength(7)) // public default
// gen := shortener.SequentialGenerator{}                    // internal tools
// gen := shortener.NewHashGenerator(8)                      // dedup (see caveat)

svc := shortener.NewService(store, gen)
```

`Service` accepts a `Generator`; it has no idea which concrete strategy it's holding. That's the payoff — and it's exactly the property the Strategy pattern promises.

## Tradeoffs at a Glance

| Strategy | Code length | Guessable? | Collisions | Best for |
|---|---|---|---|---|
| Sequential | Shortest | Yes (enumerable) | Never | Internal tools, trusted users |
| Random | Short, fixed | No | Rare, retried | Public links (our default) |
| Hash | Fixed | No | Possible; dedups same URL | Content-addressed links |

There's no winner — there's a *fit*. The reason we built three behind one interface isn't indecision; it's that the right answer is a deployment decision, and Strategy is how you defer a decision to the moment you actually have the context to make it.

## What's Next

Codes are handled: a primitive that's provably reversible, and three swappable ways to decide what to encode. But every code we generate still vanishes the instant the process exits — `store` is a hole we haven't filled. The next chapter fills it three times over: an in-memory [Repository](/go/patterns/architectural/repository), a durable file-backed one, and a caching [Decorator](/go/patterns/structural/decorator) that wraps either.
