# Abstract Factory

Abstract Factory solves a specific problem: your system needs families of related objects that must be used together — a macOS button paired with a macOS dialog, not a macOS button with a Windows dialog — and the entire family should be swappable as a unit.

In Go, the pattern is an interface whose methods each return a product interface. One struct per family satisfies the factory interface, and the compiler enforces that code written against that interface can never accidentally mix families. This is the critical advantage over individual [Factory Methods](/go/patterns/creational/factory-method): a factory method prevents you from picking the wrong *type*, but it can't prevent you from picking types from different families.

## Problem

You're building a UI toolkit that must work across platforms. Buttons, dialogs, and checkboxes look different on macOS, Windows, and Linux, but the application code should use them interchangeably. Hardcoding platform-specific types throughout the app means every new platform requires shotgun surgery.

```go
// ui_naive.go
package ui

import "fmt"

func CreateButton(platform string) {
    switch platform {
    case "macos":
        fmt.Println("Creating macOS Aqua button")
    case "windows":
        fmt.Println("Creating Windows Fluent button")
    case "linux":
        fmt.Println("Creating GTK button")
    }
}

func CreateDialog(platform string) {
    switch platform {
    case "macos":
        fmt.Println("Creating macOS sheet dialog")
    case "windows":
        fmt.Println("Creating Windows modal dialog")
    case "linux":
        fmt.Println("Creating GTK dialog")
    }
}

// Every new component × every new platform = quadratic growth in switch cases.
// Nothing ensures a macOS button is used with a macOS dialog.
```

Two problems: the switch statements grow with every component and platform, and there's no compile-time guarantee that components from the same family are used together. You could accidentally mix a macOS button with a Windows dialog.

## Solution

Define product interfaces (`Button`, `Dialog`) and a factory interface whose methods return them. Each platform gets one factory struct that produces a consistent family of components.

```
┌─────────────────────┐
│   <<interface>>     │
│   UIFactory         │
│─────────────────────│
│ + CreateButton()    │──► Button interface
│ + CreateDialog()    │──► Dialog interface
└─────────┬───────────┘
          │ implements
    ┌─────┼──────┐
    │            │
┌───▼────┐ ┌────▼────┐
│ macOS  │ │ Windows │
│Factory │ │ Factory │
└────────┘ └─────────┘
```

Define the product interfaces — what every button and dialog must do:

```go
// products.go
package ui

// Button is a clickable UI element.
type Button interface {
    Render() string
}

// Dialog is a modal window.
type Dialog interface {
    Show(title, message string) string
}
```

Define the abstract factory interface:

```go
// factory.go
package ui

// UIFactory creates a family of related UI components.
type UIFactory interface {
    CreateButton() Button
    CreateDialog() Dialog
}
```

Implement a macOS family:

```go
// mac.go
package ui

import "fmt"

type macButton struct{}

func (b *macButton) Render() string { return "[macOS Aqua Button]" }

type macDialog struct{}

func (d *macDialog) Show(title, message string) string {
    return fmt.Sprintf("[macOS Sheet: %s — %s]", title, message)
}

type MacFactory struct{}

func (f *MacFactory) CreateButton() Button { return &macButton{} }
func (f *MacFactory) CreateDialog() Dialog { return &macDialog{} }
```

And a Windows family:

```go
// windows.go
package ui

import "fmt"

type winButton struct{}

func (b *winButton) Render() string { return "[Windows Fluent Button]" }

type winDialog struct{}

func (d *winDialog) Show(title, message string) string {
    return fmt.Sprintf("[Windows Modal: %s — %s]", title, message)
}

type WinFactory struct{}

func (f *WinFactory) CreateButton() Button { return &winButton{} }
func (f *WinFactory) CreateDialog() Dialog { return &winDialog{} }
```

Application code works with the factory interface. It never imports platform-specific types:

```go
// main.go
package main

import (
    "fmt"
    "ui"
)

func buildUI(factory ui.UIFactory) {
    btn := factory.CreateButton()
    dlg := factory.CreateDialog()
    fmt.Println(btn.Render())
    fmt.Println(dlg.Show("Welcome", "Hello from the app"))
}

func main() {
    fmt.Println("--- macOS ---")
    buildUI(&ui.MacFactory{})

    fmt.Println("--- Windows ---")
    buildUI(&ui.WinFactory{})
}
```

Output:

```
--- macOS ---
[macOS Aqua Button]
[macOS Sheet: Welcome — Hello from the app]
--- Windows ---
[Windows Fluent Button]
[Windows Modal: Welcome — Hello from the app]
```

## When to Use

- You need families of related objects that must be used together consistently.
- The system should be configurable to work with one of several product families.
- You want to enforce that products from different families aren't accidentally mixed.

## When Not to Use

- You only have one product type — use [Factory Method](/go/patterns/creational/factory-method) instead.
- The products in each family are trivially different — the abstraction overhead isn't justified.
- You don't actually need family consistency. If mixing is fine, individual factory functions are simpler.

## Advantages

- Guarantees consistency within a product family — macOS button always pairs with macOS dialog.
- Application code is completely decoupled from concrete product types.
- Adding a new family (e.g., Linux) is one new struct implementing the factory interface.

## Disadvantages

- Adding a new product type (e.g., Checkbox) requires changing the factory interface and every implementation. This is a real cost.
- More interfaces and types than simpler alternatives — significant overhead for small programs.
- In Go, the pattern can feel heavy because Go's implicit interfaces already provide much of the decoupling benefit without the ceremony.

## Related Patterns

- **Factory Method** — Use Factory Method when you only need to select one type; reach for Abstract Factory when you need to guarantee that multiple types come from the same family and must be used together correctly.
- **Builder** — Use Builder when constructing one complex object with many optional parts; Abstract Factory is for selecting a consistent set of simpler objects across multiple product types.
