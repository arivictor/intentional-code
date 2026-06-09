---
title: Make the next change local. That's the whole job
nav_title: Keep changes local
description: Almost every other principle is downstream of one goal — when the next change comes, it touches one place, not six.
order: 9
---

# Make the next change local. That's the whole job

Strip the field of its vocabulary and almost everything that's left points at one goal: when the next change arrives, it should touch one place, not six. Locality is the payoff. Coupling is the tax you pay against it. Cohesion seeks to ensure that the things that change together stay in the same place. Nearly every principle worth knowing is some specific tactic in service of this one outcome, which is why it's the closest thing this site has to a single job description.

You feel its absence before you can name it. A one-line requirement turns into edits across four packages. A change to the database schema somehow breaks an HTTP handler. Fixing a validation rule forces you to re-test storage. Each of those is locality leaking away, which is a sign that responsibilities have smeared across boundaries that were supposed to contain them.

## Architecture is communication

Locality is also what makes a codebase legible to other people. When boundaries are clear, a newcomer can open the tree and put a new feature in roughly the right place on the first try. Imports read like a map. Pull requests argue about behaviour instead of about where things should live. When the structure drifts, every change reopens the same negotiation in slightly different words — and consistency, here, carries far more weight than cleverness.

## Separation of Concerns

The high-level form of the tenet: each part of a system should address one concern, with explicit boundaries between parts. Isolate what changes together, and a change in one domain stops rippling into the others.

*"Separation of concerns, even if not perfectly possible, is yet the only available technique for effective ordering of one's thoughts."* (Edsger Dijkstra, 1974)

A concern is a distinct responsibility: something a piece of software must do, know, or decide. Separation of Concerns (SoC) says those responsibilities should live in distinct places, with clear boundaries between them. When concerns are mixed, a change in one area ripples unpredictably into others.

SoC is closely related to the Single Responsibility Principle, but it operates at a higher level. SRP says a *type* should have one reason to change. SoC says an entire *layer or module* should address one domain of the problem. Both are expressions of the same underlying idea: isolate what changes together.

---

### The three-layer model

The most common application of SoC in web services is the three-layer architecture: delivery, business logic, and data access. Each layer speaks to one audience and knows nothing of the others' implementation.

```
HTTP handlers  →  domain services  →  storage layer
(delivery)        (business logic)     (persistence)
```

```go
// delivery/order_handler.go — HTTP concerns only.
// Knows about requests, responses, status codes.
// Knows nothing about how orders are validated or stored.

type OrderHandler struct {
    service OrderService
}

func (h *OrderHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req CreateOrderRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }
    order, err := h.service.PlaceOrder(r.Context(), req.UserID, req.Items)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(order)
}
```

```go
// domain/order_service.go — business rules only.
// Knows about validation, pricing, inventory.
// Knows nothing about HTTP or SQL.

type OrderService interface {
    PlaceOrder(ctx context.Context, userID string, items []Item) (Order, error)
}

type orderService struct {
    store    OrderStore
    inventory InventoryChecker
}

func (s *orderService) PlaceOrder(ctx context.Context, userID string, items []Item) (Order, error) {
    if len(items) == 0 {
        return Order{}, errors.New("order must contain at least one item")
    }
    for _, item := range items {
        if !s.inventory.InStock(ctx, item.SKU) {
            return Order{}, fmt.Errorf("item %s is out of stock", item.SKU)
        }
    }
    order := Order{ID: newID(), UserID: userID, Items: items}
    return order, s.store.Save(ctx, order)
}
```

```go
// store/order_store.go — persistence concerns only.
// Knows about SQL, transactions, connection pooling.
// Knows nothing about business rules or HTTP.

type OrderStore interface {
    Save(ctx context.Context, o Order) error
}

type postgresOrderStore struct {
    db *sql.DB
}

func (s *postgresOrderStore) Save(ctx context.Context, o Order) error {
    _, err := s.db.ExecContext(ctx, `
        INSERT INTO orders (id, user_id, total_cents, created_at)
        VALUES ($1, $2, $3, $4)
    `, o.ID, o.UserID, o.TotalCents(), time.Now())
    return fmt.Errorf("saving order: %w", err)
}
```

