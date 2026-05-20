---
title: "Visitor"
category: behavioral
intent: "Separate an algorithm from the object structure it operates on by using double dispatch."
goIdiomSummary: "Double dispatch via Accept(Visitor); be honest about verbosity and present type-switch as the Go alternative."
relatedSlugs: ["composite", "iterator"]
tags: [interfaces, composition]
---

# Visitor

Visitor separates an operation from the types it operates on. Instead of adding a new method to every type each time you need a new operation, the operations live in a visitor struct — each type accepts a visitor and calls the right method on it. In Go, this means every element type implements `Accept(Visitor)`, and the visitor implements one method per element type.

Here's the honest truth: Visitor is verbose in Go and often not the best choice. The Go alternative — a type switch — is simpler and covers most use cases. Use Visitor when you need the open/closed principle for operations (adding new operations without modifying element types). Use type-switch when you need simplicity and your element types are stable.

## Problem

You have an AST (abstract syntax tree) with different node types — numbers, binary operations, unary operations. You need to evaluate, pretty-print, and type-check the tree. Without Visitor, each new operation requires modifying every node type.

```go
// bloated_ast.go
package ast

import "fmt"

type Node interface {
    Eval() float64
    Print() string
    // Adding TypeCheck() means modifying every Node implementation.
    // Adding Optimize() means modifying every Node again.
}

type NumberNode struct{ Value float64 }

func (n *NumberNode) Eval() float64   { return n.Value }
func (n *NumberNode) Print() string   { return fmt.Sprintf("%.0f", n.Value) }

type AddNode struct{ Left, Right Node }

func (a *AddNode) Eval() float64 { return a.Left.Eval() + a.Right.Eval() }
func (a *AddNode) Print() string {
    return fmt.Sprintf("(%s + %s)", a.Left.Print(), a.Right.Print())
}

// Every new operation bloats every node type.
```

Each new operation (TypeCheck, Optimize, Compile) adds a method to every node type. The node types become dumping grounds for unrelated operations. And you can't add operations from outside the package.

## Solution

Define a `Visitor` interface with one `Visit` method per node type. Each node has `Accept(Visitor)` that calls the appropriate `Visit` method. New operations are new `Visitor` implementations — node types don't change.

```
Visitor interface              Element interface
├── VisitNumber(NumberNode)    ├── Accept(Visitor)
├── VisitAdd(AddNode)          │
├── VisitMul(MulNode)          NumberNode.Accept(v) → v.VisitNumber(n)
                               AddNode.Accept(v)    → v.VisitAdd(n)
```

Define the visitor and element interfaces:

```go
// ast.go
package ast

import "fmt"

type Visitor interface {
    VisitNumber(n *NumberNode) interface{}
    VisitAdd(n *AddNode) interface{}
    VisitMul(n *MulNode) interface{}
}

type Node interface {
    Accept(v Visitor) interface{}
}

type NumberNode struct{ Value float64 }
type AddNode struct{ Left, Right Node }
type MulNode struct{ Left, Right Node }

func (n *NumberNode) Accept(v Visitor) interface{} { return v.VisitNumber(n) }
func (n *AddNode) Accept(v Visitor) interface{}    { return v.VisitAdd(n) }
func (n *MulNode) Accept(v Visitor) interface{}    { return v.VisitMul(n) }
```

Each operation is a Visitor implementation — no node modifications needed:

```go
// visitors.go
package ast

import "fmt"

// Evaluator — computes the result.
type Evaluator struct{}

func (e *Evaluator) VisitNumber(n *NumberNode) interface{} {
    return n.Value
}

func (e *Evaluator) VisitAdd(n *AddNode) interface{} {
    left := n.Left.Accept(e).(float64)
    right := n.Right.Accept(e).(float64)
    return left + right
}

func (e *Evaluator) VisitMul(n *MulNode) interface{} {
    left := n.Left.Accept(e).(float64)
    right := n.Right.Accept(e).(float64)
    return left * right
}

// Printer — produces a string representation.
type Printer struct{}

func (p *Printer) VisitNumber(n *NumberNode) interface{} {
    return fmt.Sprintf("%.0f", n.Value)
}

func (p *Printer) VisitAdd(n *AddNode) interface{} {
    left := n.Left.Accept(p).(string)
    right := n.Right.Accept(p).(string)
    return fmt.Sprintf("(%s + %s)", left, right)
}

func (p *Printer) VisitMul(n *MulNode) interface{} {
    left := n.Left.Accept(p).(string)
    right := n.Right.Accept(p).(string)
    return fmt.Sprintf("(%s * %s)", left, right)
}
```

And here's the simpler type-switch alternative for comparison:

```go
// typeswitch_alt.go
package ast

import "fmt"

// TypeSwitch alternative — simpler, but adding new node types
// requires modifying every switch.
func Eval(n Node) float64 {
    switch v := n.(type) {
    case *NumberNode:
        return v.Value
    case *AddNode:
        return Eval(v.Left) + Eval(v.Right)
    case *MulNode:
        return Eval(v.Left) * Eval(v.Right)
    default:
        panic(fmt.Sprintf("unknown node type: %T", n))
    }
}
```

```go
// main.go
package main

import (
    "ast"
    "fmt"
)

func main() {
    // (3 + 4) * 2
    tree := &ast.MulNode{
        Left: &ast.AddNode{
            Left:  &ast.NumberNode{Value: 3},
            Right: &ast.NumberNode{Value: 4},
        },
        Right: &ast.NumberNode{Value: 2},
    }

    eval := &ast.Evaluator{}
    printer := &ast.Printer{}

    fmt.Println("Expression:", tree.Accept(printer))
    fmt.Println("Result:", tree.Accept(eval))
}
```

Output:

```
Expression: ((3 + 4) * 2)
Result: 14
```

> In most Go codebases, a type-switch is preferred over Visitor. It's simpler, more readable, and the compiler tells you when you've missed a case (with exhaustive switch linters). Use Visitor only when you truly need the open/closed principle for operations — e.g., a compiler or interpreter where new analysis passes are added frequently but the AST node types are stable.

## When to Use

- You need to add many operations to a stable set of element types.
- Operations are the dimension that changes; element types are stable.
- You want operations to be defined outside the element types' package.

## When Not to Use

- Element types change frequently — every new type requires updating every Visitor.
- You have few operations — type-switch is simpler and more Go-idiomatic.
- The double dispatch ceremony (Accept/Visit) feels disproportionate to the problem.

## Advantages

- Adding new operations doesn't modify element types — Open/Closed for operations.
- Each operation is cohesive — all the logic for one operation is in one type.
- Can accumulate state across the traversal.

## Disadvantages

- Extremely verbose in Go — one method per element type in every visitor.
- Adding a new element type requires updating every visitor — Open/Closed breaks in the other direction.
- The `interface{}` return type loses type safety (Go generics could help but add complexity).
- Double dispatch is unfamiliar to many Go developers.

## Related Patterns

- **Composite** — Visitor is most powerful when applied to Composite structures: the Composite defines the tree, Visitor adds operations that traverse it without modifying the node types.
- **Iterator** — Iterator provides sequential access to elements; Visitor performs type-specific operations on each element — combine them when you need to traverse a tree and apply different logic per node type.
