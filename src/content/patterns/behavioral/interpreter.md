---
title: "Interpreter"
category: behavioral
intent: "Define a grammar for a language and provide an interpreter that processes sentences in that grammar."
idiomSummary: "Interface-based expression tree; each grammar rule is a struct implementing Interpret(context). Combine with recursive descent parsing for real DSLs."
relatedSlugs: ["composite", "visitor", "iterator"]
tags: [interfaces, recursion, composition]
recognitionHook: "You're building a rules engine, DSL, or expression evaluator over structured input."
---

# Interpreter

Interpreter defines a grammar as a set of types (one type per grammar rule) and evaluates a sentence by walking the resulting tree. Every node implements a shared interface with a single method (`Interpret`, `Eval`, or `Execute`). Composite nodes (binary operations, sequences) hold child nodes and delegate to them recursively; terminal nodes (literals, variables) return a value directly.

The pattern is a natural fit for small, domain-specific languages: filter expressions, arithmetic evaluators, rule engines, and template renderers. For large or performance-critical grammars, a dedicated parser generator or bytecode VM will outperform a hand-rolled tree, but for a DSL that fits in a hundred rules, Interpreter keeps the grammar visible and testable.

## Problem

You need to evaluate boolean filter expressions like `age > 30 AND status == "active"` over a record. Adding new comparison operators or logical connectives means modifying a giant switch statement or, worse, embedding the logic inside the parser. The grammar and the evaluation logic are tangled.

```go
// tangled.go — parser and evaluator mixed in one function
func evaluate(expr string, record map[string]interface{}) bool {
    // Giant switch/if chain, no structure, untestable in isolation
    if strings.Contains(expr, " AND ") {
        parts := strings.SplitN(expr, " AND ", 2)
        return evaluate(parts[0], record) && evaluate(parts[1], record)
    }
    if strings.Contains(expr, " > ") {
        // ...
    }
    // Adding OR requires threading through this entire function.
    return false
}
```

## Solution

Map each grammar rule to a struct implementing `Expression`. The tree structure mirrors the grammar structure, and adding a new rule means adding a new struct with no modification to existing types.

```
┌───────────────────────────────────────────┐
│  Expression (interface)                   │
│  Interpret(ctx map[string]any) bool       │
└──────────────────────┬────────────────────┘
                       │
       ┌───────────────┼───────────────────┐
       │               │                   │
  AndExpr          CompareExpr         LiteralExpr
  (composite)      (terminal)          (terminal)
  left, right      field, op, value    value
```

```go
package main

import "fmt"

type Context map[string]any

type Expression interface {
	Interpret(ctx Context) bool
}

type CompareExpr struct {
	Field string
	Op    string
	Value any
}

func (c *CompareExpr) Interpret(ctx Context) bool {
	actual, ok := ctx[c.Field]
	if !ok {
		return false
	}
	switch c.Op {
	case "==":
		return fmt.Sprintf("%v", actual) == fmt.Sprintf("%v", c.Value)
	case ">":
		a, aOK := toFloat(actual)
		b, bOK := toFloat(c.Value)
		return aOK && bOK && a > b
	case "<":
		a, aOK := toFloat(actual)
		b, bOK := toFloat(c.Value)
		return aOK && bOK && a < b
	}
	return false
}

func toFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case int:
		return float64(n), true
	case float64:
		return n, true
	}
	return 0, false
}

type AndExpr struct{ Left, Right Expression }

func (a *AndExpr) Interpret(ctx Context) bool {
	return a.Left.Interpret(ctx) && a.Right.Interpret(ctx)
}

type OrExpr struct{ Left, Right Expression }

func (o *OrExpr) Interpret(ctx Context) bool {
	return o.Left.Interpret(ctx) || o.Right.Interpret(ctx)
}

type NotExpr struct{ Child Expression }

func (n *NotExpr) Interpret(ctx Context) bool {
	return !n.Child.Interpret(ctx)
}

func main() {
	// age > 30 AND status == "active"
	rule := &AndExpr{
		Left:  &CompareExpr{Field: "age", Op: ">", Value: 30},
		Right: &CompareExpr{Field: "status", Op: "==", Value: "active"},
	}

	records := []Context{
		{"age": 35, "status": "active"},
		{"age": 25, "status": "active"},
		{"age": 40, "status": "inactive"},
	}

	for _, rec := range records {
		fmt.Printf("%v → %v\n", rec, rule.Interpret(rec))
	}
}
```

Output:

```
map[age:35 status:active] → true
map[age:25 status:active] → false
map[age:40 status:inactive] → false
```

Adding a new operator (`>=`) means adding one case to `CompareExpr.Interpret`. Adding a new logical connective (`XOR`) means adding one new struct. No existing code changes.

## When to Use

- You need to evaluate expressions or rules defined at runtime, not compile time.
- The grammar is small and stable (a handful of rules, not a general-purpose language).
- You want each rule to be independently testable as a unit.

## When Not to Use

- The grammar is large or deeply nested. The tree becomes expensive to traverse on each evaluation.
- You need good error messages from a parser, line numbers, and recovery. A proper parser generator (ANTLR, PEG, etc.) does this far better.
- Performance is critical. A bytecode VM or compiled approach will outperform a recursive tree walk by an order of magnitude.

## Tradeoffs

Each grammar rule is isolated and testable: you can unit test `AndExpr` without a parser by constructing the tree directly. Adding a new rule is additive, not a modification. The downside is that a deep or wide tree introduces significant allocation and indirection. For long-lived filter expressions evaluated millions of times per second, compile the expression to a closure or bytecode rather than walking the tree on every call.

The context map (`map[string]any`) is convenient but loses type safety. Typed context structs improve performance and catch field name typos at compile time.

## Related Patterns

- **Composite:** Interpreter's composite expressions are a direct application of Composite: each expression is either a leaf (terminal) or a container of child expressions (non-terminal). Interpreter gives Composite a purpose; Composite provides the structural foundation.
- **Visitor:** Use Visitor alongside Interpreter when you need multiple operations over the same expression tree (evaluate, pretty-print, type-check, optimize) without adding methods to each node type.
- **Iterator:** When evaluating an Interpreter tree over a sequence of records, an Iterator provides the traversal over the record set while the Interpreter handles the predicate logic.
