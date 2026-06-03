---
title: "State"
description: "Let an object alter its behavior when its internal state changes, appearing to change its type."
---

# State

The State pattern models an object that changes its behavior based on its internal state. Instead of using conditionals to check the current state and decide what to do, you define a `State` interface and create separate types for each state. The context object holds a reference to the current state and delegates method calls to it. When a state transition occurs, the current state returns the next state, which the context then adopts.

The telltale sign you need this pattern is a type with switch statements in every method, all checking the same state field. Adding a new state means adding a case to every switch across the entire type. State replaces those switches with one interface and one struct per state: each state's behavior is isolated, and transitions are explicit field assignments on the context.

In Go, the context struct holds a `State` interface value and delegates method calls to it. Transition logic lives inside the state that initiates the change, not scattered across the context's methods.

## Scenario

You're modeling a network connection. Its behavior depends on whether it's disconnected, connecting, or connected. A single type with string-based state and switch statements at every method becomes unmanageable.

```go
// switches.go
package conn

type Connection struct {
    state string
}

func (c *Connection) Connect() {
    switch c.state {
    case "disconnected":
        c.state = "connecting"
        dial()
    case "connecting":
        // already connecting, ignore
    case "connected":
        // already connected
    }
    // Every method repeats this switch.
    // A new state ("reconnecting") adds a case everywhere.
}
```

State logic is scattered across every method. Adding a new state means adding a case to every switch in every method. The transitions are implicit; you have to read all the switches to understand the machine.

## Solution

Define a `State` interface. Each state is a struct implementing the interface. The connection delegates to the current state, and transitions happen by replacing the state field.

```
┌──────────────────┐
│   Connection     │
│──────────────────│
│ state State      │──► current state
│ Connect()        │
│ Send(data)       │
│ Disconnect()     │
└──────────────────┘

<<interface>> State
├── DisconnectedState
├── ConnectingState
└── ConnectedState
```

```go
package intentionalcode

import "fmt"

type State interface {
	Connect(c *Connection)
	Send(c *Connection, data string)
	Disconnect(c *Connection)
	String() string
}

type Connection struct {
	state State
}

func NewConnection() *Connection {
	return &Connection{state: &DisconnectedState{}}
}

func (c *Connection) SetState(s State) {
	fmt.Printf("  → %s\n", s)
	c.state = s
}

func (c *Connection) Connect()         { c.state.Connect(c) }
func (c *Connection) Send(data string) { c.state.Send(c, data) }
func (c *Connection) Disconnect()      { c.state.Disconnect(c) }

type DisconnectedState struct{}

func (s *DisconnectedState) Connect(c *Connection) {
	fmt.Println("Dialing...")
	c.SetState(&ConnectingState{})
}

func (s *DisconnectedState) Send(c *Connection, data string) {
	fmt.Println("Cannot send: not connected.")
}

func (s *DisconnectedState) Disconnect(c *Connection) {
	fmt.Println("Already disconnected.")
}

func (s *DisconnectedState) String() string {
	return "disconnected"
}

type ConnectingState struct{}

func (s *ConnectingState) Connect(c *Connection) {
	fmt.Println("Already connecting.")
}

func (s *ConnectingState) Send(c *Connection, data string) {
	fmt.Println("Cannot send: still connecting.")
}

func (s *ConnectingState) Disconnect(c *Connection) {
	fmt.Println("Aborting connection.")
	c.SetState(&DisconnectedState{})
}

func (s *ConnectingState) String() string {
	return "connecting"
}

type ConnectedState struct{}

func (s *ConnectedState) Connect(c *Connection) {
	fmt.Println("Already connected.")
}

func (s *ConnectedState) Send(c *Connection, data string) {
	fmt.Printf("Sending: %q\n", data)
}

func (s *ConnectedState) Disconnect(c *Connection) {
	fmt.Println("Closing connection.")
	c.SetState(&DisconnectedState{})
}

func (s *ConnectedState) String() string {
	return "connected"
}

func main() {
	c := NewConnection()

	c.Send("hello")
	c.Connect()
	c.Connect()
	c.Send("hello")

	c.SetState(&ConnectedState{})

	c.Send("hello")
	c.Send("world")
	c.Disconnect()
	c.Send("hello")
}
```

Output:

```
Cannot send: not connected.
Dialing...
  → connecting
Already connecting.
Cannot send: still connecting.
  → connected
Sending: "hello"
Sending: "world"
Closing connection.
  → disconnected
Cannot send: not connected.
```

## When to Use

- An object's behavior changes sharply based on its current state.
- You have large switch/if-else blocks checking a state field in every method.
- State transitions are complex and you want them explicitly modeled.

## When Not to Use

- There are only two or three states with trivial behavior differences. A boolean or enum is simpler.
- The state machine is better expressed as a state-transition table (a map of state × event → next state).

## The Decision

Each state's behavior is isolated in its own type, which makes adding a new state cheap. You write one new struct and don't touch any existing state. The cost is type proliferation: a machine with seven states produces seven structs plus the interface, which can feel heavy for a relatively simple machine.

States that initiate transitions hold a `*Connection` reference, creating a circular-looking dependency between the state and its context. This is normal for the pattern but surprises developers who encounter it for the first time. For machines with many states and mostly uniform behavior differences, a table-driven approach (a `map[State]map[Event]State`) is often more readable than the full struct-per-state form.

## Related Patterns

- **Strategy**: Both delegate behavior to an interchangeable implementation. The distinction is control: Strategy is selected and set by an external caller; State transitions internally in response to events within the object itself.
- **Command**: Commands can trigger state transitions. Combine them when each transition needs to be undoable: the Command holds the transition logic and the previous state to restore.
