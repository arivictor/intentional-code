export const BEHAVIORAL_CONTENT = {
  "chain-of-responsibility": {
    intentDetail: `Chain of Responsibility passes a request along a sequence of handlers. Each handler decides whether to process the request, modify it, or pass it to the next handler. In Go, this is most commonly seen as HTTP middleware chains, but it applies anywhere you need a pipeline of processors.

The Go idiom favors a slice of handlers or composed middleware functions over linked lists of handler objects.`,

    problem: `You're building a request processing pipeline. Incoming requests need validation, rate limiting, authentication, and finally handling. The logic for deciding which checks to apply is tangled into a single function with deeply nested conditionals.`,

    problemCode: `func processRequest(req Request) Response {
    // Validation
    if req.Body == "" {
        return Response{Status: 400, Body: "empty body"}
    }
    // Rate limiting
    if isRateLimited(req.IP) {
        return Response{Status: 429, Body: "too many requests"}
    }
    // Auth
    if !isAuthenticated(req.Token) {
        return Response{Status: 401, Body: "unauthorized"}
    }
    // Actual handling — buried under checks
    return Response{Status: 200, Body: "processed: " + req.Body}
}`,
    problemCodeFile: "tangled.go",

    problemExplain: `Every new check requires editing this function. The order is implicit. You can't reuse the auth check without the rate limiter. And testing one check requires setting up all the others.`,

    solutionIntro: `Define a Handler function type and chain them. Each handler either stops the chain (by returning a response) or calls the next handler.`,

    diagram: `Request ──► Validate ──► RateLimit ──► Auth ──► Handle
               │             │           │          │
             stop?         stop?       stop?     respond`,
    diagramCaption: "Each handler in the chain can stop processing or pass to the next.",

    solutionSteps: [
      {
        code: `package pipeline

import "fmt"

type Request struct {
    IP    string
    Token string
    Body  string
}

type Response struct {
    Status int
    Body   string
}

// Handler processes a request. If it returns true, the chain continues.
type Handler func(req Request) (Response, bool)

// Chain runs handlers in order until one stops the chain.
func Chain(handlers ...Handler) Handler {
    return func(req Request) (Response, bool) {
        for _, h := range handlers {
            resp, cont := h(req)
            if !cont {
                return resp, false
            }
        }
        return Response{Status: 500, Body: "no handler responded"}, false
    }
}

func Validate(req Request) (Response, bool) {
    if req.Body == "" {
        return Response{Status: 400, Body: "empty body"}, false
    }
    return Response{}, true // continue chain
}

func RateLimit(req Request) (Response, bool) {
    // Simplified — real implementation would check a counter
    if req.IP == "blocked" {
        return Response{Status: 429, Body: "rate limited"}, false
    }
    return Response{}, true
}

func RequireAuth(req Request) (Response, bool) {
    if req.Token == "" {
        return Response{Status: 401, Body: "unauthorized"}, false
    }
    return Response{}, true
}

func Handle(req Request) (Response, bool) {
    return Response{Status: 200, Body: fmt.Sprintf("processed: %s", req.Body)}, false
}`,
        filename: "pipeline.go",
      },
      {
        code: `package main

import (
    "fmt"
    "pipeline"
)

func main() {
    handler := pipeline.Chain(
        pipeline.Validate,
        pipeline.RateLimit,
        pipeline.RequireAuth,
        pipeline.Handle,
    )

    requests := []pipeline.Request{
        {IP: "1.2.3.4", Token: "valid", Body: "hello"},
        {IP: "1.2.3.4", Token: "", Body: "hello"},
        {IP: "blocked", Token: "valid", Body: "hello"},
        {IP: "1.2.3.4", Token: "valid", Body: ""},
    }

    for _, req := range requests {
        resp, _ := handler(req)
        fmt.Printf("[%d] %s\\n", resp.Status, resp.Body)
    }
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `[200] processed: hello
[401] unauthorized
[429] rate limited
[400] empty body`,

    whenToUse: [
      "You need a pipeline of checks or transformations that should be composable and reorderable.",
      "Each handler is independent and should be testable in isolation.",
      "You're building HTTP middleware.",
    ],

    whenNotToUse: [
      "The processing order is fixed and unlikely to change. A straightforward function may be clearer.",
      "There's only one or two steps — the chain machinery adds overhead without benefit.",
    ],

    advantages: [
      "Each handler is single-responsibility and independently testable.",
      "The chain is composable — add, remove, or reorder handlers without changing existing code.",
      "Naturally maps to Go's HTTP middleware pattern.",
    ],
    disadvantages: [
      "Harder to trace which handler responded — debugging can require logging at each step.",
      "If handlers need to share context, you need to pass it explicitly (e.g., via context.Context).",
    ],

    relatedPatterns: [
      { slug: "decorator", relation: "HTTP middleware is both Decorator and Chain of Responsibility." },
      { slug: "command", relation: "Commands can be chained into a pipeline." },
    ],
  },

  "command": {
    intentDetail: `Command encapsulates a request as an object (or, in Go, a function value). This lets you parameterize functions with operations, queue them, log them, and support undo. In Go, the simplest form of Command is a function value — you don't always need a struct.`,

    problem: `You're building a text editor with undo support. Operations like insert, delete, and replace need to be recorded so they can be reversed. Without Command, the undo logic is tangled with the editing logic.`,

    problemCode: `package editor

type Editor struct {
    content string
}

func (e *Editor) Insert(pos int, text string) {
    e.content = e.content[:pos] + text + e.content[pos:]
    // How do you undo this? You'd need to track what was inserted, where.
    // That tracking logic gets tangled with every operation.
}

func (e *Editor) Delete(pos, length int) {
    e.content = e.content[:pos] + e.content[pos+length:]
    // To undo, you need to remember what was deleted.
    // This concern bleeds into every method.
}`,
    problemCodeFile: "editor_naive.go",

    problemExplain: `Each operation knows how to do its work but not how to undo it. Adding undo means modifying every operation to also record inverse information. The editor becomes responsible for both editing and history management.`,

    solutionIntro: `Define a Command interface with Execute() and Undo() methods. Each operation is a struct that captures everything needed to reverse it. A history stack manages undo.`,

    diagram: `┌─────────────────┐     ┌─────────────────┐
│   <<interface>> │     │    Editor       │
│    Command      │     │                 │
│─────────────────│     │ content string  │
│ Execute()       │────►│                 │
│ Undo()          │     └─────────────────┘
└────────┬────────┘
         │ implements
   ┌─────┼──────┐
   │            │
InsertCmd   DeleteCmd

History: [cmd1, cmd2, cmd3] ← Undo pops and calls Undo()`,
    diagramCaption: "Commands capture operations. A history stack enables undo by calling each command's Undo method.",

    solutionSteps: [
      {
        code: `package editor

import "fmt"

type Editor struct {
    Content string
}

// Command is an undoable operation.
type Command interface {
    Execute()
    Undo()
}

// InsertCommand inserts text at a position.
type InsertCommand struct {
    editor *Editor
    pos    int
    text   string
}

func (c *InsertCommand) Execute() {
    c.editor.Content = c.editor.Content[:c.pos] + c.text + c.editor.Content[c.pos:]
}

func (c *InsertCommand) Undo() {
    c.editor.Content = c.editor.Content[:c.pos] + c.editor.Content[c.pos+len(c.text):]
}

// DeleteCommand deletes text at a position.
type DeleteCommand struct {
    editor  *Editor
    pos     int
    length  int
    deleted string // saved for undo
}

func (c *DeleteCommand) Execute() {
    c.deleted = c.editor.Content[c.pos : c.pos+c.length]
    c.editor.Content = c.editor.Content[:c.pos] + c.editor.Content[c.pos+c.length:]
}

func (c *DeleteCommand) Undo() {
    c.editor.Content = c.editor.Content[:c.pos] + c.deleted + c.editor.Content[c.pos:]
}

// History manages the undo stack.
type History struct {
    commands []Command
}

func (h *History) Run(cmd Command) {
    cmd.Execute()
    h.commands = append(h.commands, cmd)
}

func (h *History) Undo() bool {
    if len(h.commands) == 0 {
        return false
    }
    last := h.commands[len(h.commands)-1]
    last.Undo()
    h.commands = h.commands[:len(h.commands)-1]
    return true
}`,
        filename: "editor.go",
      },
      {
        code: `package main

import (
    "editor"
    "fmt"
)

func main() {
    e := &editor.Editor{Content: "Hello World"}
    h := &editor.History{}

    fmt.Println("Start:", e.Content)

    h.Run(&editor.InsertCommand{Editor: e, Pos: 5, Text: " Beautiful"})
    fmt.Println("After insert:", e.Content)

    h.Run(&editor.DeleteCommand{Editor: e, Pos: 0, Length: 6})
    fmt.Println("After delete:", e.Content)

    h.Undo()
    fmt.Println("After undo:", e.Content)

    h.Undo()
    fmt.Println("After undo:", e.Content)
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `Start: Hello World
After insert: Hello Beautiful World
After delete: Beautiful World
After undo: Hello Beautiful World
After undo: Hello World`,

    whenToUse: [
      "You need undo/redo functionality.",
      "You want to queue, schedule, or log operations.",
      "You need to parameterize objects with operations (callback-like patterns).",
      "For simple one-off commands without undo, a plain function value is sufficient.",
    ],

    whenNotToUse: [
      "The operations are fire-and-forget with no need for undo, queuing, or logging. A function call is simpler.",
      "In Go, if your 'command' has no state and no undo, a func() is the command. Don't wrap it in a struct.",
    ],

    alternativeNote: "When you don't need undo, a Go function value is the simplest command. queue := []func(){} — push functions onto it, pop and call. Only use the struct-based form when you need Undo() or command metadata.",

    advantages: [
      "Decouples the invoker from the operation — the caller doesn't need to know what happens.",
      "Enables undo, redo, queuing, and logging of operations.",
      "Commands can be serialized, transmitted, and replayed.",
    ],
    disadvantages: [
      "Each operation needs its own struct — boilerplate for simple actions.",
      "Undo logic can be complex and error-prone for operations with side effects.",
      "For simple cases, a function value is less ceremony.",
    ],

    relatedPatterns: [
      { slug: "chain-of-responsibility", relation: "Commands can be handlers in a chain." },
      { slug: "memento", relation: "Memento can save state for more complex undo scenarios." },
      { slug: "strategy", relation: "Both encapsulate algorithms; Command adds undo and queuing capabilities." },
    ],
  },

  "iterator": {
    intentDetail: `Iterator provides a way to traverse elements of a collection without exposing its internal structure. Go 1.23 introduced range-over-func (iter.Seq[T]) as a first-class language feature for this, making external iterator structs largely unnecessary.

This is one of the patterns most transformed by Go's evolution. Before 1.23, you'd use channels or explicit Next()/Value() structs. Now, an iter.Seq[T] function is the idiomatic choice.`,

    problem: `You have a binary tree and need to traverse it in-order. Without an iterator abstraction, the traversal logic gets embedded in every function that processes the tree — search, print, collect, filter all duplicate the walk.`,

    problemCode: `package tree

import "fmt"

type Node struct {
    Value int
    Left  *Node
    Right *Node
}

// Every consumer duplicates the traversal logic
func PrintInOrder(n *Node) {
    if n == nil { return }
    PrintInOrder(n.Left)
    fmt.Println(n.Value)
    PrintInOrder(n.Right)
}

func SumInOrder(n *Node) int {
    if n == nil { return 0 }
    return SumInOrder(n.Left) + n.Value + SumInOrder(n.Right)
}

func CollectInOrder(n *Node) []int {
    if n == nil { return nil }
    result := CollectInOrder(n.Left)
    result = append(result, n.Value)
    result = append(result, CollectInOrder(n.Right)...)
    return result
}
// Same walk, three copies. Adding pre-order or post-order multiplies this.`,
    problemCodeFile: "duplicated_walk.go",

    problemExplain: `The traversal logic (go left, visit, go right) is copy-pasted into every function that needs to process the tree. Adding a new traversal order means duplicating all the processing functions.`,

    solutionIntro: `With Go 1.23's range-over-func, define an iterator that yields values. Consumers use a plain for-range loop — the traversal logic is written once.`,

    diagram: `┌─────────────┐
│  Node.All() │──► iter.Seq[int]
└──────┬──────┘
       │
  for v := range node.All() {
      // v is each value, in order
  }`,
    diagramCaption: "iter.Seq[int] is a function type that yields values into a for-range loop.",

    solutionSteps: [
      {
        prose: "The primary Go 1.23+ approach — range-over-func:",
        code: `package tree

import "iter"

type Node struct {
    Value int
    Left  *Node
    Right *Node
}

// InOrder returns an iterator over the tree's values in-order.
// iter.Seq[int] is func(yield func(int) bool).
func (n *Node) InOrder() iter.Seq[int] {
    return func(yield func(int) bool) {
        if n == nil {
            return
        }
        // Yield left subtree
        for v := range n.Left.InOrder() {
            if !yield(v) {
                return
            }
        }
        // Yield current node
        if !yield(n.Value) {
            return
        }
        // Yield right subtree
        for v := range n.Right.InOrder() {
            if !yield(v) {
                return
            }
        }
    }
}`,
        filename: "tree.go",
      },
      {
        prose: "Consumers use a plain for-range — no iterator boilerplate:",
        code: `package main

import (
    "fmt"
    "tree"
)

func main() {
    root := &tree.Node{
        Value: 4,
        Left: &tree.Node{
            Value: 2,
            Left:  &tree.Node{Value: 1},
            Right: &tree.Node{Value: 3},
        },
        Right: &tree.Node{
            Value: 6,
            Left:  &tree.Node{Value: 5},
            Right: &tree.Node{Value: 7},
        },
    }

    // Print all values
    fmt.Print("In-order: ")
    for v := range root.InOrder() {
        fmt.Printf("%d ", v)
    }
    fmt.Println()

    // Sum — same iterator, different consumer
    sum := 0
    for v := range root.InOrder() {
        sum += v
    }
    fmt.Println("Sum:", sum)

    // Early termination — break works naturally
    fmt.Print("First 3: ")
    count := 0
    for v := range root.InOrder() {
        fmt.Printf("%d ", v)
        count++
        if count == 3 {
            break
        }
    }
    fmt.Println()
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `In-order: 1 2 3 4 5 6 7
Sum: 28
First 3: 1 2 3`,

    whenToUse: [
      "You need to traverse a data structure without exposing its internals.",
      "Multiple consumers need different processing of the same traversal.",
      "You want lazy evaluation — don't build a full slice when you only need the first few elements.",
      "You're on Go 1.23+ — use iter.Seq[T] as the primary approach.",
    ],

    whenNotToUse: [
      "A simple slice covers your needs. []T with a for-range loop is the simplest iterator.",
      "The collection is small and fits in memory — just return a slice from a method.",
      "You need bidirectional iteration (prev/next) — iter.Seq doesn't support this naturally.",
    ],

    alternativeNote: "For simple collections, returning a []T slice is perfectly idiomatic Go. Only reach for iter.Seq when you need lazy evaluation, custom traversal orders, or iteration over structures where materializing all values would be expensive.",

    advantages: [
      "Traversal logic written once, used by any consumer.",
      "Lazy — values are produced on demand, break stops iteration.",
      "Integrates with Go's for-range syntax — feels native.",
      "No need for Close() or cleanup (unlike channel-based iterators).",
    ],
    disadvantages: [
      "Requires Go 1.23+ for iter.Seq.",
      "Recursive iterators (like tree traversal) have some overhead per yield.",
      "Not bidirectional — you can't go backwards.",
      "Debugging yield-based iteration can be less intuitive than explicit loops.",
    ],

    relatedPatterns: [
      { slug: "composite", relation: "Iterators are a natural way to traverse composite structures." },
      { slug: "visitor", relation: "Visitor uses double dispatch to process elements; Iterator provides sequential access." },
    ],
  },

  "mediator": {
    intentDetail: `Mediator defines a central coordinator that colleagues call instead of calling each other directly. It reduces the mesh of dependencies between components to a star topology — everyone talks to the mediator, not to each other.

In Go, the mediator is a struct that holds references to the participants and routes messages between them.`,

    problem: `You're building a chat room system. Without a mediator, each user must hold references to every other user and send messages directly. Adding or removing users means updating everyone's contact list.`,

    problemCode: `package chat

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
// This is O(n²) connections.`,
    problemCodeFile: "mesh.go",

    problemExplain: `Each participant directly references every other participant. The number of connections grows quadratically. Adding, removing, or filtering participants requires modifying everyone.`,

    solutionIntro: `Introduce a ChatRoom mediator. Users register with the room and send messages through it. The room decides who receives each message.`,

    diagram: `     ┌─────────────────┐
     │   ChatRoom       │
     │   (mediator)     │
     │                  │
     │ Broadcast(msg)   │
     └──┬────┬────┬─────┘
        │    │    │
   ┌────▼┐ ┌▼────▼┐
   │UserA│ │UserB │  ...
   └─────┘ └──────┘`,
    diagramCaption: "Users communicate through the mediator, not directly with each other.",

    solutionSteps: [
      {
        code: `package chat

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
    fmt.Printf("%s sends: %s\\n", u.Name, message)
    u.room.Broadcast(u, message)
}

func (u *User) Receive(from, message string) {
    fmt.Printf("  %s received from %s: %s\\n", u.Name, from, message)
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
}`,
        filename: "chat.go",
      },
      {
        code: `package main

import "chat"

func main() {
    room := chat.NewChatRoom()

    alice := chat.NewUser("Alice", room)
    bob := chat.NewUser("Bob", room)
    charlie := chat.NewUser("Charlie", room)

    alice.Send("Hello everyone!")
    bob.Send("Hey Alice!")
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `Alice sends: Hello everyone!
  Bob received from Alice: Hello everyone!
  Charlie received from Alice: Hello everyone!
Bob sends: Hey Alice!
  Alice received from Bob: Hey Alice!
  Charlie received from Bob: Hey Alice!`,

    whenToUse: [
      "Many objects communicate in complex ways, creating a web of dependencies.",
      "You want to centralize communication logic so it's easy to change.",
      "You need to add filtering, logging, or routing of messages between participants.",
    ],

    whenNotToUse: [
      "Only two objects communicate — direct references are simpler.",
      "The mediator becomes a god object that knows too much about its participants.",
      "The communication pattern is simple and unlikely to change.",
    ],

    advantages: [
      "Reduces coupling — participants don't reference each other.",
      "Communication logic is centralized and easy to modify.",
      "Easy to add new participants without changing existing ones.",
    ],
    disadvantages: [
      "The mediator can become a god object — all complexity concentrates there.",
      "Single point of failure — if the mediator breaks, everything breaks.",
      "Indirection makes message flow harder to trace.",
    ],

    relatedPatterns: [
      { slug: "facade", relation: "Facade simplifies a subsystem's interface; Mediator coordinates peer interactions." },
      { slug: "observer", relation: "Mediator coordinates directly; Observer uses a publish/subscribe model." },
    ],
  },

  "memento": {
    intentDetail: `Memento captures an object's internal state as an opaque snapshot that can be used to restore the object later, without exposing its internal structure. In Go, this means a type with unexported fields — the originator can set and read them, but external code can only hold the memento, not inspect it.`,

    problem: `You're building a game with save/load functionality. The game state includes player position, health, inventory, and level. You need to snapshot this state and restore it later, but you don't want external code to access or modify the internals of a save.`,

    problemCode: `package game

// Exposing all state publicly for save/restore
type GameState struct {
    PlayerX  int
    PlayerY  int
    Health   int
    Level    int
    Items    []string
}

// Anyone can read and modify a "save" — no encapsulation
// Someone could cheat by editing save.Health = 9999`,
    problemCodeFile: "exposed.go",

    problemExplain: `With public fields, nothing prevents external code from modifying a saved state. The save file is just a mutable struct. There's no encapsulation boundary between "the game engine that creates saves" and "external code that stores them."`,

    solutionIntro: `Create a memento type with unexported fields in the same package as the originator. External packages can hold a *Memento but can't read or modify its contents.`,

    diagram: `┌──────────────┐  Save()  ┌──────────────┐
│   Game       │────────►│   Memento    │
│ (originator) │         │ (opaque)     │
│              │◄────────│ unexported   │
│  Restore()   │         │ fields       │
└──────────────┘         └──────────────┘
                              │
                    Caretaker holds []Memento
                    but can't read contents`,
    diagramCaption: "The memento's unexported fields enforce encapsulation — only the originator can read/write them.",

    solutionSteps: [
      {
        code: `package game

import "fmt"

// Memento — unexported fields protect the snapshot.
type Memento struct {
    playerX int
    playerY int
    health  int
    level   int
    items   []string
}

// Game is the originator.
type Game struct {
    PlayerX int
    PlayerY int
    Health  int
    Level   int
    Items   []string
}

func (g *Game) Save() *Memento {
    // Deep copy items slice
    items := make([]string, len(g.Items))
    copy(items, g.Items)
    return &Memento{
        playerX: g.PlayerX,
        playerY: g.PlayerY,
        health:  g.Health,
        level:   g.Level,
        items:   items,
    }
}

func (g *Game) Restore(m *Memento) {
    g.PlayerX = m.playerX
    g.PlayerY = m.playerY
    g.Health = m.health
    g.Level = m.level
    g.Items = make([]string, len(m.items))
    copy(g.Items, m.items)
}

func (g *Game) String() string {
    return fmt.Sprintf("Pos(%d,%d) HP=%d Lv=%d Items=%v",
        g.PlayerX, g.PlayerY, g.Health, g.Level, g.Items)
}`,
        filename: "game.go",
      },
      {
        code: `package main

import (
    "fmt"
    "game"
)

func main() {
    g := &game.Game{PlayerX: 0, PlayerY: 0, Health: 100, Level: 1, Items: []string{"sword"}}
    fmt.Println("Start:", g)

    save1 := g.Save()

    g.PlayerX = 10
    g.Health = 50
    g.Items = append(g.Items, "shield")
    fmt.Println("After playing:", g)

    g.Restore(save1)
    fmt.Println("After restore:", g)
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `Start: Pos(0,0) HP=100 Lv=1 Items=[sword]
After playing: Pos(10,0) HP=50 Lv=1 Items=[sword shield]
After restore: Pos(0,0) HP=100 Lv=1 Items=[sword]`,

    whenToUse: [
      "You need save/restore or undo functionality with encapsulated state.",
      "External code should be able to hold snapshots but not inspect or modify them.",
      "The state to capture is complex (multiple fields, nested structures).",
    ],

    whenNotToUse: [
      "The state is simple and public anyway — just copy the struct.",
      "Snapshots would consume too much memory (large or frequent states).",
      "You only need undo for individual operations — Command with Undo() is lighter.",
    ],

    advantages: [
      "Preserves encapsulation — external code can't tamper with snapshots.",
      "Clean separation between the originator (creates/restores) and caretaker (stores).",
      "Go's unexported fields naturally enforce the opaqueness.",
    ],
    disadvantages: [
      "Memory cost — each snapshot is a full copy of the state.",
      "The originator must deep-copy reference types (slices, maps) to prevent sharing.",
      "The opaque memento means debugging saved states requires the originator's help.",
    ],

    relatedPatterns: [
      { slug: "command", relation: "Command can use Memento for complex undo (when reversing the operation isn't enough)." },
      { slug: "prototype", relation: "Both involve copying state; Prototype clones for creation, Memento captures for restoration." },
    ],
  },

  "observer": {
    intentDetail: `Observer establishes a one-to-many relationship: when one object (the subject) changes state, all registered observers are notified automatically. In Go, observers can be interface values, function values, or channels. Each approach has different trade-offs around lifecycle, concurrency, and coupling.`,

    problem: `You're building an order system. When an order status changes, the UI needs to update, an email needs to be sent, and analytics need to be tracked. Hardcoding all three responses into the order update function means every new listener requires modifying core business logic.`,

    problemCode: `package orders

func (o *Order) SetStatus(s Status) {
    o.Status = s
    // Direct coupling to every listener
    updateUI(o)
    sendStatusEmail(o)
    trackAnalytics("status_change", o.ID)
    // Adding webhook notification? Edit this function.
    // Adding audit logging? Edit this function.
}`,
    problemCodeFile: "coupled.go",

    problemExplain: `The order type directly calls every subsystem that cares about status changes. Adding a new listener requires modifying SetStatus. The order package imports UI, email, and analytics packages — a dependency mess.`,

    solutionIntro: `Define an Observer interface and let the subject maintain a list of observers. When state changes, iterate the list and notify each one. Observers register and unregister themselves.`,

    diagram: `┌─────────────────┐
│   OrderSubject  │
│─────────────────│
│ Subscribe(obs)  │
│ Unsubscribe(obs)│
│ Notify()        │
│ observers []Obs │
└────────┬────────┘
         │ notifies
   ┌─────┼──────┐
   │     │      │
 Email  UI   Analytics`,
    diagramCaption: "The subject notifies all registered observers without knowing their concrete types.",

    solutionSteps: [
      {
        code: `package orders

import "fmt"

type Status string

const (
    Pending   Status = "pending"
    Confirmed Status = "confirmed"
    Shipped   Status = "shipped"
)

type Order struct {
    ID     string
    Status Status
}

// Observer receives order updates.
type Observer interface {
    OnOrderUpdate(order Order)
}

// Subject manages observers and notifications.
type Subject struct {
    observers []Observer
}

func (s *Subject) Subscribe(obs Observer) {
    s.observers = append(s.observers, obs)
}

func (s *Subject) Unsubscribe(obs Observer) {
    for i, o := range s.observers {
        if o == obs {
            s.observers = append(s.observers[:i], s.observers[i+1:]...)
            return
        }
    }
}

func (s *Subject) Notify(order Order) {
    for _, obs := range s.observers {
        obs.OnOrderUpdate(order)
    }
}

// OrderService combines business logic with observer notifications.
type OrderService struct {
    Subject
    orders map[string]*Order
}

func NewOrderService() *OrderService {
    return &OrderService{orders: make(map[string]*Order)}
}

func (s *OrderService) UpdateStatus(id string, status Status) {
    order, ok := s.orders[id]
    if !ok {
        order = &Order{ID: id}
        s.orders[id] = order
    }
    order.Status = status
    s.Notify(*order)
}`,
        filename: "orders.go",
      },
      {
        prose: "Observers implement the interface independently:",
        code: `package main

import (
    "fmt"
    "orders"
)

type EmailNotifier struct{}

func (e *EmailNotifier) OnOrderUpdate(o orders.Order) {
    fmt.Printf("[email] Order %s is now %s\\n", o.ID, o.Status)
}

type AnalyticsTracker struct{}

func (a *AnalyticsTracker) OnOrderUpdate(o orders.Order) {
    fmt.Printf("[analytics] track order=%s status=%s\\n", o.ID, o.Status)
}

func main() {
    svc := orders.NewOrderService()

    email := &EmailNotifier{}
    analytics := &AnalyticsTracker{}

    svc.Subscribe(email)
    svc.Subscribe(analytics)

    svc.UpdateStatus("ORD-1", orders.Confirmed)
    svc.UpdateStatus("ORD-1", orders.Shipped)
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `[email] Order ORD-1 is now confirmed
[analytics] track order=ORD-1 status=confirmed
[email] Order ORD-1 is now shipped
[analytics] track order=ORD-1 status=shipped`,

    whenToUse: [
      "Multiple independent components need to react to changes in another component.",
      "You want to add new reactions without modifying the thing that changes.",
      "The set of listeners is dynamic — subscribers come and go at runtime.",
    ],

    whenNotToUse: [
      "You have exactly one listener and it won't change. A direct function call is simpler.",
      "Notification ordering matters — Observer doesn't guarantee order.",
      "The observer needs to send data back to the subject — this creates circular dependencies.",
    ],

    advantages: [
      "Subject and observers are decoupled — the subject doesn't import observer packages.",
      "New observers can be added without modifying existing code.",
      "Dynamic subscription at runtime.",
    ],
    disadvantages: [
      "Notification order is undefined — don't depend on it.",
      "Memory leaks if observers aren't unsubscribed (goroutines, long-lived objects).",
      "In concurrent Go, the observer list needs synchronization (sync.Mutex or sync.RWMutex).",
      "Debugging notification chains can be difficult — 'who's listening?' isn't obvious from the code.",
    ],

    relatedPatterns: [
      { slug: "mediator", relation: "Mediator centralizes communication; Observer decentralizes it via pub/sub." },
      { slug: "command", relation: "Commands can be queued as a form of event notification." },
    ],
  },

  "state": {
    intentDetail: `State lets an object change its behavior when its internal state changes, as if it changed its type. In Go, the state is an interface, and the context struct holds the current state and delegates behavior to it. State transitions return the next state, keeping the transition logic close to the states themselves.`,

    problem: `You're building a vending machine. Its behavior depends on whether it has items, whether money has been inserted, and whether an item is being dispensed. A single type with conditionals checking state at every method becomes a mess.`,

    problemCode: `package vending

type Machine struct {
    state   string
    balance int
    items   int
}

func (m *Machine) InsertCoin(amount int) {
    switch m.state {
    case "idle":
        m.balance += amount
        m.state = "has_money"
    case "has_money":
        m.balance += amount
    case "dispensing":
        // can't insert while dispensing — but this check is scattered everywhere
    case "sold_out":
        // return the coin
    }
    // Every method has this switch. Every new state adds a case everywhere.
}`,
    problemCodeFile: "state_switches.go",

    problemExplain: `State logic is scattered across every method. Adding a new state (e.g., "maintenance") means adding a case to every switch in every method. States and their transitions are implicit — you have to read all the switches to understand the state machine.`,

    solutionIntro: `Define a State interface. Each state is a struct implementing the interface. The machine delegates to the current state, and transitions happen by replacing the current state.`,

    diagram: `┌──────────────────┐
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
└── SoldOutState`,
    diagramCaption: "The machine delegates to the current State. Transitions swap the state object.",

    solutionSteps: [
      {
        code: `package vending

import "fmt"

type State interface {
    InsertCoin(m *Machine, amount int)
    Dispense(m *Machine)
    String() string
}

type Machine struct {
    state   State
    Balance int
    Items   int
}

func NewMachine(items int) *Machine {
    m := &Machine{Items: items}
    if items > 0 {
        m.state = &IdleState{}
    } else {
        m.state = &SoldOutState{}
    }
    return m
}

func (m *Machine) SetState(s State) { m.state = s }

func (m *Machine) InsertCoin(amount int) {
    m.state.InsertCoin(m, amount)
}

func (m *Machine) Dispense() {
    m.state.Dispense(m)
}

// IdleState — waiting for money
type IdleState struct{}

func (s *IdleState) InsertCoin(m *Machine, amount int) {
    m.Balance += amount
    fmt.Printf("Inserted %d cents. Balance: %d\\n", amount, m.Balance)
    m.SetState(&HasMoneyState{})
}

func (s *IdleState) Dispense(m *Machine) {
    fmt.Println("Insert coin first.")
}

func (s *IdleState) String() string { return "idle" }

// HasMoneyState — money inserted, ready to dispense
type HasMoneyState struct{}

func (s *HasMoneyState) InsertCoin(m *Machine, amount int) {
    m.Balance += amount
    fmt.Printf("Added %d cents. Balance: %d\\n", amount, m.Balance)
}

func (s *HasMoneyState) Dispense(m *Machine) {
    if m.Balance < 100 {
        fmt.Printf("Not enough. Need 100, have %d\\n", m.Balance)
        return
    }
    m.Balance -= 100
    m.Items--
    fmt.Println("Dispensing item...")
    if m.Items == 0 {
        m.SetState(&SoldOutState{})
    } else {
        m.SetState(&IdleState{})
    }
}

func (s *HasMoneyState) String() string { return "has_money" }

// SoldOutState — no items left
type SoldOutState struct{}

func (s *SoldOutState) InsertCoin(m *Machine, amount int) {
    fmt.Println("Machine is sold out. Returning coin.")
}

func (s *SoldOutState) Dispense(m *Machine) {
    fmt.Println("Sold out.")
}

func (s *SoldOutState) String() string { return "sold_out" }`,
        filename: "vending.go",
      },
      {
        code: `package main

import "vending"

func main() {
    m := vending.NewMachine(2)
    m.Dispense()
    m.InsertCoin(50)
    m.Dispense()
    m.InsertCoin(50)
    m.Dispense()
    m.InsertCoin(100)
    m.Dispense()
    m.InsertCoin(100)
    m.Dispense()
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `Insert coin first.
Inserted 50 cents. Balance: 50
Not enough. Need 100, have 50
Added 50 cents. Balance: 100
Dispensing item...
Inserted 100 cents. Balance: 100
Dispensing item...
Machine is sold out. Returning coin.
Sold out.`,

    whenToUse: [
      "An object's behavior differs significantly based on its current state.",
      "You have large switch/if-else blocks checking a state field in every method.",
      "State transitions are complex and you want them explicitly modeled.",
    ],

    whenNotToUse: [
      "There are only two or three states with trivial behavior differences. A boolean or enum is simpler.",
      "The state machine is better expressed as a state-transition table (map of state × event → next state).",
    ],

    advantages: [
      "Each state's behavior is isolated in its own type — Single Responsibility.",
      "Adding a new state doesn't require modifying existing states.",
      "State transitions are explicit and easy to trace.",
    ],
    disadvantages: [
      "More types — one per state plus the State interface.",
      "States that need to access the machine's internals get a *Machine reference, which can feel like a circular dependency.",
      "For simple state machines, the pattern is heavier than a switch.",
    ],

    relatedPatterns: [
      { slug: "strategy", relation: "Both delegate to interchangeable implementations. State changes the implementation internally; Strategy is set externally." },
      { slug: "command", relation: "Commands can trigger state transitions." },
    ],
  },

  "strategy": {
    intentDetail: `Strategy defines a family of algorithms and makes them interchangeable. In Go, the most idiomatic form is a function type — you pass a function value rather than creating an interface with a single method. Use the interface form when the strategy has multiple methods or carries state.

This is one of the patterns that becomes nearly invisible in Go. When someone passes a func to a constructor or a sort.Slice call, they're using Strategy without naming it.`,

    problem: `You're building a payment processing system. Different payment methods (credit card, PayPal, crypto) have different processing logic. A switch on the payment type in the processing function means every new method requires modifying the core code.`,

    problemCode: `func ProcessPayment(method string, amount int64) error {
    switch method {
    case "credit_card":
        return chargeCreditCard(amount)
    case "paypal":
        return chargePayPal(amount)
    case "crypto":
        return chargeCrypto(amount)
    default:
        return fmt.Errorf("unsupported: %s", method)
    }
}`,
    problemCodeFile: "switch_payment.go",

    problemExplain: `Every new payment method means editing this function. The switch is stringly typed. And you can't test one payment method without having the code for all of them compiled in.`,

    solutionIntro: `In Go, the simplest strategy is a function type. Define ProcessFunc and pass it to whoever needs it. No interface, no struct — just a function.`,

    diagram: `type ProcessFunc func(amount int64) error

ProcessPayment(amount, strategy)

strategy = chargeCreditCard  ──► func(int64) error
strategy = chargePayPal      ──► func(int64) error
strategy = chargeCrypto      ──► func(int64) error`,
    diagramCaption: "Each payment strategy is a plain function value. No interface ceremony needed.",

    solutionSteps: [
      {
        prose: "The function-type approach — idiomatic Go:",
        code: `package payment

import "fmt"

// ProcessFunc is a strategy for processing payments.
type ProcessFunc func(amount int64) error

func CreditCard(amount int64) error {
    fmt.Printf("Charging credit card: $%.2f\\n", float64(amount)/100)
    return nil
}

func PayPal(amount int64) error {
    fmt.Printf("Charging PayPal: $%.2f\\n", float64(amount)/100)
    return nil
}

func Crypto(amount int64) error {
    fmt.Printf("Charging crypto: $%.2f\\n", float64(amount)/100)
    return nil
}

// ProcessPayment accepts the strategy as a function.
func ProcessPayment(amount int64, process ProcessFunc) error {
    fmt.Println("Validating payment...")
    return process(amount)
}`,
        filename: "payment.go",
      },
      {
        prose: "When a strategy needs state or multiple methods, use an interface instead:",
        code: `package payment

import "fmt"

// PaymentGateway — interface form for strategies with state.
type PaymentGateway interface {
    Charge(amount int64) error
    Refund(txnID string) error
}

type StripeGateway struct {
    APIKey string
}

func (s *StripeGateway) Charge(amount int64) error {
    fmt.Printf("[Stripe] charge $%.2f\\n", float64(amount)/100)
    return nil
}

func (s *StripeGateway) Refund(txnID string) error {
    fmt.Printf("[Stripe] refund %s\\n", txnID)
    return nil
}`,
        filename: "gateway.go",
      },
      {
        code: `package main

import (
    "fmt"
    "payment"
)

func main() {
    // Function-type strategy
    payment.ProcessPayment(4999, payment.CreditCard)
    payment.ProcessPayment(2500, payment.PayPal)

    // Interface strategy — when you need state or multiple methods
    gw := &payment.StripeGateway{APIKey: "sk_test"}
    gw.Charge(9999)
    gw.Refund("txn_123")
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `Validating payment...
Charging credit card: $49.99
Validating payment...
Charging PayPal: $25.00
[Stripe] charge $99.99
[Stripe] refund txn_123`,

    whenToUse: [
      "You see a switch or if/else selecting an algorithm based on a type or configuration.",
      "The algorithm should be interchangeable at runtime.",
      "You want to test business logic independently of the algorithm choice.",
      "In Go: if the strategy is a single function, use a function type. If it has state or multiple methods, use an interface.",
    ],

    whenNotToUse: [
      "There's only one algorithm and no expectation of alternatives. Just call the function directly.",
      "The algorithms are trivially different. Abstracting them adds ceremony without value.",
    ],

    alternativeNote: "In Go, a function type IS a strategy. sort.Slice(data, func(i, j int) bool { ... }) is Strategy. You don't need an interface for single-method strategies — a func type is simpler and more idiomatic.",

    advantages: [
      "Algorithms are interchangeable without modifying the context.",
      "Each strategy is independently testable.",
      "Function types make it extremely lightweight — no struct or interface needed.",
    ],
    disadvantages: [
      "Function types can't carry state (without closures).",
      "With many strategies, the caller must know which to select (the switch moves to the caller).",
      "Abstraction has a readability cost — direct calls are easier to trace.",
    ],

    relatedPatterns: [
      { slug: "bridge", relation: "Bridge separates two dimensions; Strategy varies one dimension." },
      { slug: "state", relation: "Both swap behavior at runtime. Strategy is chosen externally; State transitions internally." },
      { slug: "template-method", relation: "Template Method uses inheritance for variation points; Strategy uses composition." },
      { slug: "command", relation: "Both encapsulate behavior as a value. Command adds undo and queuing." },
    ],
  },

  "template-method": {
    intentDetail: `Template Method defines the skeleton of an algorithm in a base class, letting subclasses override specific steps. In Go, this pattern fights the language — there's no inheritance, no abstract classes, no method overriding. But the problem it solves is real: you need a fixed algorithm structure with pluggable steps.

The Go solution: pass the variable steps as function values or interfaces via composition. This achieves the same result without fighting the language.`,

    problem: `You're building data importers for different file formats (CSV, JSON, XML). The overall process is the same: open the file, parse records, validate each record, save to database. The parsing step differs per format, but the skeleton is identical.`,

    problemCode: `package importer

func ImportCSV(path string) error {
    data := readFile(path)
    records := parseCSV(data)
    for _, r := range records {
        if err := validate(r); err != nil { continue }
        save(r)
    }
    return nil
}

func ImportJSON(path string) error {
    data := readFile(path)
    records := parseJSON(data)
    for _, r := range records {
        if err := validate(r); err != nil { continue }
        save(r)
    }
    return nil
}

// The skeleton (read → parse → validate → save) is duplicated.
// Only the parse step differs. Adding XML means copying again.`,
    problemCodeFile: "duplicated.go",

    problemExplain: `The algorithm skeleton is copied for every format. The validation and save logic is duplicated. Adding a new format means copying the whole function and changing one line.`,

    solutionIntro: `In Go, inject the variable step as a function parameter. The skeleton is written once; the specific parser is passed in.`,

    diagram: `Import(path, parser)
  │
  ├── readFile(path)        ← fixed
  ├── parser(data)          ← injected
  ├── validate(record)      ← fixed
  └── save(record)          ← fixed

parser = parseCSV  │ parseJSON │ parseXML`,
    diagramCaption: "The algorithm skeleton is fixed. Only the parse step is injected as a function value.",

    solutionSteps: [
      {
        prose: "Inject the variable step as a function parameter:",
        code: `package importer

import "fmt"

type Record struct {
    ID   string
    Name string
}

// ParseFunc is the pluggable step — the "template method" in Go terms.
type ParseFunc func(data []byte) ([]Record, error)

// Import is the algorithm skeleton — written once.
func Import(path string, parse ParseFunc) error {
    fmt.Printf("Reading file: %s\\n", path)
    data := readFile(path) // fixed step

    records, err := parse(data) // pluggable step
    if err != nil {
        return fmt.Errorf("parse error: %w", err)
    }

    for _, r := range records {
        if err := validate(r); err != nil { // fixed step
            fmt.Printf("  Skip invalid: %s\\n", r.ID)
            continue
        }
        save(r) // fixed step
    }
    return nil
}

func readFile(path string) []byte {
    return []byte(fmt.Sprintf("data from %s", path))
}

func validate(r Record) error {
    if r.ID == "" {
        return fmt.Errorf("missing ID")
    }
    return nil
}

func save(r Record) {
    fmt.Printf("  Saved: %s (%s)\\n", r.ID, r.Name)
}`,
        filename: "importer.go",
      },
      {
        prose: "Define parsers as plain functions:",
        code: `package importer

// CSV parser
func ParseCSV(data []byte) ([]Record, error) {
    return []Record{
        {ID: "1", Name: "Alice"},
        {ID: "2", Name: "Bob"},
    }, nil
}

// JSON parser
func ParseJSON(data []byte) ([]Record, error) {
    return []Record{
        {ID: "3", Name: "Charlie"},
        {ID: "", Name: "Invalid"},
    }, nil
}`,
        filename: "parsers.go",
      },
      {
        code: `package main

import "importer"

func main() {
    importer.Import("users.csv", importer.ParseCSV)
    importer.Import("users.json", importer.ParseJSON)
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `Reading file: users.csv
  Saved: 1 (Alice)
  Saved: 2 (Bob)
Reading file: users.json
  Saved: 3 (Charlie)
  Skip invalid:`,

    whenToUse: [
      "You have an algorithm with a fixed structure and one or two steps that vary.",
      "In Go: use this when you'd use Template Method in Java — but pass function values instead of overriding methods.",
    ],

    whenNotToUse: [
      "Most or all steps vary — you don't have a fixed skeleton, you have a completely different algorithm. Use Strategy instead.",
      "The skeleton is trivial (2–3 lines). Just inline it.",
    ],

    alternativeNote: "In Go, Template Method as described in the GoF book (using inheritance and method overriding) is impossible and should not be attempted. The idiomatic Go solution — injecting hook functions or accepting an interface with the variable steps — achieves the same goal through composition. This is the recommended approach.",

    advantages: [
      "The algorithm skeleton is written once — no duplication.",
      "New variations only need to implement the pluggable steps.",
      "In Go, function injection is lightweight and doesn't require new types.",
    ],
    disadvantages: [
      "If there are many hooks, the function signature becomes unwieldy (consider a struct of functions or an interface).",
      "The fixed steps can't be customized — that's by design but can be limiting.",
    ],

    relatedPatterns: [
      { slug: "strategy", relation: "Strategy replaces the whole algorithm; Template Method replaces steps within a fixed skeleton." },
      { slug: "factory-method", relation: "Factory Method is often a specific step within a Template Method skeleton." },
    ],
  },

  "visitor": {
    intentDetail: `Visitor separates an algorithm from the object structure it operates on, using double dispatch to invoke the right method for each element type. In Go, this requires an Accept(Visitor) method on every element and a Visit method per type on the visitor.

Here's the honest truth: Visitor is verbose in Go and often not the best choice. The Go alternative — a type switch — is simpler and covers most use cases. Use Visitor when you need the open/closed principle for operations (adding new operations without modifying element types). Use type-switch when you need simplicity and your element types are stable.`,

    problem: `You have an AST (abstract syntax tree) with different node types — numbers, binary operations, unary operations. You need to evaluate, pretty-print, and type-check the tree. Without Visitor, each new operation requires modifying every node type.`,

    problemCode: `package ast

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

// Every new operation bloats every node type.`,
    problemCodeFile: "bloated_ast.go",

    problemExplain: `Each new operation (TypeCheck, Optimize, Compile) adds a method to every node type. The node types become dumping grounds for unrelated operations. And you can't add operations from outside the package.`,

    solutionIntro: `Define a Visitor interface with one Visit method per node type. Each node has Accept(Visitor) that calls the appropriate Visit method. New operations are new Visitor implementations — node types don't change.`,

    diagram: `Visitor interface              Element interface
├── VisitNumber(NumberNode)    ├── Accept(Visitor)
├── VisitAdd(AddNode)          │
├── VisitMul(MulNode)          NumberNode.Accept(v) → v.VisitNumber(n)
                               AddNode.Accept(v)    → v.VisitAdd(n)`,
    diagramCaption: "Double dispatch: Accept calls the right Visit method, which knows the concrete type.",

    solutionSteps: [
      {
        prose: "Define the visitor and element interfaces:",
        code: `package ast

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
func (n *MulNode) Accept(v Visitor) interface{}    { return v.VisitMul(n) }`,
        filename: "ast.go",
      },
      {
        prose: "Each operation is a Visitor implementation — no node modifications needed:",
        code: `package ast

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
}`,
        filename: "visitors.go",
      },
      {
        prose: "And here's the simpler type-switch alternative for comparison:",
        code: `package ast

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
}`,
        filename: "typeswitch_alt.go",
      },
      {
        code: `package main

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
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `Expression: ((3 + 4) * 2)
Result: 14`,

    whenToUse: [
      "You need to add many operations to a stable set of element types.",
      "Operations are the dimension that changes; element types are stable.",
      "You want operations to be defined outside the element types' package.",
    ],

    whenNotToUse: [
      "Element types change frequently — every new type requires updating every Visitor.",
      "You have few operations — type-switch is simpler and more Go-idiomatic.",
      "The double dispatch ceremony (Accept/Visit) feels disproportionate to the problem.",
    ],

    alternativeNote: "In most Go codebases, a type-switch is preferred over Visitor. It's simpler, more readable, and the compiler tells you when you've missed a case (with exhaustive switch linters). Use Visitor only when you truly need the open/closed principle for operations — e.g., a compiler or interpreter where new analysis passes are added frequently but the AST node types are stable.",

    advantages: [
      "Adding new operations doesn't modify element types — Open/Closed for operations.",
      "Each operation is cohesive — all the logic for one operation is in one type.",
      "Can accumulate state across the traversal.",
    ],
    disadvantages: [
      "Extremely verbose in Go — one method per element type in every visitor.",
      "Adding a new element type requires updating every visitor — Open/Closed breaks in the other direction.",
      "The interface{} return type loses type safety (Go generics could help but add complexity).",
      "Double dispatch is unfamiliar to many Go developers.",
    ],

    relatedPatterns: [
      { slug: "composite", relation: "Visitor often operates on Composite structures." },
      { slug: "iterator", relation: "Iterator traverses; Visitor performs operations during traversal." },
    ],
  },
};