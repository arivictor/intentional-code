---
title: "Composite"
category: structural
intent: "Compose objects into tree structures so clients can treat individual objects and compositions uniformly through a single interface."
idiomSummary: "A shared protocol lets leaves and nested containers be treated uniformly."
relatedSlugs: ["decorator", "iterator", "visitor"]
tags: [interfaces, composition]
---

# Composite

Composite's identifying signal is a tree structure where clients should treat leaves and branches the same way — you call `Price()` and it doesn't matter whether you're calling it on a single product or a bundle of thousands. In Python, this is one interface implemented by both leaf and composite types; the composite holds a `[]InterfaceType` and recursion falls out naturally from each node calling the same method on its children.

The classic example is a file system: both files and directories satisfy the same interface, and a directory simply delegates its operations to its entries.

## Problem

You're building a pricing engine for product bundles. Products have a price. Bundles contain products and other bundles. You need to calculate the total price of any combination, but the code treats products and bundles differently, with type checks everywhere.

```python
# pricing_naive.py


class Product:
    name: string
    price: int64

class Bundle:
    name: string
    products: []Product
    bundles: []Bundle

def total_price(b):
    total = int64(0)
    for p in b._products:
        total += p.Price
    for sub in b._bundles:
        total += TotalPrice(sub) // manual recursion, type-aware
    return total

# Adding a "DiscountedProduct" or "SubscriptionBundle" requires
# modifying this function and every function like it.
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

```python
from typing import Protocol

# pricing.py


# PriceComponent is anything with a price.
class PriceComponent(Protocol):
    def price(self): ...
    def name(self): ...

# Product is a leaf node.
class Product:
    name: string
    price: int64

def new_product(name, price):
    return &Product{name: name, price: price

def price(self):
    return p.price
def name(self):
    return p.name

# Bundle is a composite node.
class Bundle:
    name: string
    children: []PriceComponent

def new_bundle(name, children):
    return &Bundle{name: name, children: children

def price(self):
    total = int64(0)
    for c in b.children:
        total += c.Price()
    return total

def name(self):
    return b.name

def add(self, c):
    b.children = append(b.children, c)
```

```python
# main.py

"fmt"
"pricing"

def main():
    keyboard = pricing.NewProduct("Keyboard", 7999)
    mouse = pricing.NewProduct("Mouse", 3999)
    monitor = pricing.NewProduct("Monitor", 39999)

    peripherals = pricing.NewBundle("Peripherals", keyboard, mouse)
    workstation = pricing.NewBundle("Workstation", peripherals, monitor)

    items = []pricing.PriceComponent{keyboard, peripherals, workstation}
    for item in items:
        fmt.Printf("%-15s $%6.2f\n", item.Name(), float64(item.Price())/100)
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
