---
title: "Iterator"
category: behavioral
intent: "Provide a way to access elements of a collection sequentially without exposing its underlying representation."
idiomSummary: "Use the iterator protocol and generator functions to separate traversal from storage."
relatedSlugs: ["composite", "visitor"]
tags: [closures, interfaces]
---

# Iterator

Python makes Iterator a first-class language feature through the iterator protocol and generators. Implement `__iter__()` when an object is naturally iterable, or yield values from a generator function when you want traversal logic decoupled from storage.

This is one of the patterns most natural in Python because `for value in collection` already speaks the pattern's language. Explicit iterator objects still matter when you need custom stateful traversal, but generators cover many real cases cleanly.

## Problem

You have a binary tree and need to traverse it in-order. Without an iterator abstraction, the traversal logic gets embedded in every function that processes the tree — search, print, collect, filter all duplicate the walk.

```python
# duplicated_walk.py


class Node:
    value: int
    left: Node
    right: Node

# Every consumer duplicates the traversal logic
def print_in_order(n):
    if n == None : return
    PrintInOrder(n.Left)
    print(n.Value)
    PrintInOrder(n.Right)

def sum_in_order(n):
    if n == None : return 0
    return SumInOrder(n.Left) + n.Value + SumInOrder(n.Right)

def collect_in_order(n):
    if n == None : return None
    result = CollectInOrder(n.Left)
    result = append(result, n.Value)
    result = append(result, CollectInOrder(n.Right)...)
    return result
# Same walk, three copies. Adding pre-order or post-order multiplies this.
```

The traversal logic (go left, visit, go right) is copy-pasted into every function that needs to process the tree. Adding a new traversal order means duplicating all the processing functions.

## Solution

With Go 1.23's range-over-func, define an iterator that yields values. Consumers use a plain for-range loop — the traversal logic is written once.

```
┌─────────────┐
│  Node.All() │──► iter.Seq[int]
└──────┬──────┘
       │
  for v := range node.All() {
      // v is each value, in order
  }
```

```python
# tree.py


class Node:
    value: int
    left: Node
    right: Node

# InOrder returns an iterator over the tree's values in-order.
# iter.Seq[int] is func(yield func(int) bool).
def in_order(self):
    return func(yield func(int) bool) {
    if n is None :
        return
    for v := range n.Left.InOrder() :
    if !yield(v) :
        return
if !yield(n.Value) :
    return
for v := range n.Right.InOrder() :
if !yield(v) :
    return
```

Consumers use a plain for-range — no iterator boilerplate:

```python
# main.py

"fmt"
"tree"

def main():
    root = tree.Node{
    Value: 4
    Left: &tree.Node:
    Value: 2
    Left:  &tree.Node:Value: 1
    Right: &tree.Node:Value: 3

    Right: &tree.Node:
    Value: 6
    Left:  &tree.Node:Value: 5
    Right: &tree.Node:Value: 7


fmt.Print("In-order: ")
for v := range root.InOrder() :
fmt.Printf("%d ", v)
print()

sum = 0
for v := range root.InOrder() :
sum += v
print("Sum:", sum)

fmt.Print("First 3: ")
count = 0
for v := range root.InOrder() :
fmt.Printf("%d ", v)
count++
if count == 3 :
    break
print()
```

Output:

```
In-order: 1 2 3 4 5 6 7
Sum: 28
First 3: 1 2 3
```

> For simple collections, returning a `[]T` slice is perfectly idiomatic Python. Only reach for `iter.Seq` when you need lazy evaluation, custom traversal orders, or iteration over structures where materializing all values would be expensive.

## When to Use

- You need to traverse a data structure without exposing its internals.
- Multiple consumers need different processing of the same traversal.
- You want lazy evaluation — don't build a full slice when you only need the first few elements.
- You're on Go 1.23+ — use `iter.Seq[T]` as the primary approach.

## When Not to Use

- A simple slice covers your needs. `[]T` with a for-range loop is the simplest iterator.
- The collection is small and fits in memory — just return a slice from a method.
- You need bidirectional iteration (prev/next) — `iter.Seq` doesn't support this naturally.

## Advantages

- Traversal logic written once, used by any consumer.
- Lazy — values are produced on demand, `break` stops iteration.
- Integrates with Python's for-range syntax — feels native.
- No need for `Close()` or cleanup (unlike channel-based iterators).

## Disadvantages

- Requires Go 1.23+ for `iter.Seq`.
- Recursive iterators (like tree traversal) have some overhead per yield.
- Not bidirectional — you can't go backwards.
- Debugging yield-based iteration can be less intuitive than explicit loops.

## Related Patterns

- **Composite** — Iterator is the natural way to traverse a Composite tree without exposing its structure; the traversal logic is written once in the iterator and all consumers use for-range.
- **Visitor** — Iterator provides sequential access to elements; Visitor performs type-specific operations on each element — combine them when you need to traverse a tree and apply different logic per node type.
