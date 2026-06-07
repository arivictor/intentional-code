---
title: What is Intentional Code?
nav_title: Home
description: Patterns and principles for writing code that's easier to read, test, and change.
icon: house
---

Intentional Code is a collection of patterns and principles that make Go code easier to read, test, and change. It is not a framework or library. It is not a set of rules. It is a mindset for writing code with clear intent.

Architectural choices should be made with clear intent, not based on personal preference. When we apply architectur and patterns its *to solve a real problem that exists now.* We don't optimise for a problem that *might happen* someday.

We think the best way to learn is by doing, so we'll start with some interactive examples that you can run and modify to see how the patterns work in practice. Each example will include a brief explanation of the pattern being used and why it's intentional.

**Try it out!**

```go:title="main.go":run=true:editable=true
package main

func main() {
    println("Hello, Intentional Code!")
}
```

> [!TIP] You can edit the code above and run it to see how it works. Try changing the message or adding more code to see how it affects the output.

[Philosophy](/philosophy) of software design can be applied to any language. Intentional Code will focus on Go and how to best apply them. In some cases, certain patterns are more or less relevant in Go, and we'll cover those differences. But the core principles of intentional code are universal.

When you're ready to get more hands on, we'll move on to the [Patterns](/patterns) section, where we'll cover specific patterns and principles that you can apply in your Go code. Each pattern will include interactive examples to help you understand how to use it effectively.

---

## What are the Benefits of Intentional Code?

1. **Easier to Read**: When code is written with clear intent, it's easier for others (or your future self) to understand what the code is doing and why. This makes it easier to maintain and extend the codebase over time.
2. **Easier to Test**: Intentional code is often more modular and has clearer boundaries between components, which makes it easier to write tests for. This leads to more reliable code and faster development cycles.
3. **Easier to Change**: When code is designed with clear intent, it's easier

## But AI can write code for me, why do I need to learn this?

AI can be a powerful tool for generating code, but it doesn't replace the need for intentional code. AI can help you write code faster, but it can't make architectural decisions for you. It can't understand the problem you're trying to solve or the trade-offs involved in different architectural choices. Once an AI writes your code how are you able to reason about it, debug it, or change it when requirements evolve? Intentional code is about writing code that is easy to understand, test, and change. It's about making architectural decisions with clear intent, not based on personal preference or the latest trends.
