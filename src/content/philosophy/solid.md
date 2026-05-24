---
title: SOLID Principles
description: The five SOLID principles, reinterpreted for Go's implicit-interface, composition-first model.
---

# SOLID Principles

In Go, three of the five SOLID principles apply almost by default: interfaces are implicit and small by convention (ISP), packages compose rather than inherit (OCP), and focused packages are idiomatic (SRP). The two that need deliberate effort are LSP (which in Go is about behavioral contracts for interface implementors, not subclass hierarchies) and DIP, where Go's "accept interfaces, return structs" idiom replaces abstract classes.

Understanding the principles tells you *why* a design choice is good or bad. Patterns tell you *how* to implement a solution. The principles usually point you to the right pattern, or show you that you don't need one. The [Repository](/go/patterns/architectural/repository) pattern is DIP applied to persistence; [Observer](/go/patterns/behavioral/observer) is OCP applied to event notification; [Strategy](/go/patterns/behavioral/strategy) is OCP applied to interchangeable algorithms.

---

## S: Single Responsibility Principle

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

## O: Open/Closed Principle

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

> **Smell:** You keep adding cases to a switch or if/else chain. Every new variant requires modifying existing, tested code.

---

## L: Liskov Substitution Principle

*"Subtypes must be substitutable for their base types without altering correctness."*

Go has no subclassing, so LSP isn't about inheritance hierarchies. It's about interface contracts. Any type that satisfies an interface must honor the behavioral expectations of that interface, not just the method signatures.

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

## I: Interface Segregation Principle

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

## D: Dependency Inversion Principle

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

## Putting It Together

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

## Which principles bite hardest in Go

**SRP, OCP, and ISP come nearly free.** Small focused packages are idiomatic. Interfaces are implicit and small by convention — `io.Reader`, `http.Handler`, `fmt.Stringer`. The standard library models OCP continuously: new `io.Reader` implementations can be added anywhere without touching `io`. Violating ISP takes deliberate effort; a five-method interface should make you pause.

**DIP requires active discipline.** The proverb "accept interfaces, return structs" is DIP distilled, but the temptation is real: it's faster to type `*sql.DB` than to define a one-method `Querier` interface. Every concrete type imported deep in business logic is a dependency your tests must replicate. Define what your code *needs* as a narrow interface at the call site. Let `main()` wire the concrete types in.

**LSP has no syntax.** The compiler verifies method *signatures*, not behavioral *contracts*. An `io.Reader` that returns `0, nil` (instead of `0, io.EOF`), a `net.Conn` that panics on `Write` after `Close`, a `context.Context` that never fires its `Done` channel — all compile, all violate LSP, all cause bugs that are hard to locate. The defense is interface documentation that specifies behavior, plus tests that verify the contract is honored, not just that the method exists.
