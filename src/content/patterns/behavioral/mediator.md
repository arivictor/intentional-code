---
title: "Mediator"
category: behavioral
intent: "Define an object that encapsulates how a set of objects interact, promoting loose coupling by keeping objects from referring to each other directly."
goIdiomSummary: "A coordinator struct that colleagues call instead of each other."
relatedSlugs: ["facade", "observer"]
tags: [interfaces, dependency-inversion, events]
---

# Mediator

In a system where every peer knows about every other peer, adding one participant requires updating every other participant's reference list — O(n²) connections growing as the system scales. Mediator collapses this to O(n): each participant holds only a reference to the mediator, which routes messages to whoever needs them.

In Go, the mediator is a struct that holds references to the participants. The participants' own types stay small and contain no cross-references to each other.

## Problem

You're building a chat room system. Without a mediator, each user must hold references to every other user and send messages directly. Adding or removing users means updating everyone's contact list.

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
    // ...
}

// Every user knows every other user.
// Adding user D means updating A, B, and C's peer lists.
// This is O(n²) connections.
```

Each participant directly references every other participant. The number of connections grows quadratically. Adding, removing, or filtering participants requires modifying everyone.

## Solution

Introduce a `ChatRoom` mediator. Users register with the room and send messages through it. The room decides who receives each message.

```
     ┌─────────────────┐
     │   ChatRoom       │
     │   (mediator)     │
     │                  │
     │ Broadcast(msg)   │
     └──┬────┬────┬─────┘
        │    │    │
   ┌────▼┐ ┌▼────▼┐
   │UserA│ │UserB │  ...
   └─────┘ └──────┘
```

```go
// chat.go
package chat

import "fmt"

type Mediator interface {
    Broadcast(sender *User, message string)
    Register(user *User)
}

type User struct {
    Name    string
    room    Mediator
}

func NewUser(name string, room Mediator) *User {
    u := &User{Name: name, room: room}
    room.Register(u)
    return u
}

func (u *User) Send(message string) {
    fmt.Printf("%s sends: %s\n", u.Name, message)
    u.room.Broadcast(u, message)
}

func (u *User) Receive(from, message string) {
    fmt.Printf("  %s received from %s: %s\n", u.Name, from, message)
}

// ChatRoom is the concrete mediator.
type ChatRoom struct {
    users []*User
}

func NewChatRoom() *ChatRoom {
    return &ChatRoom{}
}

func (r *ChatRoom) Register(user *User) {
    r.users = append(r.users, user)
}

func (r *ChatRoom) Broadcast(sender *User, message string) {
    for _, u := range r.users {
        if u != sender {
            u.Receive(sender.Name, message)
        }
    }
}
```

```go
// main.go
package main

import "chat"

func main() {
    room := chat.NewChatRoom()

    alice := chat.NewUser("Alice", room)
    bob := chat.NewUser("Bob", room)
    charlie := chat.NewUser("Charlie", room)

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

## Advantages

- Reduces coupling — participants don't reference each other.
- Communication logic is centralized and easy to modify.
- Easy to add new participants without changing existing ones.

## Disadvantages

- The mediator can become a god object — all complexity concentrates there.
- Single point of failure — if the mediator breaks, everything breaks.
- Indirection makes message flow harder to trace.

## Related Patterns

- **Facade** — Facade coordinates subsystems on behalf of an external caller; Mediator coordinates peers that could otherwise speak directly to each other — use Facade when the complexity is in the subsystem, Mediator when it's in the peer relationships.
- **Observer** — Mediator coordinates bidirectionally (participants can send and receive through the hub); Observer is unidirectional (subject notifies listeners, listeners don't respond) — use Mediator when peers need to exchange messages, Observer when one object needs to broadcast state changes to passive listeners.
