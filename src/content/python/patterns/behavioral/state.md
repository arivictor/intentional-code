---
title: "State"
category: behavioral
intent: "Let an object alter its behavior when its internal state changes, appearing to change its type."
idiomSummary: "Move mode-specific behavior into dedicated state objects or strategy-like callables."
relatedSlugs: ["strategy", "command"]
tags: [interfaces, state]
---

# State

State's identifying signal is a type with switch statements in every method, all checking the same state field. Adding a new state means adding a case to every switch across the entire type. State replaces those switches with one interface and one struct per state — each state's behavior is isolated, and transitions are explicit field assignments on the context.

In Python, the context struct holds a `State` interface value and delegates method calls to it. Transition logic lives inside the state that initiates the change, not scattered across the context's methods.

## Problem

You're building a vending machine. Its behavior depends on whether it has items, whether money has been inserted, and whether an item is being dispensed. A single type with conditionals checking state at every method becomes a mess.

```python
# state_switches.py

class Machine:
    state: string
    balance: int
    items: int

def insert_coin(self, amount):
    match m.state:
    case "idle":
        m.balance += amount
        m.state = "has_money"
    case "has_money":
        m.balance += amount
    case "dispensing":
        # can't insert while dispensing
    case "sold_out":
        # return the coin
    # Every method has this switch. Every new state adds a case everywhere.
```

State logic is scattered across every method. Adding a new state (e.g., "maintenance") means adding a case to every switch in every method. States and their transitions are implicit — you have to read all the switches to understand the state machine.

## Solution

Define a `State` interface. Each state is a struct implementing the interface. The machine delegates to the current state, and transitions happen by replacing the current state.

```
┌──────────────────┐
│    Machine       │
│──────────────────│
│ state State      │──► current state
│ InsertCoin(amt)  │
│ Dispense()       │
└──────────────────┘

<<interface>> State
├── IdleState
├── HasMoneyState
├── DispensingState
└── SoldOutState
```

```python
from typing import Protocol

# vending.py


class State(Protocol):
    def insert_coin(self, m, amount): ...
    def dispense(self, m): ...
    def string(self): ...

class Machine:
    state: State
    balance: int
    items: int

def new_machine(items):
    m = Machine{Items: items}
    if items > 0 :
        m.state = &IdleState:
         else :
        m.state = &SoldOutState:
    return m

def set_state(self, s):
    m.state = s

def insert_coin(self, amount):
    m.state.InsertCoin(m, amount)

def dispense(self):
    m.state.Dispense(m)

# IdleState — waiting for money
class IdleState:
    pass

def insert_coin(self, m, amount):
    m.Balance += amount
    fmt.Printf("Inserted %d cents. Balance: %d\n", amount, m.Balance)
    m.SetState(&HasMoneyState:)

def dispense(self, m):
    print("Insert coin first.")

def string(self):
    return "idle"

# HasMoneyState — money inserted, ready to dispense
class HasMoneyState:
    pass

def insert_coin(self, m, amount):
    m.Balance += amount
    fmt.Printf("Added %d cents. Balance: %d\n", amount, m.Balance)

def dispense(self, m):
    if m.Balance < 100 :
        fmt.Printf("Not enough. Need 100, have %d\n", m.Balance)
        return
    m.Balance -= 100
    m.Items--
    print("Dispensing item...")
    if m.Items == 0 :
        m.SetState(&SoldOutState:)
         else :
        m.SetState(&IdleState:)

def string(self):
    return "has_money"

# SoldOutState — no items left
class SoldOutState:
    pass

def insert_coin(self, m, amount):
    print("Machine is sold out. Returning coin.")

def dispense(self, m):
    print("Sold out.")

def string(self):
    return "sold_out"
```

```python
# main.py


def main():
    m = vending.NewMachine(2)
    m.Dispense()
    m.InsertCoin(50)
    m.Dispense()
    m.InsertCoin(50)
    m.Dispense()
    m.InsertCoin(100)
    m.Dispense()
    m.InsertCoin(100)
    m.Dispense()
```

Output:

```
Insert coin first.
Inserted 50 cents. Balance: 50
Not enough. Need 100, have 50
Added 50 cents. Balance: 100
Dispensing item...
Inserted 100 cents. Balance: 100
Dispensing item...
Machine is sold out. Returning coin.
Sold out.
```

## When to Use

- An object's behavior differs significantly based on its current state.
- You have large switch/if-else blocks checking a state field in every method.
- State transitions are complex and you want them explicitly modeled.

## When Not to Use

- There are only two or three states with trivial behavior differences. A boolean or enum is simpler.
- The state machine is better expressed as a state-transition table (map of state × event → next state).

## Advantages

- Each state's behavior is isolated in its own type — Single Responsibility.
- Adding a new state doesn't require modifying existing states.
- State transitions are explicit and easy to trace.

## Disadvantages

- More types — one per state plus the State interface.
- States that need to access the machine's internals get a `*Machine` reference, which can feel like a circular dependency.
- For simple state machines, the pattern is heavier than a switch.

## Related Patterns

- **Strategy** — Both delegate behavior to an interchangeable implementation; the distinction is control — Strategy is selected and set by an external caller, State transitions internally in response to events within the object itself.
- **Command** — Commands can trigger state transitions; combine them when each transition needs to be undoable — the Command holds the transition logic and the previous state to restore.
