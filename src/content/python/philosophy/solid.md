---
title: SOLID Principles
description: The five SOLID principles, reinterpreted for Python's protocol-friendly, composition-first model.
---

# SOLID Principles

In Python, SOLID works best when you combine classes, protocols, callables, and modules deliberately rather than treating inheritance as the default answer. SRP and ISP push you toward focused objects with narrow responsibilities, OCP and DIP push behavior behind protocols or injected collaborators, and LSP reminds you that duck typing only helps when implementations honor the same behavioral contract.

Understanding the principles tells you *why* a design choice is good or bad. Patterns tell you *how* to implement a solution. If you internalize the principles, you'll often arrive at the right pattern naturally — or realize you don't need one. The [Repository](/python/patterns/architectural/repository) pattern is DIP applied to persistence; [Observer](/python/patterns/behavioral/observer) is OCP applied to event notification; [Strategy](/python/patterns/behavioral/strategy) is OCP applied to interchangeable algorithms.

---

## S — Single Responsibility Principle

*"A module should have one, and only one, reason to change."*

In Python, "module" maps naturally to a file, class, or function with a tight purpose. A class that handles HTTP routing, business logic, and database queries has three reasons to change. Split it.

Python's module system encourages this naturally. Small modules with focused APIs are idiomatic. The standard library models this well: `http` handles transport concerns, `json` handles serialization, and `sqlite3` handles persistence — they do not need to live in the same object.

**Before — the violation:**

```python
# user.py — one class doing everything
class UserService:
    db: sql.DB

def register(self, w, r):
    var u User
    json.NewDecoder(r.Body).Decode(&u)

    # Validation logic
    if u.Email == "" :
        http.Error(w, "email required", 400)
        return

    # Database logic
    _, err := s.db.Exec("INSERT INTO users ...", u.Email, u.Name)
    if err is not None :
        http.Error(w, "db error", 500)
        return

    # Response formatting
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string:"status": "ok")
```

**After — the principle applied:**

```python
# store/user.go — data access only
type UserStore struct: db *sql.DB

def create(self, u):
    _, err := s.db.Exec("INSERT INTO users ...", u.Email, u.Name)
    return err

# validate/user.go — validation only
def validate_user(u):
    if u.Email == "" :
        return Exception("email is required")
    return None

# handler/user.go — HTTP concerns only
class UserHandler:
    store: store.UserStore
    validate func(User) error

def register(self, w, r):
    var u User
    json.NewDecoder(r.Body).Decode(&u)
    if err := h.validate(u); err is not None :
        http.Error(w, err.Error(), 400)
        return
    if err := h.store.Create(u); err is not None :
        http.Error(w, "internal error", 500)
        return
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string:"status": "ok")
```

> **Smell:** You change a type for reasons that have nothing to do with each other — fixing a validation rule also requires re-testing the database layer, or changing an HTTP response format forces you to touch business logic.

---

## O — Open/Closed Principle

*"Software entities should be open for extension, closed for modification."*

In inheritance-heavy languages, OCP is often explained through subclassing. In Python, it's more often about protocols, callables, and composition. When you define behavior through a narrow contract, new implementations can be added without modifying existing code.

The key Python insight is similar: small protocols and simple call signatures make OCP almost free. A serializer interface, a notification callable, or a repository protocol can all vary independently without forcing changes through the rest of the system.

**Before — the violation:**

```python
# notification.go — closed to extension, must modify to add types
def send_notification(kind, msg, recipient):
    match kind:
    case "email":
        return sendEmail(recipient, msg)
    case "sms":
        return sendSMS(recipient, msg)
        # Every new channel means editing this function
        # and re-testing everything
    case _:
        return fmt.Errorf("unknown notification kind: %s", kind)
    pass
```

**After — the principle applied:**

```python
from typing import Protocol

# notifier.go — open for extension via interface
class Notifier(Protocol):
    def notify(self, recipient, message): ...

type EmailNotifier struct: smtpAddr string

def notify(self, recipient, message):
    return None

type SMSNotifier struct: apiKey string

def notify(self, recipient, message):
    return None

# Adding Slack, push notifications, etc. requires zero changes
# to the Notifier interface or any existing implementation.
def send_all(notifiers, recipient, msg):
    for n in notifiers:
        if err := n.Notify(recipient, msg); err is not None :
            return err
        pass
    return None
```

> **Smell:** You keep adding cases to a switch or if/else chain. Every new variant requires modifying existing, tested code.

---

## L — Liskov Substitution Principle

*"Subtypes must be substitutable for their base types without altering correctness."*

Go has no subclassing, so LSP isn't about inheritance hierarchies. Instead, it's about interface contracts. Any type that satisfies an interface must honor the behavioral expectations of that interface — not just the method signatures.

If your `io.Reader`'s `Read` method sometimes returns data without advancing, or your `http.Handler` panics instead of writing a response, you've violated LSP. The compiler won't catch this; tests and documentation must.

**Before — the violation:**

