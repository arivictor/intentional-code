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
import json
import sqlite3
from http.server import BaseHTTPRequestHandler


class UserHandler(BaseHTTPRequestHandler):
    def __init__(self, db: sqlite3.Connection, *args, **kwargs):
        self._db = db
        super().__init__(*args, **kwargs)

    def do_POST(self) -> None:
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))

        # Validation logic mixed with HTTP handling
        if not data.get("email"):
            self.send_error(400, "email required")
            return

        # Database logic mixed in too
        try:
            self._db.execute(
                "INSERT INTO users (email, name) VALUES (?, ?)",
                (data["email"], data.get("name", "")),
            )
            self._db.commit()
        except sqlite3.Error:
            self.send_error(500, "db error")
            return

        # Response formatting
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok"}).encode())
```

**After — the principle applied:**

```python
# store/user.py — data access only
import sqlite3
from dataclasses import dataclass


@dataclass
class User:
    email: str
    name: str


class UserStore:
    def __init__(self, db: sqlite3.Connection) -> None:
        self._db = db

    def create(self, user: User) -> None:
        self._db.execute(
            "INSERT INTO users (email, name) VALUES (?, ?)",
            (user.email, user.name),
        )
        self._db.commit()


# validate/user.py — validation only
def validate_user(user: User) -> None:
    if not user.email:
        raise ValueError("email is required")


# handler/user.py — HTTP concerns only
import json
from typing import Callable
from http.server import BaseHTTPRequestHandler


class UserHandler(BaseHTTPRequestHandler):
    def __init__(
        self,
        store: UserStore,
        validate: Callable[[User], None],
        *args,
        **kwargs,
    ) -> None:
        self._store = store
        self._validate = validate
        super().__init__(*args, **kwargs)

    def do_POST(self) -> None:
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        user = User(email=data.get("email", ""), name=data.get("name", ""))
        try:
            self._validate(user)
        except ValueError as exc:
            self.send_error(400, str(exc))
            return
        try:
            self._store.create(user)
        except Exception:
            self.send_error(500, "internal error")
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok"}).encode())
```

> **Smell:** You change a type for reasons that have nothing to do with each other — fixing a validation rule also requires re-testing the database layer, or changing an HTTP response format forces you to touch business logic.

---

## O — Open/Closed Principle

*"Software entities should be open for extension, closed for modification."*

In inheritance-heavy languages, OCP is often explained through subclassing. In Python, it's more often about protocols, callables, and composition. When you define behavior through a narrow contract, new implementations can be added without modifying existing code.

Small protocols and simple call signatures make OCP almost free. A serializer interface, a notification callable, or a repository protocol can all vary independently without forcing changes through the rest of the system.

**Before — the violation:**

```python
# notification.py — closed to extension, must modify to add new channels


def send_notification(kind: str, recipient: str, message: str) -> None:
    if kind == "email":
        _send_email(recipient, message)
    elif kind == "sms":
        _send_sms(recipient, message)
    else:
        # Every new channel means editing this function and re-testing everything.
        raise ValueError(f"unknown notification kind: {kind!r}")
```

**After — the principle applied:**

```python
from typing import Protocol


# open for extension via Protocol
class Notifier(Protocol):
    def notify(self, recipient: str, message: str) -> None: ...


class EmailNotifier:
    def __init__(self, smtp_addr: str) -> None:
        self._smtp_addr = smtp_addr

    def notify(self, recipient: str, message: str) -> None:
        print(f"[email] → {recipient}: {message}")


class SMSNotifier:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def notify(self, recipient: str, message: str) -> None:
        print(f"[sms] → {recipient}: {message}")


# Adding Slack, push notifications, etc. requires zero changes here.
def send_all(notifiers: list[Notifier], recipient: str, message: str) -> None:
    for notifier in notifiers:
        notifier.notify(recipient, message)
```

> **Smell:** You keep adding branches to an `if`/`elif` chain. Every new variant requires modifying existing, tested code.

---

## L — Liskov Substitution Principle

*"Subtypes must be substitutable for their base types without altering correctness."*

Python has no mandatory subclassing, so LSP isn't only about inheritance hierarchies. It's about behavioral contracts. Any type that satisfies a protocol or inherits from a base class must honor the expectations that contract implies — not just the method signatures.

If your file-like `read()` sometimes returns data without advancing the position, or your `close()` raises instead of being a no-op on an already-closed resource, you've violated LSP. Static analysis and type checkers won't always catch this; tests and clear documentation must.

**Before — the violation:**

```python
import io


class AlwaysEmptyReader(io.RawIOBase):
    """Violates the io.RawIOBase contract."""

    def readinto(self, b: bytearray) -> int:
        # Returns 0 without setting the buffer — callers expecting EOF
        # to be signalled by returning b'' or raising will loop forever.
        return 0


def process(reader: io.RawIOBase) -> bytes:
    chunks: list[bytes] = []
    while True:
        chunk = reader.read(1024)
        if chunk == b"":  # EOF per the io contract
            break
        if chunk is None:
            continue
        chunks.append(chunk)
    return b"".join(chunks)

# process(AlwaysEmptyReader()) — infinite loop, no progress
```

**After — the principle applied:**

```python
import io


class LimitedReader(io.RawIOBase):
    """Honors the io.RawIOBase contract."""

    def __init__(self, data: bytes) -> None:
        self._data = data
        self._pos = 0

    def readinto(self, b: bytearray) -> int:
        remaining = self._data[self._pos:]
        n = min(len(b), len(remaining))
        b[:n] = remaining[:n]
        self._pos += n
        return n  # returning 0 means EOF — contract honored