Each layer can change independently. Replace Postgres with a different database and the business logic and handlers don't move. Change a validation rule and the storage and HTTP layers don't move.

Because the business logic knows nothing of HTTP or SQL, it runs on its own. Here is the domain layer as a small runnable program:

```go:title="main.go":run=true:editable=true
package main

import (
    "errors"
    "fmt"
)

type Item struct {
    SKU   string
    Price int
}

type Order struct {
    UserID string
    Items  []Item
}

// Business rules only. Knows nothing about HTTP or SQL.
func PlaceOrder(userID string, items []Item) (Order, error) {
    if len(items) == 0 {
        return Order{}, errors.New("order must contain at least one item")
    }
    return Order{UserID: userID, Items: items}, nil
}

func main() {
    order, err := PlaceOrder("user-1", []Item{{SKU: "abc", Price: 1000}})
    fmt.Println(order, err)

    _, err = PlaceOrder("user-1", nil)
    fmt.Println("error:", err)
}
```

---

### Concern leakage: the violation

Concern leakage happens when one layer reaches into another's responsibilities.

```go
// BAD — the HTTP handler contains business logic and SQL.
// Three concerns in one place.

func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
    var req struct {
        UserID string  `json:"user_id"`
        Items  []Item  `json:"items"`
    }
    json.NewDecoder(r.Body).Decode(&req)

    // Business rule leaking into handler:
    if len(req.Items) == 0 {
        http.Error(w, "no items", 400)
        return
    }

    // SQL leaking into handler:
    total := 0
    for _, item := range req.Items {
        total += item.Price
    }
    h.db.Exec("INSERT INTO orders (user_id, total) VALUES (?, ?)", req.UserID, total)

    w.WriteHeader(201)
}
```

When the business rule changes (minimum order amount, discount logic, inventory check), you edit the handler. When the database schema changes, you edit the handler. The handler has three reasons to change, which violates both SoC and SRP.

---

### Package boundaries in Go

Go's package system is the natural mechanism for enforcing SoC. A package should represent a single concern. Packages that import each other in cycles are a signal that concerns have leaked; two packages become so entangled that neither can stand alone.

```
cmd/          — entry points, wires dependencies together
internal/
  handler/    — HTTP delivery
  domain/     — business rules and domain types
  store/      — persistence
  notify/     — notifications
```

The dependency graph should be a DAG. `handler` imports `domain`. `store` imports `domain`. `domain` imports nothing internal. `cmd` imports everything and wires it together.

> **Smell:** A handler function imports a SQL package directly. A business logic function constructs an HTTP response. A database struct has a method that sends an email. You need to mock the database to test a business rule.

