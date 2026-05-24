---
title: "Visitor"
category: behavioral
intent: "Separate an algorithm from the object structure it operates on by using double dispatch."
idiomSummary: "Double dispatch via Accept(Visitor); be honest about verbosity and present type-switch as the Go alternative."
relatedSlugs: ["composite", "iterator"]
tags: [interfaces, composition]
recognitionHook: "You need to add new operations to a type hierarchy without modifying each type."
---

# Visitor

Visitor separates an operation from the types it operates on. Instead of adding a new method to every type each time you need a new operation, the operations live in a visitor struct. Each type accepts a visitor and calls the right method on it. In Go, this means every element type implements `Accept(Visitor)`, and the visitor implements one method per element type.

Here's the honest truth: Visitor is verbose in Go and often not the right choice. The Go alternative (a type switch) is simpler and covers most use cases. Use Visitor when you need the open/closed principle for operations, meaning you want to add new operations without modifying element types. Use a type switch when you need simplicity and your element types are stable.

## Problem

You have a small expression tree: numbers, addition, multiplication. You need to evaluate it, print it, and eventually type-check it. Without Visitor, each new operation adds a method to every node type.

```go
// bloated_nodes.go
package expr

import "fmt"

type Node interface {
    Eval() float64
    Print() string
    // Adding TypeCheck() means modifying every implementation.
    // Adding Optimize() means modifying every implementation again.
}

type Number struct{ Value float64 }

func (n *Number) Eval() float64  { return n.Value }
func (n *Number) Print() string  { return fmt.Sprintf("%.0f", n.Value) }

type Add struct{ Left, Right Node }

func (a *Add) Eval() float64 { return a.Left.Eval() + a.Right.Eval() }
func (a *Add) Print() string {
    return fmt.Sprintf("(%s + %s)", a.Left.Print(), a.Right.Print())
}

// Every new operation bloats every node type.
```

Each new operation adds a method to every node. The node types become dumping grounds for unrelated operations. You can't add operations from outside the package.

## Solution

Define a `Visitor` interface with one `Visit` method per node type. Each node has `Accept(Visitor)` that calls the appropriate `Visit` method. New operations are new `Visitor` implementations; node types don't change.

```
Visitor interface               Node interface
├── VisitNumber(*Number)        ├── Accept(Visitor)
├── VisitAdd(*Add)              │
└── VisitMul(*Mul)              Number.Accept(v) → v.VisitNumber(n)
                                Add.Accept(v)    → v.VisitAdd(n)
```

```go
package main

import "fmt"

type Visitor interface {
	VisitNumber(n *Number) any
	VisitAdd(n *Add) any
	VisitMul(n *Mul) any
}

type Node interface {
	Accept(v Visitor) any
}

type Number struct{ Value float64 }
type Add struct{ Left, Right Node }
type Mul struct{ Left, Right Node }

func (n *Number) Accept(v Visitor) any { return v.VisitNumber(n) }
func (n *Add) Accept(v Visitor) any    { return v.VisitAdd(n) }
func (n *Mul) Accept(v Visitor) any    { return v.VisitMul(n) }

type Evaluator struct{}

func (e *Evaluator) VisitNumber(n *Number) any { return n.Value }
func (e *Evaluator) VisitAdd(n *Add) any {
	return n.Left.Accept(e).(float64) + n.Right.Accept(e).(float64)
}
func (e *Evaluator) VisitMul(n *Mul) any {
	return n.Left.Accept(e).(float64) * n.Right.Accept(e).(float64)
}

type Printer struct{}

func (p *Printer) VisitNumber(n *Number) any { return fmt.Sprintf("%.0f", n.Value) }
func (p *Printer) VisitAdd(n *Add) any {
	return fmt.Sprintf("(%s + %s)", n.Left.Accept(p).(string), n.Right.Accept(p).(string))
}
func (p *Printer) VisitMul(n *Mul) any {
	return fmt.Sprintf("(%s * %s)", n.Left.Accept(p).(string), n.Right.Accept(p).(string))
}

func main() {
	// (3 + 4) * 2
	tree := &Mul{
		Left:  &Add{Left: &Number{Value: 3}, Right: &Number{Value: 4}},
		Right: &Number{Value: 2},
	}

	fmt.Println("Expression:", tree.Accept(&Printer{}))
	fmt.Println("Result:    ", tree.Accept(&Evaluator{}))
}
```

And here's the simpler type-switch alternative for comparison:

```go
func Eval(n Node) float64 {
	switch v := n.(type) {
	case *Number:
		return v.Value
	case *Add:
		return Eval(v.Left) + Eval(v.Right)
	case *Mul:
		return Eval(v.Left) * Eval(v.Right)
	default:
		panic(fmt.Sprintf("unknown node: %T", n))
	}
}
```

Output:

```
Expression: ((3 + 4) * 2)
Result:     14
```

> In most Go codebases, a type switch is preferred over Visitor. It's simpler, more readable, and exhaustive-switch linters tell you when you've missed a case. Use Visitor only when you truly need the open/closed principle for operations, for example in a compiler or interpreter where new analysis passes are added frequently but the AST node types are stable.

## When to Use

- You need to add many operations to a stable set of element types.
- Operations are the dimension that changes; element types are stable.
- You want operations defined outside the element types' package.

## When Not to Use

- Element types change frequently. Every new type requires updating every Visitor.
- You have few operations. A type switch is simpler and more Go-idiomatic.
- The double dispatch ceremony (Accept/Visit) feels disproportionate to the problem.

## Tradeoffs

The open/closed guarantee runs in one direction only: adding a new operation is cheap (one new struct, zero changes to existing code), but adding a new node type forces you to update every existing visitor. The axes are exactly swapped compared to the type switch.

The `interface{}` return type in the example is the main roughness in Go's Visitor implementation. It loses type safety on every `Accept` call and requires type assertions that panic at runtime if you get them wrong. Go generics can help here but add complexity. The verbosity is real and unavoidable: for an expression tree with five node types and ten operations, you're writing fifty methods. The pattern pays for itself only when operations genuinely outnumber types and are added more frequently.

## Related Patterns

- **Composite**: Visitor works best with Composite structures: the Composite defines the tree, Visitor adds operations that traverse it without modifying the node types.
- **Iterator**: Iterator provides sequential access to elements; Visitor performs type-specific operations on each element. Combine them when you need to traverse a tree and apply different logic per node type.
