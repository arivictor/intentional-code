---
title: "Visitor"
category: behavioral
intent: "Separate an algorithm from the object structure it operates on by using double dispatch."
idiomSummary: "Separate operations from object structures when you need many passes over the same model."
relatedSlugs: ["composite", "iterator"]
tags: [interfaces, composition]
---

# Visitor

Visitor separates an operation from the types it operates on. Instead of adding a new method to every type each time you need a new operation, the operations live in a dedicated visitor object — each element delegates to the correct visitor method. In Python, that usually means each element exposes `accept(visitor)`, and the visitor implements one method per element type.

Here's the honest truth: Visitor is verbose in Python too, so you should reach for it deliberately. Python alternatives like `match` statements, `functools.singledispatch`, or straightforward polymorphism are often simpler. Use Visitor when you need the open/closed principle for operations (adding new operations without modifying element types), and prefer the simpler alternatives when the node types are stable.

## Problem

You have an AST (abstract syntax tree) with different node types — numbers, binary operations, unary operations. You need to evaluate, pretty-print, and type-check the tree. Without Visitor, each new operation requires modifying every node type.

```python
from __future__ import annotations
from typing import Protocol


# bloated_ast.py

class Node(Protocol):
    def evaluate(self) -> float: ...
    def pretty(self) -> str: ...
    # Adding type_check() means modifying every Node implementation.
    # Adding optimize() means modifying every Node again.


class NumberNode:
    def __init__(self, value: float) -> None:
        self.value = value

    def evaluate(self) -> float:
        return self.value

    def pretty(self) -> str:
        return f"{self.value:.0f}"


class AddNode:
    def __init__(self, left: Node, right: Node) -> None:
        self.left = left
        self.right = right

    def evaluate(self) -> float:
        return self.left.evaluate() + self.right.evaluate()

    def pretty(self) -> str:
        return f"({self.left.pretty()} + {self.right.pretty()})"


# Every new operation (TypeCheck, Optimize, Compile)
# adds a method to every node type.
```

Each new operation adds a method to every node type. The node types become dumping grounds for unrelated operations. And you can't add operations from outside the module.

## Solution

Define a `Visitor` protocol with one method per node type. Each node has `accept(visitor)` that calls the appropriate visitor method. New operations are new visitor classes — node types don't change.

```
Visitor protocol               Node protocol
├── visit_number(NumberNode)   ├── accept(Visitor) -> Any
├── visit_add(AddNode)         │
├── visit_mul(MulNode)         NumberNode.accept(v) → v.visit_number(self)
                               AddNode.accept(v)    → v.visit_add(self)
```

Define the visitor and node types:

```python
# ast_nodes.py
from __future__ import annotations
from typing import Any, Protocol
from dataclasses import dataclass


class Visitor(Protocol):
    def visit_number(self, node: "NumberNode") -> Any: ...
    def visit_add(self, node: "AddNode") -> Any: ...
    def visit_mul(self, node: "MulNode") -> Any: ...


class Node(Protocol):
    def accept(self, visitor: Visitor) -> Any: ...


@dataclass
class NumberNode:
    value: float

    def accept(self, visitor: Visitor) -> Any:
        return visitor.visit_number(self)


@dataclass
class AddNode:
    left: Node
    right: Node

    def accept(self, visitor: Visitor) -> Any:
        return visitor.visit_add(self)


@dataclass
class MulNode:
    left: Node
    right: Node

    def accept(self, visitor: Visitor) -> Any:
        return visitor.visit_mul(self)
```

Each operation is a visitor class — no node modifications needed:

```python
# visitors.py
from ast_nodes import AddNode, MulNode, NumberNode


class Evaluator:
    """Computes the numeric result of the tree."""

    def visit_number(self, node: NumberNode) -> float:
        return node.value

    def visit_add(self, node: AddNode) -> float:
        return node.left.accept(self) + node.right.accept(self)

    def visit_mul(self, node: MulNode) -> float:
        return node.left.accept(self) * node.right.accept(self)


class Printer:
    """Produces a human-readable string representation."""

    def visit_number(self, node: NumberNode) -> str:
        return f"{node.value:.0f}"

    def visit_add(self, node: AddNode) -> str:
        left = node.left.accept(self)
        right = node.right.accept(self)
        return f"({left} + {right})"

    def visit_mul(self, node: MulNode) -> str:
        left = node.left.accept(self)
        right = node.right.accept(self)
        return f"({left} * {right})"
```

And here's the `singledispatch` alternative for comparison:

```python
# singledispatch_alt.py
from functools import singledispatch
from ast_nodes import AddNode, MulNode, NumberNode, Node


# singledispatch alternative — simpler, but adding a new node type
# requires updating every dispatch function.
@singledispatch
def evaluate(node: Node) -> float:
    raise TypeError(f"Unknown node type: {type(node)!r}")


@evaluate.register
def _(node: NumberNode) -> float:
    return node.value


@evaluate.register
def _(node: AddNode) -> float:
    return evaluate(node.left) + evaluate(node.right)


@evaluate.register
def _(node: MulNode) -> float:
    return evaluate(node.left) * evaluate(node.right)
```

```python
# main.py
from ast_nodes import AddNode, MulNode, NumberNode
from visitors import Evaluator, Printer


def main() -> None:
    # (3 + 4) * 2
    tree = MulNode(
        left=AddNode(
            left=NumberNode(value=3),
            right=NumberNode(value=4),
        ),
        right=NumberNode(value=2),
    )

    printer = Printer()
    evaluator = Evaluator()

    print("Expression:", tree.accept(printer))
    print("Result:", tree.accept(evaluator))
```

Output:

```
Expression: ((3 + 4) * 2)
Result: 14
```

> In most Python codebases, `functools.singledispatch` or a `match` statement is preferred over the full Visitor pattern. It's simpler and more readable. Use Visitor only when you truly need the open/closed principle for operations — e.g., a compiler or interpreter where new analysis passes are added frequently but the AST node types are stable.

## When to Use

- You need to add many operations to a stable set of element types.
- Operations are the dimension that changes; element types are stable.
- You want operations to be defined outside the element types' module.

## When Not to Use

- Element types change frequently — every new type requires updating every Visitor.
- You have few operations — `singledispatch` or `match` is simpler and more Pythonic.
- The double dispatch ceremony (`accept`/`visit_*`) feels disproportionate to the problem.

## Advantages

- Adding new operations doesn't modify element types — Open/Closed for operations.
- Each operation is cohesive — all the logic for one operation is in one class.
- Can accumulate state across the traversal (e.g., a counter, a string buffer).

## Disadvantages

- More verbose than `singledispatch` or `match` for simple cases.
- Adding a new element type requires updating every visitor — Open/Closed breaks in the other direction.
- The `Any` return type loses static type safety; generics or overloads can help but add complexity.
- Double dispatch is unfamiliar to many Python developers.

## Related Patterns

- **Composite** — Visitor is most powerful when applied to Composite structures: the Composite defines the tree, Visitor adds operations that traverse it without modifying the node types.
- **Iterator** — Iterator provides sequential access to elements; Visitor performs type-specific operations on each element — combine them when you need to traverse a tree and apply different logic per node type.