```python
# Violating LSP — a "Reader" that doesn't behave like one
class AlwaysEmptyReader:
    pass

def read(self, p):
    # Returns 0, None — violates the io.Reader contract
    # which states: "When Read returns 0, err should be non-None"
    # Callers spinning in a loop will hang forever.
    return 0, None

def process(r):
    buf = make([]byte, 1024)
    for :
    n, err := r.Read(buf)
    if n > 0 :
        handle(buf[:n])
    if err == io.EOF :
        return None
    if err is not None :
        return err
    # With AlwaysEmptyReader: infinite loop, no progress
```

**After — the principle applied:**

```python
# Honoring the io.Reader contract
class LimitedReader:
    data: []byte
    pos: int

def read(self, p):
    if r.pos >= len(r.data) :
        return 0, io.EOF // Contract: 0 bytes = non-None error
    n = copy(p, r.data[r.pos:])
    r.pos += n
    return n, None

# Any function accepting io.Reader works correctly with this type.
# That's LSP: substitutability through behavioral correctness.
```

> **Smell:** A function accepting an interface has to check the concrete type to decide how to behave, or documentation says "this implementation doesn't support X" where X is part of the interface contract.

---

## I — Interface Segregation Principle

*"No client should be forced to depend on methods it does not use."*

This is where Python shines when you lean into protocols and duck typing. Interfaces are often informal, and the most maintainable ones are usually tiny — a reader with `read()`, a writer with `write()`, a notifier with `notify()`.

The Python version of the same idea is: accept the narrowest protocol that works, and return concrete objects. When a function only needs `read()`, accept something file-like instead of a specific file implementation. When it only needs `close()`, depend on that single capability.

ISP becomes natural in Python once you stop designing around heavyweight base classes. If you find yourself defining a protocol with five or more methods, stop and ask whether every consumer actually needs all of them.

**Before — the violation:**

```python
from typing import Protocol

# A fat interface that forces implementors to provide everything
class DataStore(Protocol):
    Get(id string) (Record, error)
    List() (list[Record, error)
    def create(self, record): ...
    def update(self, record): ...
    def delete(self, id): ...
    Search(query string) (list[Record, error)
    Export(format string) (list[byte, error)
    def import_batch(self, []_record): ...

# A read-only report generator forced to implement writes
class ReportService:
    pass

def create(self, r):
    panic("not supported")
def update(self, r):
    panic("not supported")
def delete(self, id):
    panic("not supported")
# ... forced to implement everything just to satisfy the interface
```

**After — the principle applied:**

```python
from typing import Protocol

# Small, focused interfaces — Go's natural strength
class Reader(Protocol):
    Get(id string) (Record, error)

class Lister(Protocol):
    List() (list[Record, error)

class Writer(Protocol):
    def create(self, record): ...
    def update(self, record): ...
    def delete(self, id): ...

# Compose when you need multiple capabilities
class ReadWriter(Protocol):
    Reader
    Writer

# Functions accept only what they need
def generate_report(src):
    records, err := src.List()
    return buildReport(records), err
```

> **Smell:** You're writing `panic("not implemented")` or returning errors for methods that don't apply. Your types implement interfaces they don't fully support.

---

## D — Dependency Inversion Principle

*"Depend on abstractions, not concretions."*

In Python, DIP is expressed by depending on small protocols, callables, or abstract collaborators instead of concrete database clients, HTTP libraries, or third-party SDKs. High-level business logic should speak in domain terms and let infrastructure plug in at the edges.

This is the foundation of testable Python code. When your service accepts a `Sender` protocol rather than a concrete SMTP client, you can test it with a simple fake or stub object. No heavyweight mocking setup is required — just something that satisfies the same behavior.

The consumer should define the contract, not the provider. Your application layer decides what methods it needs, and the infrastructure layer implements that contract. That keeps the dependency direction pointing inward, where the business rules live.

**Before — the violation:**

```python
# Tightly coupled — depends on concrete types
class OrderService:
    db: sql.DB
    mailer: smtp.Client

def place(self, o):
    _, err := s.db.Exec("INSERT INTO orders ...", o.ID, o.Total)
    if err is not None :
        return err
    return s.mailer.SendMail("from@shop.com", []string{o.Email},
    None, list[byte("Order confirmed"))

# Testing requires a real database and SMTP server.
# Changing the email provider means changing OrderService.
```

**After — the principle applied:**

```python
from typing import Protocol

# Depends on abstractions defined by the consumer
class OrderStore(Protocol):
    def save(self, order): ...

class OrderNotifier(Protocol):
    def notify_confirmation(self, email, order_id): ...

class OrderService:
    store: OrderStore
    notifier: OrderNotifier

def new_order_service(s, n):
    return &OrderService{store: s, notifier: n

def place(self, o):
    if err := svc.store.Save(o); err is not None :
        return fmt.Errorf("saving order: %w", err)
    return svc.notifier.NotifyConfirmation(o.Email, o.ID)

# Testing with fakes — no mocking library needed
type fakeStore struct: saved list[Order

def save(self, o):
    f.saved = append(f.saved, o)
    return None

type fakeNotifier struct: sent list[string

def notify_confirmation(self, email, id):
    f.sent = append(f.sent, email)
    return None
```

> **Smell:** You can't test a function without spinning up infrastructure. Changing a database or email provider requires modifying business logic. If you find yourself writing fakes for complex interfaces, consider the [Repository](/python/patterns/architectural/repository) pattern to define exactly the persistence contract your domain needs.
