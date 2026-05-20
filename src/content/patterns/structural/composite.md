---
title: "Composite"
category: structural
intent: "Compose objects into tree structures so clients can treat individual objects and compositions uniformly through a single interface."
goIdiomSummary: "One interface implemented by both leaf and composite types; tree of nodes; recursion."
relatedSlugs: ["decorator", "iterator", "visitor"]
tags: [interfaces, composition]
---

# Composite

Composite's identifying signal is a tree structure where clients should treat leaves and branches the same way — you call `Price()` and it doesn't matter whether you're calling it on a single product or a bundle of thousands. In Go, this is one interface implemented by both leaf and composite types; the composite holds a `[]InterfaceType` and recursion falls out naturally from each node calling the same method on its children.

The classic example is a file system: both files and directories satisfy the same interface, and a directory simply delegates its operations to its entries.

## Problem

You're building a pricing engine for product bundles. Products have a price. Bundles contain products and other bundles. You need to calculate the total price of any combination, but the code treats products and bundles differently, with type checks everywhere.

```go
// pricing_naive.go
package pricing

import "fmt"

type Product struct {
    Name  string
    Price int64
}

type Bundle struct {
    Name     string
    Products []Product
    Bundles  []Bundle
}

func TotalPrice(b Bundle) int64 {
    total := int64(0)
    for _, p := range b.Products {
        total += p.Price
    }
    for _, sub := range b.Bundles {
        total += TotalPrice(sub) // manual recursion, type-aware
    }
    return total
}

// Adding a "DiscountedProduct" or "SubscriptionBundle" requires
// modifying this function and every function like it.
```

The code must know about every type in the hierarchy. Adding a new kind of priceable item (a subscription, a gift card, a discount wrapper) means changing `TotalPrice` and every similar function.

## Solution

Define a single interface — `PriceComponent` — that both leaf items and composites implement. The composite delegates to its children, and the tree structure emerges naturally.

```
┌─────────────────────────┐
│     <<interface>>       │
│    PriceComponent       │
│─────────────────────────│
│ + Price() int64         │
│ + Name()  string        │
└────────────┬────────────┘
             │ implements
     ┌───────┼────────┐
     │                │
┌────▼──────┐  ┌──────▼──────┐
│  Product  │  │   Bundle    │
│ (leaf)    │  │ (composite) │
│           │  │             │
│ Price()   │  │ children    │──► []PriceComponent
│ Name()    │  │ Price()     │    (recursive)
└───────────┘  │ Name()      │
               └─────────────┘
```

```go
// pricing.go
package pricing

import "fmt"

// PriceComponent is anything with a price.
type PriceComponent interface {
    Price() int64
    Name() string
}

// Product is a leaf node.
type Product struct {
    name  string
    price int64
}

func NewProduct(name string, price int64) *Product {
    return &Product{name: name, price: price}
}

func (p *Product) Price() int64  { return p.price }
func (p *Product) Name() string  { return p.name }

// Bundle is a composite node.
type Bundle struct {
    name     string
    children []PriceComponent
}

func NewBundle(name string, children ...PriceComponent) *Bundle {
    return &Bundle{name: name, children: children}
}

func (b *Bundle) Price() int64 {
    total := int64(0)
    for _, c := range b.children {
        total += c.Price()
    }
    return total
}

func (b *Bundle) Name() string { return b.name }

func (b *Bundle) Add(c PriceComponent) {
    b.children = append(b.children, c)
}
```

```go
// main.go
package main

import (
    "fmt"
    "pricing"
)

func main() {
    keyboard := pricing.NewProduct("Keyboard", 7999)
    mouse := pricing.NewProduct("Mouse", 3999)
    monitor := pricing.NewProduct("Monitor", 39999)

    peripherals := pricing.NewBundle("Peripherals", keyboard, mouse)
    workstation := pricing.NewBundle("Workstation", peripherals, monitor)

    items := []pricing.PriceComponent{keyboard, peripherals, workstation}
    for _, item := range items {
        fmt.Printf("%-15s $%6.2f\n", item.Name(), float64(item.Price())/100)
    }
}
```

Output:

```
Keyboard        $  79.99
Peripherals     $ 119.98
Workstation     $ 519.97
```

## When to Use

- You have a tree structure where parts and wholes should be treated uniformly.
- Clients shouldn't need to know whether they're working with a single object or a group.
- New component types should be addable without modifying the tree-traversal logic.

## When Not to Use

- Your structure isn't a tree. Composite adds unnecessary complexity to flat collections.
- Leaf and composite types have very different operations. Forcing a common interface creates methods that don't make sense for one side.
- You don't need uniform treatment — it's fine to treat items and groups differently.

## Advantages

- Uniform interface for individual items and groups — clean, recursive code.
- New component types are easy to add without changing existing traversal logic.
- Tree depth is unlimited and naturally recursive.

## Disadvantages

- The common interface may be too general — some methods might not make sense for all components.
- Harder to restrict what can go where (e.g., preventing a product from being added to itself).
- Debugging deep trees can be tricky — errors may be buried many levels deep.

## Related Patterns

- **Decorator** — Decorator wraps exactly one object to add behavior; Composite holds a collection of the same interface type to aggregate behavior — if you're wrapping one, use Decorator; if you're aggregating many, use Composite.
- **Iterator** — Composite creates the tree structure; Iterator gives you a consistent way to traverse it without the caller needing to know the tree's shape.
- **Visitor** — Visitor lets you add new operations to a Composite tree without modifying the component types — reach for it when you have a stable structure but frequently need new traversal operations.
