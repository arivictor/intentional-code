---
title: "Mediator"
category: behavioral
intent: "Define an object that encapsulates how a set of objects interact, promoting loose coupling by keeping objects from referring to each other directly."
idiomSummary: "A coordinator struct that colleagues call instead of each other."
relatedSlugs: ["facade", "observer"]
tags: [interfaces, dependency-inversion, events]
---

# Mediator

In a system where every peer knows about every other peer, adding one participant requires updating every other participant's reference list — O(n²) connections growing as the system scales. Mediator collapses this to O(n): each participant holds only a reference to the mediator, which routes messages to whoever needs them.

In Go, the mediator is a struct that holds references to the participants. The participants' own types stay small and contain no cross-references to each other.

## Problem

You're building a chat room. Without a mediator, each user must hold a reference to every other user and send messages directly. Adding or removing users means updating everyone's contact list.

```go
// mesh.go
package chat

type User struct {
    Name  string
    peers []*User
}

func (u *User) Send(msg string) {
    for _, peer := range u.peers {
        peer.Receive(u.Name, msg)
    }
}

func (u *User) Receive(from, msg string) {
    // handle message
}

// Every user knows every other user.
// Adding user D means updating A, B, and C's peer lists.
// This is O(n²) connections.
```

Each participant directly references every other participant. The number of connections grows quadratically. Adding, removing, or filtering participants requires modifying everyone.

## Solution

Introduce a `Room` mediator. Users register with the room and send messages through it. The room decides who receives each message.

```
     ┌──────────────┐
     │     Room     │
     │  (mediator)  │
     │              │
     │ Broadcast()  │
     └──┬────┬──────┘
        │    │
   ┌────▼┐ ┌─▼────┐
   │Alice│ │ Bob  │  ...
   └─────┘ └──────┘
```

```go
// chat.go
package chat

import "fmt"

type Mediator interface {
    Broadcast(sender *User, msg string)
    Register(user *User)
}

type User struct {
    Name string
    room Mediator
}

func NewUser(name string, room Mediator) *User {
    u := &User{Name: name, room: room}
    room.Register(u)
    return u
}

func (u *User) Send(msg string) {
    fmt.Printf("%s sends: %s\n", u.Name, msg)
    u.room.Broadcast(u, msg)
}

func (u *User) Receive(from, msg string) {
    fmt.Printf("  %s received from %s: %s\n", u.Name, from, msg)
}

// Room is the concrete mediator.
type Room struct {
    users []*User
}

func NewRoom() *Room {
    return &Room{}
}

func (r *Room) Register(user *User) {
    r.users = append(r.users, user)
}

func (r *Room) Broadcast(sender *User, msg string) {
    for _, u := range r.users {
        if u != sender {
            u.Receive(sender.Name, msg)
        }
    }
}
```

```go
// main.go
package main

import "chat"

func main() {
    room := chat.NewRoom()

    alice := chat.NewUser("Alice", room)
    bob := chat.NewUser("Bob", room)
    _ = chat.NewUser("Charlie", room)

    alice.Send("Hello everyone!")
    bob.Send("Hey Alice!")
}
```

Output:

```
Alice sends: Hello everyone!
  Bob received from Alice: Hello everyone!
  Charlie received from Alice: Hello everyone!
Bob sends: Hey Alice!
  Alice received from Bob: Hey Alice!
  Charlie received from Bob: Hey Alice!
```

## When to Use

- Many objects communicate in complex ways, creating a web of dependencies.
- You want to centralize communication logic so it's easy to change.
- You need to add filtering, logging, or routing of messages between participants.

## When Not to Use

- Only two objects communicate — direct references are simpler.
- The mediator becomes a god object that knows too much about its participants.
- The communication pattern is simple and unlikely to change.

## Tradeoffs

The main gain is that participants stay small — they only know about the mediator, not about each other. This makes adding a new participant a local change: register with the room and you're done. The cost is that the mediator absorbs all the routing complexity, and as you add features (private messages, topic filtering, muting) it becomes the place where everything hard lives. A mediator that reaches into participant internals to implement its logic has quietly become a god object that violates the encapsulation it was meant to protect. In practice, keep the mediator's interface narrow — it should route, not orchestrate — and split it before it grows beyond one responsibility.

## Related Patterns

- **Facade** — Facade coordinates subsystems on behalf of an external caller; Mediator coordinates peers that could otherwise speak directly to each other — use Facade when the complexity is in the subsystem, Mediator when it's in the peer relationships.
- **Observer** — Mediator coordinates bidirectionally (participants can send and receive through the hub); Observer is unidirectional (subject notifies listeners, listeners don't respond) — use Mediator when peers need to exchange messages, Observer when one object needs to broadcast state changes to passive listeners.
