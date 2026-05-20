---
title: "Abstract Factory"
category: creational
intent: "Provide an interface whose methods each return related product interfaces, so families of related objects can be created without specifying their concrete types."
idiomSummary: "A coordinated set of protocols or factory callables that returns a matching family of collaborators."
relatedSlugs: ["factory-method", "builder"]
tags: [interfaces, composition, dependency-inversion, testability]
---

# Abstract Factory

Abstract Factory solves a specific problem: your system needs families of related objects that must be used together — a macOS button paired with a macOS dialog, not a macOS button with a Windows dialog — and the entire family should be swappable as a unit.

In Python, the pattern is an interface whose methods each return a product interface. One class per family satisfies the factory interface, and Python's object model enforces that code written against that interface can never accidentally mix families. This is the critical advantage over individual [Factory Methods](/python/patterns/creational/factory-method): a factory method prevents you from picking the wrong *type*, but it can't prevent you from picking types from different families.

## Problem

You're building a UI toolkit that must work across platforms. Buttons, dialogs, and checkboxes look different on macOS, Windows, and Linux, but the application code should use them interchangeably. Hardcoding platform-specific types throughout the app means every new platform requires shotgun surgery.

```python
# ui_naive.py


def create_button(platform):
    match platform:
    case "macos":
        print("Creating macOS Aqua button")
    case "windows":
        print("Creating Windows Fluent button")
    case "linux":
        print("Creating GTK button")
    pass

def create_dialog(platform):
    match platform:
    case "macos":
        print("Creating macOS sheet dialog")
    case "windows":
        print("Creating Windows modal dialog")
    case "linux":
        print("Creating GTK dialog")
    pass

# Every new component × every new platform = quadratic growth in switch cases.
# Nothing ensures a macOS button is used with a macOS dialog.
```

Two problems: the switch statements grow with every component and platform, and there's no structural guarantee that components from the same family are used together. You could accidentally mix a macOS button with a Windows dialog.

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

```python
from typing import Protocol

# products.py

# Button is a clickable UI element.
class Button(Protocol):
    def render(self): ...

# Dialog is a modal window.
class Dialog(Protocol):
    def show(self, title, message): ...
```

Define the abstract factory interface:

```python
from typing import Protocol

# factory.py

# UIFactory creates a family of related UI components.
class UIFactory(Protocol):
    def create_button(self): ...
    def create_dialog(self): ...
```

Implement a macOS family:

```python
# mac.py


class macButton:
    pass

def render(self):
    return "[macOS Aqua Button]"

class macDialog:
    pass

def show(self, title, message):
    return f"[macOS Sheet: {title} — {message}]"

class MacFactory:
    pass

def create_button(self):
    return &macButton{
def create_dialog(self):
    return &macDialog{
```

And a Windows family:

```python
# windows.py


class winButton:
    pass

def render(self):
    return "[Windows Fluent Button]"

class winDialog:
    pass

def show(self, title, message):
    return f"[Windows Modal: {title} — {message}]"

class WinFactory:
    pass

def create_button(self):
    return &winButton{
def create_dialog(self):
    return &winDialog{
```

Application code works with the factory interface. It never imports platform-specific types:

```python
# main.py

"fmt"
"ui"

def build_ui(factory):
    btn = factory.CreateButton()
    dlg = factory.CreateDialog()
    print(btn.Render())
    print(dlg.Show("Welcome", "Hello from the app"))

def main():
    print("--- macOS ---")
    buildUI(&ui.MacFactory:)

    print("--- Windows ---")
    buildUI(&ui.WinFactory:)
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

- You only have one product type — use [Factory Method](/python/patterns/creational/factory-method) instead.
- The products in each family are trivially different — the abstraction overhead isn't justified.
- You don't actually need family consistency. If mixing is fine, individual factory functions are simpler.

## Advantages

- Guarantees consistency within a product family — macOS button always pairs with macOS dialog.
- Application code is completely decoupled from concrete product types.
- Adding a new family (e.g., Linux) is one new struct implementing the factory interface.

## Disadvantages

- Adding a new product type (e.g., Checkbox) requires changing the factory interface and every implementation. This is a real cost.
- More interfaces and types than simpler alternatives — significant overhead for small programs.
- In Python, the pattern can feel heavy because Go's implicit interfaces already provide much of the decoupling benefit without the ceremony.

## Related Patterns

- **Factory Method** — Use Factory Method when you only need to select one type; reach for Abstract Factory when you need to guarantee that multiple types come from the same family and must be used together correctly.
- **Builder** — Use Builder when constructing one complex object with many optional parts; Abstract Factory is for selecting a consistent set of simpler objects across multiple product types.