# Any function that accepts io.RawIOBase works correctly with this type.
# That's LSP: substitutability through behavioral correctness.
```

> **Smell:** A function accepting a base type or protocol has to inspect `type(obj)` or check the concrete class to decide how to behave, or documentation says "this subclass doesn't support X" where X is part of the base contract.

---

## I — Interface Segregation Principle

*"No client should be forced to depend on methods it does not use."*

This is where Python shines when you lean into `typing.Protocol` and duck typing. Protocols are often informal, and the most maintainable ones are usually tiny — a reader with `read()`, a writer with `write()`, a notifier with `notify()`.

Accept the narrowest protocol that works, and return concrete objects. When a function only needs `read()`, type-hint it against a `Reader` protocol instead of a specific file class. When it only needs `close()`, depend on that single capability.

ISP becomes natural in Python once you stop designing around heavyweight abstract base classes. If you find yourself defining a protocol with five or more methods, ask whether every consumer actually needs all of them.

**Before — the violation:**

```python
from typing import Protocol


# A fat protocol that forces implementors to provide everything
class DataStore(Protocol):
    def get(self, id: str) -> "Record": ...
    def list(self) -> list["Record"]: ...
    def create(self, record: "Record") -> None: ...
    def update(self, record: "Record") -> None: ...
    def delete(self, id: str) -> None: ...
    def search(self, query: str) -> list["Record"]: ...
    def export(self, fmt: str) -> bytes: ...
    def import_batch(self, records: list["Record"]) -> None: ...


# A read-only report service forced to stub out write methods
class ReportService:
    def get(self, id: str) -> "Record": ...
    def list(self) -> list["Record"]: ...

    def create(self, record: "Record") -> None:
        raise NotImplementedError("not supported")

    def update(self, record: "Record") -> None:
        raise NotImplementedError("not supported")

    def delete(self, id: str) -> None:
        raise NotImplementedError("not supported")
    # ... forced to implement everything just to satisfy the protocol
```

**After — the principle applied:**

```python
from typing import Protocol


# Small, focused protocols — Python's natural strength
class RecordReader(Protocol):
    def get(self, id: str) -> "Record": ...


class RecordLister(Protocol):
    def list(self) -> list["Record"]: ...


class RecordWriter(Protocol):
    def create(self, record: "Record") -> None: ...
    def update(self, record: "Record") -> None: ...
    def delete(self, id: str) -> None: ...


# Combine when you need multiple capabilities
class ReadWriteStore(RecordReader, RecordWriter, Protocol): ...


# Functions accept only what they need
def generate_report(src: RecordLister) -> "Report":
    records = src.list()
    return build_report(records)
```

> **Smell:** You're writing `raise NotImplementedError()` for methods that don't apply to your type. Your classes implement protocols they don't fully support.

---

## D — Dependency Inversion Principle

*"Depend on abstractions, not concretions."*

In Python, DIP is expressed by depending on small protocols, callables, or abstract collaborators instead of concrete database clients, HTTP libraries, or third-party SDKs. High-level business logic should speak in domain terms and let infrastructure plug in at the edges.

This is the foundation of testable Python code. When your service accepts a `Sender` protocol rather than a concrete SMTP client, you can test it with a simple fake object. No `unittest.mock.patch` required — just something that satisfies the same behavior.

The consumer should define the contract, not the provider. Your application layer decides what methods it needs, and the infrastructure layer implements that contract. That keeps the dependency direction pointing inward, where the business rules live.

**Before — the violation:**

```python
import smtplib
import sqlite3


# Tightly coupled — depends on concrete infrastructure types
class OrderService:
    def __init__(self, db: sqlite3.Connection, mailer: smtplib.SMTP) -> None:
        self._db = db
        self._mailer = mailer

    def place(self, order: "Order") -> None:
        self._db.execute(
            "INSERT INTO orders (id, total) VALUES (?, ?)",
            (order.id, order.total),
        )
        self._db.commit()
        self._mailer.sendmail(
            "from@shop.com",
            [order.email],
            f"Subject: Order confirmed\n\nOrder {order.id} confirmed.",
        )

# Testing requires a real database and SMTP server.
# Changing the email provider means changing OrderService.
```

**After — the principle applied:**

```python
from typing import Protocol
from dataclasses import dataclass


# Abstractions defined by the consumer, not the infrastructure
class OrderStore(Protocol):
    def save(self, order: "Order") -> None: ...


class OrderNotifier(Protocol):
    def notify_confirmation(self, email: str, order_id: str) -> None: ...


@dataclass
class Order:
    id: str
    email: str
    total: int


class OrderService:
    def __init__(self, store: OrderStore, notifier: OrderNotifier) -> None:
        self._store = store
        self._notifier = notifier

    def place(self, order: Order) -> None:
        self._store.save(order)
        self._notifier.notify_confirmation(order.email, order.id)


# Testing with simple fakes — no patching or mock library needed
class _FakeStore:
    def __init__(self) -> None:
        self.saved: list[Order] = []

    def save(self, order: Order) -> None:
        self.saved.append(order)


class _FakeNotifier:
    def __init__(self) -> None:
        self.sent: list[str] = []

    def notify_confirmation(self, email: str, order_id: str) -> None:
        self.sent.append(email)


def test_place_order() -> None:
    store = _FakeStore()
    notifier = _FakeNotifier()
    svc = OrderService(store, notifier)

    svc.place(Order(id="o1", email="alice@example.com", total=4999))

    assert len(store.saved) == 1
    assert notifier.sent == ["alice@example.com"]
```

> **Smell:** You can't test a function without spinning up infrastructure. Changing a database or email provider requires modifying business logic. If you find yourself writing fakes for complex interfaces, consider the [Repository](/python/patterns/architectural/repository) pattern to define exactly the persistence contract your domain needs.