See also: [Clean Architecture](/go/patterns/architectural/clean-architecture), [Hexagonal Architecture](/go/patterns/architectural/hexagonal), [Repository](/go/patterns/architectural/repository), [SOLID](/go/philosophy/keep-changes-local#solid).
## Law of Demeter

Where Separation of Concerns draws the boundaries, the Law of Demeter keeps you from tunnelling through them. Talk only to your immediate collaborators; every dot in `a.b().c().d()` is a dependency on structure you don't own, and a place a distant change can reach in and break you.

*"Each unit should have only limited knowledge about other units: only units 'closely' related to the current unit."*

The Law of Demeter, also called the Principle of Least Knowledge, says a method should only call methods on:

1. Itself
2. Its parameters
3. Objects it creates directly
4. Its own fields

It should not reach through objects to call methods on *their* collaborators. Each dot in a chain like `order.Customer().Address().City()` is a dependency on the internal structure of an object you don't own. If that structure changes, you break.

The informal version: **don't talk to strangers**.

---

### The violation: method chaining through ownership

```go
// BAD — the handler knows too much about the internal structure of Order.
// If Order.customer changes from a Customer to a CustomerID,
// this handler must change too.

func (h *Handler) ShipOrder(w http.ResponseWriter, r *http.Request) {
    order := h.store.Find(r.URL.Query().Get("id"))

    // Three levels deep — reaching through Order into Customer into Address
    city := order.Customer().Address().City()

    rate := h.shipping.QuoteFor(city)
    // ...
}
```

```go
// GOOD — Order exposes what callers need, hiding its internal structure.
// The handler asks Order for a shipping destination; it doesn't care
// how Order derives that information.

type Order struct {
    customer Customer
}

func (o Order) ShippingDestination() string {
    return o.customer.Address().City()
}

func (h *Handler) ShipOrder(w http.ResponseWriter, r *http.Request) {
    order := h.store.Find(r.URL.Query().Get("id"))
    rate := h.shipping.QuoteFor(order.ShippingDestination())
    // ...
}
```

The navigation from `Order` to city is encapsulated in `Order.ShippingDestination`. The handler's dependency is on `Order`'s interface, not on `Customer` or `Address`.

---

### Detecting violations: count the dots

A single dot is usually fine. Two dots is a yellow flag. Three or more is almost always a violation.

```go
// One dot — fine.
user.Name

// Two dots — possibly fine if the middle type is a value type.
response.Body.Close()

// Three dots — violation. You're navigating through someone else's structure.
app.Config().Database().ConnectionString()
```

The exception: fluent builder patterns are sometimes intentionally chained, like `strings.NewReplacer(...).Replace(s)`. These return `self` at each step rather than reaching into collaborators' internals. That's different from traversing an ownership graph.

---

### Tell, don't ask

The Law of Demeter is related to "Tell, Don't Ask": rather than asking an object for data to make a decision, tell it to make the decision itself.

```go
// ASK — caller fetches data, makes a decision externally.
if order.Status() == "pending" && order.Total() > 10000 {
    order.ApplyDiscount(500)
}

// TELL — caller tells Order to apply its own discount rule.
// Order owns the decision about when it qualifies.
order.ApplyLargeOrderDiscount()
```

```go
// Implementation:
func (o *Order) ApplyLargeOrderDiscount() {
    if o.status == "pending" && o.total > 10000 {
        o.total -= 500
    }
}
```

The decision logic about what counts as a "large order" lives in `Order`. If the threshold changes, you update `Order`, not every caller that was querying its fields. Here it is as a small runnable program:

```go:title="main.go":run=true:editable=true
package main

import "fmt"

// TELL, don't ask: Order owns the decision about when it qualifies.
type Order struct {
    status string
    total  int
}

func (o *Order) ApplyLargeOrderDiscount() {
    if o.status == "pending" && o.total > 10000 {
        o.total -= 500
    }
}

func (o Order) Total() int { return o.total }

func main() {
    big := &Order{status: "pending", total: 25000}
    small := &Order{status: "pending", total: 5000}

    big.ApplyLargeOrderDiscount()
    small.ApplyLargeOrderDiscount()

    fmt.Println("large order total:", big.Total())  // 24500
    fmt.Println("small order total:", small.Total()) // 5000
}
```

---

### In Go: package boundaries as the unit

In Go, the Law of Demeter applies most naturally at the package level. A package should be self-contained. If package A reaches through package B to directly manipulate package C's types, that's a three-layer dependency that should be collapsed.

```go
// BAD — handler package reaches through service package into store package.
func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
    svc := h.services.UserService()
    user, _ := svc.Store().FindByID(r.URL.Query().Get("id")) // reaches into store
    json.NewEncoder(w).Encode(user)
}

// GOOD — handler calls service; service calls store; each layer knows only its neighbour.
func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
    user, err := h.userService.GetByID(r.Context(), r.URL.Query().Get("id"))
    if err != nil {
        http.Error(w, "not found", http.StatusNotFound)
        return
    }
    json.NewEncoder(w).Encode(user)
}
```

> **Smell:** A function chain has more than two dots (excluding nil-safe accessors). Changing a deeply nested struct field breaks code in packages that shouldn't know about that struct. A caller extracts data from an object only to pass it back to that same object.

See also: [Separation of Concerns](/go/philosophy/keep-changes-local#separation-of-concerns), [Clean Architecture](/go/patterns/architectural/clean-architecture), [Facade](/go/patterns/structural/facade).
## SOLID

The most famous set of object-oriented principles is, read through this tenet, five different tactics for keeping change local: a type with one reason to change (SRP), behaviour you extend without editing (OCP), interfaces narrow enough that no client carries what it doesn't use (ISP), and dependencies pointed at abstractions so infrastructure can move without disturbing logic (DIP). Here they are, reinterpreted for Go's implicit-interface, composition-first world.

In Go, three of the five SOLID principles apply almost by default: interfaces are implicit and small by convention (ISP), packages compose rather than inherit (OCP), and focused packages are idiomatic (SRP). The two that need deliberate effort are LSP (which in Go is about behavioral contracts for interface implementors, not subclass hierarchies) and DIP, where Go's "accept interfaces, return structs" idiom replaces abstract classes.

Understanding the principles tells you *why* a design choice is good or bad. Patterns tell you *how* to implement a solution. The principles usually point you to the right pattern, or show you that you don't need one. The [Repository](/go/patterns/architectural/repository) pattern is DIP applied to persistence; [Observer](/go/patterns/behavioral/observer) is OCP applied to event notification; [Strategy](/go/patterns/behavioral/strategy) is OCP applied to interchangeable algorithms.

---

### S: Single Responsibility Principle

*"A module should have one, and only one, reason to change."*

In Go, "module" maps most naturally to a package, and within a package, to a single type or function. A struct that handles HTTP routing, business logic, and database queries has three reasons to change. Split it.

Go's package system encourages this naturally. Small packages with focused APIs are idiomatic. The standard library models this well: `net/http` handles HTTP, `encoding/json` handles JSON; they never mix concerns.

**Before (the violation):**

```go
// user.go — one struct doing everything
type UserService struct {
    db *sql.DB
}

func (s *UserService) Register(w http.ResponseWriter, r *http.Request) {
    var u User
    json.NewDecoder(r.Body).Decode(&u)

    // Validation logic
    if u.Email == "" {
        http.Error(w, "email required", 400)
        return
    }

    // Database logic
    _, err := s.db.Exec("INSERT INTO users ...", u.Email, u.Name)
    if err != nil {
        http.Error(w, "db error", 500)
        return
    }

    // Response formatting
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
```

**After (the principle applied):**

```go
// store/user.go — data access only
type UserStore struct{ db *sql.DB }

func (s *UserStore) Create(u User) error {
    _, err := s.db.Exec("INSERT INTO users ...", u.Email, u.Name)
    return err
}

// validate/user.go — validation only
func ValidateUser(u User) error {
    if u.Email == "" {
        return errors.New("email is required")
    }
    return nil
}

// handler/user.go — HTTP concerns only
type UserHandler struct {
    store    *store.UserStore
    validate func(User) error
}

func (h *UserHandler) Register(w http.ResponseWriter, r *http.Request) {
    var u User
    json.NewDecoder(r.Body).Decode(&u)
    if err := h.validate(u); err != nil {
        http.Error(w, err.Error(), 400)
        return
    }
    if err := h.store.Create(u); err != nil {
        http.Error(w, "internal error", 500)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
```

> **Smell:** You change a type for reasons that have nothing to do with each other. Fixing a validation rule also requires re-testing the database layer, or changing an HTTP response format forces you to touch business logic.

---

### O: Open/Closed Principle

*"Software entities should be open for extension, closed for modification."*

In inheritance-heavy languages, OCP is about subclassing. In Go, it's about interfaces and composition. When you define behavior through an interface, new implementations can be added without modifying existing code.

The key Go insight: small interfaces (one or two methods) make OCP almost free. `io.Reader`, `io.Writer`, `http.Handler`: these tiny interfaces let the entire ecosystem extend behavior without touching the core.

**Before (the violation):**

```go
// notification.go — closed to extension, must modify to add types
func SendNotification(kind string, msg string, recipient string) error {
    switch kind {
    case "email":
        return sendEmail(recipient, msg)
    case "sms":
        return sendSMS(recipient, msg)
    // Every new channel means editing this function
    // and re-testing everything
    default:
        return fmt.Errorf("unknown notification kind: %s", kind)
    }
}
```

**After (the principle applied):**

```go
// notifier.go — open for extension via interface
type Notifier interface {
    Notify(recipient, message string) error
}

type EmailNotifier struct{ smtpAddr string }

func (e *EmailNotifier) Notify(recipient, message string) error {
    fmt.Printf("[email via %s] to %s: %s\n", e.smtpAddr, recipient, message)
    return nil
}

type SMSNotifier struct{ apiKey string }

func (s *SMSNotifier) Notify(recipient, message string) error {
    fmt.Printf("[sms] to %s: %s\n", recipient, message)
    return nil
}

// Adding Slack, push notifications, etc. requires zero changes
// to the Notifier interface or any existing implementation.
func SendAll(notifiers []Notifier, recipient, msg string) error {
    for _, n := range notifiers {
        if err := n.Notify(recipient, msg); err != nil {
            return err
        }
    }
    return nil
}
```

Here the Open/Closed design is a small runnable program:

```go:title="main.go":run=true:editable=true
package main

import "fmt"

// Open for extension via interface.
type Notifier interface {
    Notify(recipient, message string) error
}

type EmailNotifier struct{ smtpAddr string }

func (e *EmailNotifier) Notify(recipient, message string) error {
    fmt.Printf("[email via %s] to %s: %s\n", e.smtpAddr, recipient, message)
    return nil
}

type SMSNotifier struct{ apiKey string }

func (s *SMSNotifier) Notify(recipient, message string) error {
    fmt.Printf("[sms] to %s: %s\n", recipient, message)
    return nil
}

// Adding a new channel requires zero changes to SendAll or any existing type.
func SendAll(notifiers []Notifier, recipient, msg string) error {
    for _, n := range notifiers {
        if err := n.Notify(recipient, msg); err != nil {
            return err
        }
    }
    return nil
}

func main() {
    notifiers := []Notifier{
        &EmailNotifier{smtpAddr: "smtp.example.com"},
        &SMSNotifier{apiKey: "secret"},
    }
    SendAll(notifiers, "alice", "server down")
}
```

> **Smell:** You keep adding cases to a switch or if/else chain. Every new variant requires modifying existing, tested code.

---

### L: Liskov Substitution Principle

*"Subtypes must be substitutable for their base types without altering correctness."*

Go has no subclassing, so LSP applies to interface contracts rather than inheritance hierarchies. Any type that satisfies an interface must honor the behavioral expectations of that interface, not just the method signatures.

If your `io.Reader`'s `Read` method sometimes returns data without advancing, or your `http.Handler` panics instead of writing a response, you've violated LSP. The compiler won't catch this; tests and documentation must.

**Before (the violation):**

```go
// Violating LSP — a "Reader" that doesn't behave like one
type AlwaysEmptyReader struct{}

func (r *AlwaysEmptyReader) Read(p []byte) (int, error) {
    // Returns 0, nil — violates the io.Reader contract
    // which states: "When Read returns 0, err should be non-nil"
    // Callers spinning in a loop will hang forever.
    return 0, nil
}

func Process(r io.Reader) error {
    buf := make([]byte, 1024)
    for {
        n, err := r.Read(buf)
        if n > 0 {
            handle(buf[:n])
        }
        if err == io.EOF {
            return nil
        }
        if err != nil {
            return err
        }
        // With AlwaysEmptyReader: infinite loop, no progress
    }
}
```

**After (the principle applied):**

```go
// Honoring the io.Reader contract
type LimitedReader struct {
    data []byte
    pos  int
}

func (r *LimitedReader) Read(p []byte) (int, error) {
    if r.pos >= len(r.data) {
        return 0, io.EOF // Contract: 0 bytes = non-nil error
    }
    n := copy(p, r.data[r.pos:])
    r.pos += n
    return n, nil
}

// Any function accepting io.Reader works correctly with this type.
// That's LSP: substitutability through behavioral correctness.
```

> **Smell:** A function accepting an interface has to check the concrete type to decide how to behave, or documentation says "this implementation doesn't support X" where X is part of the interface contract.

---

### I: Interface Segregation Principle

*"No client should be forced to depend on methods it does not use."*

This is where Go shines. Interfaces in Go are implicitly satisfied and idiomatically small, often just one method. `io.Reader`, `io.Writer`, `fmt.Stringer`, `sort.Interface`: the standard library is built on tiny, focused interfaces.

The "accept interfaces, return structs" proverb is ISP distilled. When your function only needs to read, accept an `io.Reader`, not an `*os.File`. When you only need to close, accept an `io.Closer`.

ISP is so natural in Go that violating it takes deliberate effort. If you find yourself defining an interface with five or more methods, stop and ask whether every consumer actually needs all of them.

**Before (the violation):**

```go
// A fat interface that forces implementors to provide everything
type DataStore interface {
    Get(id string) (Record, error)
    List() ([]Record, error)
    Create(Record) error
    Update(Record) error
    Delete(id string) error
    Search(query string) ([]Record, error)
    Export(format string) ([]byte, error)
    ImportBatch([]Record) error
}

// A read-only report generator forced to implement writes
type ReportService struct{}

func (s *ReportService) Create(r Record) error { panic("not supported") }
func (s *ReportService) Update(r Record) error { panic("not supported") }
func (s *ReportService) Delete(id string) error { panic("not supported") }
// ... forced to implement everything just to satisfy the interface
```

**After (the principle applied):**

```go
// Small, focused interfaces — Go's natural strength
type Reader interface {
    Get(id string) (Record, error)
}

type Lister interface {
    List() ([]Record, error)
}

type Writer interface {
    Create(Record) error
    Update(Record) error
    Delete(id string) error
}

// Compose when you need multiple capabilities
type ReadWriter interface {
    Reader
    Writer
}

// Functions accept only what they need
func GenerateReport(src Lister) (Report, error) {
    records, err := src.List()
    return buildReport(records), err
}
```

> **Smell:** You're writing `panic("not implemented")` or returning errors for methods that don't apply. Your types implement interfaces they don't fully support.

---

### D: Dependency Inversion Principle

*"Depend on abstractions, not concretions."*

In Go, DIP is expressed through the "accept interfaces, return structs" pattern. High-level business logic should depend on small interfaces (abstractions), not on concrete database clients, HTTP packages, or third-party SDKs.

This is the foundation of testable Go code. When your service accepts a `Sender` interface rather than a concrete `*smtp.Client`, you can test it with a simple in-memory fake. No mocking framework needed; just a struct with the right methods.

The consumer should define the interface, not the provider. This is the opposite of Java convention but idiomatic in Go. Your handler package defines what it needs; the infrastructure package implements it.

**Before (the violation):**

```go
// Tightly coupled — depends on concrete types
type OrderService struct {
    db    *sql.DB
    mailer *smtp.Client
}

func (s *OrderService) Place(o Order) error {
    _, err := s.db.Exec("INSERT INTO orders ...", o.ID, o.Total)
    if err != nil {
        return err
    }
    return s.mailer.SendMail("from@shop.com", []string{o.Email},
        nil, []byte("Order confirmed"))
}

// Testing requires a real database and SMTP server.
// Changing the email provider means changing OrderService.
```

**After (the principle applied):**

```go
// Depends on abstractions defined by the consumer
type OrderStore interface {
    Save(Order) error
}

type OrderNotifier interface {
    NotifyConfirmation(email string, orderID string) error
}

type OrderService struct {
    store    OrderStore
    notifier OrderNotifier
}

func NewOrderService(s OrderStore, n OrderNotifier) *OrderService {
    return &OrderService{store: s, notifier: n}
}

func (svc *OrderService) Place(o Order) error {
    if err := svc.store.Save(o); err != nil {
        return fmt.Errorf("saving order: %w", err)
    }
    return svc.notifier.NotifyConfirmation(o.Email, o.ID)
}

// Testing with fakes — no mocking library needed
type fakeStore struct{ saved []Order }

func (f *fakeStore) Save(o Order) error {
    f.saved = append(f.saved, o)
    return nil
}

type fakeNotifier struct{ sent []string }

func (f *fakeNotifier) NotifyConfirmation(email, id string) error {
    f.sent = append(f.sent, email)
    return nil
}
```

> **Smell:** You can't test a function without spinning up infrastructure. Changing a database or email provider requires modifying business logic. If you find yourself writing fakes for complex interfaces, consider the [Repository](/go/patterns/architectural/repository) pattern to define exactly the persistence contract your domain needs.

---

### Putting It Together

The five principles don't operate independently. When you fix one, you often fix two others for free. Here's a struct that violates four of them simultaneously:

```go
// report.go — four violations in one type
type ReportService struct {
    db     *sql.DB     // DIP: depends on a concrete type
    mailer *smtp.Client // DIP: same
}

// SRP: owns report generation AND delivery in one method
// OCP: adding a new delivery channel requires modifying this tested method
// ISP: callers must construct a full ReportService even if they only need one report type
func (s *ReportService) Send(reportType, recipient string) error {
    var query string
    switch reportType {
    case "daily":
        query = "SELECT * FROM events WHERE date = today()"
    case "weekly":
        query = "SELECT * FROM events WHERE date > week_ago()"
    default:
        return fmt.Errorf("unknown report type: %s", reportType)
    }
    rows, err := s.db.Query(query)
    if err != nil {
        return err
    }
    defer rows.Close()
    body := buildReport(rows)
    return s.mailer.SendMail("reports@co.com", []string{recipient}, nil, body)
}
```

Testing `Send` requires a real database and SMTP server. Adding a Slack channel requires modifying a tested method. Changing the weekly query risks breaking the daily path.

Now apply SRP, OCP, DIP, and ISP together — one refactor, not five:

```go
// Interfaces defined where they're consumed, named for what the consumer needs.
type ReportSource interface {
    Rows(reportType string) (*sql.Rows, error)
}

type ReportSender interface {
    Send(recipient string, body []byte) error
}

// SRP: one reason to change — report orchestration.
// DIP: depends on abstractions, not concrete infrastructure.
type ReportService struct {
    source ReportSource
    sender ReportSender
}

// OCP: adding Slack means a new ReportSender struct, not a new switch case.
// ISP: each dependency is as narrow as possible.
func (s *ReportService) Send(reportType, recipient string) error {
    rows, err := s.source.Rows(reportType)
    if err != nil {
        return fmt.Errorf("fetching report data: %w", err)
    }
    defer rows.Close()
    return s.sender.Send(recipient, buildReport(rows))
}

// Fakes for tests — no infrastructure needed.
type fakeSource struct{ rows *sql.Rows }

func (f *fakeSource) Rows(reportType string) (*sql.Rows, error) { return f.rows, nil }

type fakeSender struct{ sent []string }

func (f *fakeSender) Send(recipient string, _ []byte) error {
    f.sent = append(f.sent, recipient)
    return nil
}
```

`ReportService` now tests with two simple fakes. Adding a Slack sender is a new struct, not a new switch case. The `ReportSource` interface is narrow enough that a single `*sql.DB` query method satisfies it.

ISP was implicit: `ReportSource` required exactly one method, so anything that can query can satisfy it. LSP is the silent constraint: if your `ReportSource.Rows` implementation sometimes returns a closed `*sql.Rows` without an error, every caller silently gets wrong results. The compiler doesn't catch this; behavioral contracts require documentation and tests.

### Which principles bite hardest in Go

**SRP, OCP, and ISP come nearly free.** Small focused packages are idiomatic. Interfaces are implicit and small by convention — `io.Reader`, `http.Handler`, `fmt.Stringer`. The standard library models OCP continuously: new `io.Reader` implementations can be added anywhere without touching `io`. Violating ISP takes deliberate effort; a five-method interface should make you pause.

**DIP requires active discipline.** The proverb "accept interfaces, return structs" is DIP distilled, but the temptation is real: it's faster to type `*sql.DB` than to define a one-method `Querier` interface. Every concrete type imported deep in business logic is a dependency your tests must replicate. Define what your code *needs* as a narrow interface at the call site. Let `main()` wire the concrete types in.

**LSP has no syntax.** The compiler verifies method *signatures*, not behavioral *contracts*. An `io.Reader` that returns `0, nil` (instead of `0, io.EOF`), a `net.Conn` that panics on `Write` after `Close`, a `context.Context` that never fires its `Done` channel — all compile, all violate LSP, all cause bugs that are hard to locate. The defense is interface documentation that specifies behavior, plus tests that verify the contract is honored, not just that the method exists.