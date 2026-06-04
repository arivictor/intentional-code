---
title: "Iterator"
description: "Provide a way to access elements of a collection sequentially without exposing its underlying representation."
---

# Iterator

The Iterator pattern provides a way to access elements of a collection sequentially without exposing its underlying representation. In simple terms what that means is "give me a way to loop over the elements of this collection without knowing how it's implemented". For example, if you have a binary tree, you might want to iterate over its values in order, but you don't want to expose the tree structure or write the traversal logic every time.

In Go, the most modern and idiomatic form of an iterator is the range-over-function approach introduced in Go 1.23: `iter.Seq[T]` is a function that takes a `yield func(T) bool` and produces values lazily. This integrates directly with for-range loops, allowing consumers to iterate over collections without needing explicit iterator structs or channels.

Go 1.23 made Iterator a first-class language feature: `iter.Seq[T]` (a function of the form `func(yield func(T) bool)`) integrates directly with for-range, replacing the channel-based and explicit `Next()`/`Value()` struct approaches that preceded it. Write the traversal once; every consumer gets a plain `for v := range collection.InOrder()` loop.

## Scenario

You have a binary tree and need to traverse it in multiple ways. Without an iterator abstraction, the traversal logic gets embedded in every function that processes the tree. Search, print, collect, and filter all duplicate the same recursive walk.

```go
// duplicated_walk.go
package tree

import "fmt"

type Node struct {
    Value int
    Left  *Node
    Right *Node
}

// Every consumer duplicates the traversal logic.
func PrintInOrder(n *Node) {
    if n == nil { return }
    PrintInOrder(n.Left)
    fmt.Println(n.Value)
    PrintInOrder(n.Right)
}

func SumInOrder(n *Node) int {
    if n == nil { return 0 }
    return SumInOrder(n.Left) + n.Value + SumInOrder(n.Right)
}

func CollectInOrder(n *Node) []int {
    if n == nil { return nil }
    result := CollectInOrder(n.Left)
    result = append(result, n.Value)
    result = append(result, CollectInOrder(n.Right)...)
    return result
}
// Same walk, three copies. Adding pre-order multiplies this again.
```

The traversal logic (go left, visit, go right) is copy-pasted into every function that needs to process the tree. Adding a new traversal order means duplicating all the processing functions alongside it.

## Solution

With Go 1.23's range-over-func, define an iterator that yields values. Consumers use a plain for-range loop, and the traversal logic is written once.

```
┌─────────────┐
│  Node.All() │──► iter.Seq[int]
└──────┬──────┘
       │
  for v := range node.InOrder() {
      // v is each value, in order
  }
```

```go
package gomark

import (
	"fmt"
	"iter"
)

type Node struct {
	Value int
	Left  *Node
	Right *Node
}

func (n *Node) InOrder() iter.Seq[int] {
	return func(yield func(int) bool) {
		if n == nil {
			return
		}
		for v := range n.Left.InOrder() {
			if !yield(v) {
				return
			}
		}
		if !yield(n.Value) {
			return
		}
		for v := range n.Right.InOrder() {
			if !yield(v) {
				return
			}
		}
	}
}

func main() {
	root := &Node{
		Value: 4,
		Left: &Node{
			Value: 2,
			Left:  &Node{Value: 1},
			Right: &Node{Value: 3},
		},
		Right: &Node{
			Value: 6,
			Left:  &Node{Value: 5},
			Right: &Node{Value: 7},
		},
	}

	fmt.Print("In-order: ")
	for v := range root.InOrder() {
		fmt.Printf("%d ", v)
	}
	fmt.Println()

	sum := 0
	for v := range root.InOrder() {
		sum += v
	}
	fmt.Println("Sum:", sum)

	fmt.Print("First 3: ")
	count := 0
	for v := range root.InOrder() {
		fmt.Printf("%d ", v)
		count++
		if count == 3 {
			break
		}
	}
	fmt.Println()
}
```

Output:

```
In-order: 1 2 3 4 5 6 7
Sum: 28
First 3: 1 2 3
```

> For simple collections, returning a `[]T` slice is perfectly idiomatic Go. Only reach for `iter.Seq` when you need lazy evaluation, custom traversal orders, or iteration over structures where materializing all values would be expensive.

## When to Use

- You need to traverse a data structure without exposing its internals.
- Multiple consumers need different processing of the same traversal.
- You want lazy evaluation: no need to build a full slice when you only need the first few elements.
- You're on Go 1.23+. Use `iter.Seq[T]` as the primary approach.

## When Not to Use

- A simple slice covers your needs. `[]T` with a for-range loop is the simplest iterator.
- The collection is small and fits in memory. Just return a slice from a method.
- You need bidirectional iteration (prev/next). `iter.Seq` doesn't support this naturally.

## The Decision

The range-over-func form integrates cleanly with Go's syntax and handles early termination via `break` naturally; the `yield` return value propagates the stop signal up the call stack. The main cost is that recursive iterators (like tree traversal) carry goroutine-free stack frames for each level of nesting, which adds overhead compared to a plain recursive function materializing a slice.

Before Go 1.23, channel-based iterators were the common workaround, but they leak goroutines if the consumer breaks early without draining the channel. That's a real production bug waiting to happen. The `iter.Seq` approach eliminates that hazard entirely. The trade-off that remains: if you need two-pointer traversal or bidirectional iteration, you'll need to materialize a slice or build an explicit cursor struct.

## Related Patterns

- **Composite:** Iterator is the natural way to traverse a Composite tree without exposing its structure. The traversal logic is written once in the iterator; all consumers use for-range.
- **Visitor:** Iterator provides sequential access to elements; Visitor performs type-specific operations on each element. Combine them when you need to traverse a tree and apply different logic per node type.
