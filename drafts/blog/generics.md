# Generics Do Not Hurt Go. Misuse Does.

Generics and bad abstraction are different problems.

Before Go 1.18, reusable code across types usually meant two weak choices. You either duplicated logic for each type, or you used `interface{}` and moved type checks to runtime. The [type parameters proposal](https://go.dev/blog/generics-proposal) addressed this directly: reduce boilerplate and keep more checks at compile time. Generics, [released in March 2022](https://go.dev/blog/go1.21), solved a real pain point.

Generics still have a cost. The Go team accepted this long before release. Russ Cox described the ["generic dilemma"](https://research.swtch.com/generic) in 2009: one approach hurts programmer speed (duplication), another hurts compile time and binary size (full monomorphization), and another hurts runtime speed (interface boxing). Go 1.18 chose a middle implementation:

> [GCShape stenciling with dictionaries](https://go.googlesource.com/proposal/+/refs/heads/master/design/generics-implementation-dictionaries-go1.18.md)

This keeps binaries smaller than full monomorphization, but it can be slower than hand-written concrete code in some paths. A type parameter is a trade-off, not a free upgrade.

The bigger risk is design style. Generics make it easier to build abstraction layers that add complexity without adding value. Codebases can drift into generic utility stacks, deep constraint hierarchies, and wrappers that hide simple logic. That style is rarely an improvement in Go.

The Go team has said this clearly. Ian Lance Taylor's [guidance](https://go.dev/blog/when-generics) is practical: start from concrete code. The standard library follows that rule. `slices` and `maps` [arrived in Go 1.21](https://go.dev/blog/go1.21), but `Filter` was [left out as too complex](https://www.dolthub.com/blog/2024-12-20-collection-functions-in-go-1-23/). Rob Pike's point was simple: a `for` loop is often clearer, and filtering helpers are easy to overuse.

Generics do not take anything away from Go by themselves. The real problem is premature abstraction. The most reliable rule is timing: duplicate concrete code first, then generalize when repetition is proven and stable. In my view, that is the line between useful generics and noise.