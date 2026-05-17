import React from "react";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";
import CodeBlock from "@/components/content/CodeBlock";
import Callout from "@/components/content/Callout";

const PRINCIPLES = [
  {
    letter: "S",
    name: "Single Responsibility Principle",
    oneLiner: "A module should have one, and only one, reason to change.",
    goMeaning: `In Go, "module" maps most naturally to a package — and within a package, to a single type or function. A struct that handles HTTP routing, business logic, and database queries has three reasons to change. Split it.

Go's package system encourages this naturally. Small packages with focused APIs are idiomatic. The standard library models this well: net/http handles HTTP, encoding/json handles JSON — they never mix concerns.`,
    beforeCode: `// user.go — one struct doing everything
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
}`,
    afterCode: `// store/user.go — data access only
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
}`,
    smell: "You change a type for reasons that have nothing to do with each other — fixing a validation rule also requires re-testing the database layer, or changing an HTTP response format forces you to touch business logic.",
  },
  {
    letter: "O",
    name: "Open/Closed Principle",
    oneLiner: "Software entities should be open for extension, closed for modification.",
    goMeaning: `In inheritance-heavy languages, OCP is about subclassing. In Go, it's about interfaces and composition. When you define behavior through an interface, new implementations can be added without modifying existing code.

The key Go insight: small interfaces (one or two methods) make OCP almost free. io.Reader, io.Writer, http.Handler — these tiny interfaces let the entire ecosystem extend behavior without touching the core.`,
    beforeCode: `// notification.go — closed to extension, must modify to add types
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
}`,
    afterCode: `// notifier.go — open for extension via interface
type Notifier interface {
    Notify(recipient, message string) error
}

type EmailNotifier struct{ smtpAddr string }

func (e *EmailNotifier) Notify(recipient, message string) error {
    // send email via SMTP
    return nil
}

type SMSNotifier struct{ apiKey string }

func (s *SMSNotifier) Notify(recipient, message string) error {
    // send SMS via API
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
}`,
    smell: "You keep adding cases to a switch or if/else chain. Every new variant requires modifying existing, tested code.",
  },
  {
    letter: "L",
    name: "Liskov Substitution Principle",
    oneLiner: "Subtypes must be substitutable for their base types without altering correctness.",
    goMeaning: `Go has no subclassing, so LSP isn't about inheritance hierarchies. Instead, it's about interface contracts. Any type that satisfies an interface must honor the behavioral expectations of that interface — not just the method signatures.

If your io.Reader's Read method sometimes returns data without advancing, or your http.Handler panics instead of writing a response, you've violated LSP. The compiler won't catch this; tests and documentation must.`,
    beforeCode: `// Violating LSP — a "Reader" that doesn't behave like one
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
}`,
    afterCode: `// Honoring the io.Reader contract
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
// That's LSP: substitutability through behavioral correctness.`,
    smell: "A function accepting an interface has to check the concrete type to decide how to behave, or documentation says 'this implementation doesn't support X' where X is part of the interface contract.",
  },
  {
    letter: "I",
    name: "Interface Segregation Principle",
    oneLiner: "No client should be forced to depend on methods it does not use.",
    goMeaning: `This is where Go shines. Interfaces in Go are implicitly satisfied and idiomatically small — often just one method. io.Reader, io.Writer, fmt.Stringer, sort.Interface — the standard library is built on tiny, focused interfaces.

The "accept interfaces, return structs" proverb is ISP distilled. When your function only needs to read, accept an io.Reader, not an *os.File. When you only need to close, accept an io.Closer.

ISP is so natural in Go that violating it takes deliberate effort. If you find yourself defining an interface with five or more methods, stop and ask whether every consumer actually needs all of them.`,
    beforeCode: `// A fat interface that forces implementors to provide everything
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
// ... forced to implement everything just to satisfy the interface`,
    afterCode: `// Small, focused interfaces — Go's natural strength
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
    // Only needs List — doesn't care about Create, Delete, etc.
    return buildReport(records), err
}`,
    smell: "You're writing panic(\"not implemented\") or returning errors for methods that don't apply. Your types implement interfaces they don't fully support.",
  },
  {
    letter: "D",
    name: "Dependency Inversion Principle",
    oneLiner: "Depend on abstractions, not concretions.",
    goMeaning: `In Go, DIP is expressed through the "accept interfaces, return structs" pattern. High-level business logic should depend on small interfaces (abstractions), not on concrete database clients, HTTP packages, or third-party SDKs.

This is the foundation of testable Go code. When your service accepts a Sender interface rather than a concrete *smtp.Client, you can test it with a simple in-memory fake. No mocking framework needed — just a struct with the right methods.

The consumer should define the interface, not the provider. This is the opposite of Java convention but idiomatic in Go. Your handler package defines what it needs; the infrastructure package implements it.`,
    beforeCode: `// Tightly coupled — depends on concrete types
type OrderService struct {
    db    *sql.DB
    mailer *smtp.Client
}

func (s *OrderService) Place(o Order) error {
    // Directly coupled to PostgreSQL and SMTP
    _, err := s.db.Exec("INSERT INTO orders ...", o.ID, o.Total)
    if err != nil {
        return err
    }
    return s.mailer.SendMail("from@shop.com", []string{o.Email},
        nil, []byte("Order confirmed"))
}

// Testing requires a real database and SMTP server.
// Changing the email provider means changing OrderService.`,
    afterCode: `// Depends on abstractions defined by the consumer
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
}`,
    smell: "You can't test a function without spinning up infrastructure. Changing a database or email provider requires modifying business logic.",
  },
];

export default function Solid() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Breadcrumbs />

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">SOLID Principles</h1>
      <p className="text-lg text-muted-foreground leading-relaxed mb-6 max-w-2xl">
        The five SOLID principles were articulated in the context of class-based OOP with inheritance.
        Go doesn't have classes or inheritance. But the principles still matter — they just express
        differently.
      </p>

      <Callout variant="info" title="Principles over patterns">
        Principles tell you <em>why</em> a design is good or bad. Patterns tell you <em>how</em> to implement
        a solution. If you internalize the principles, you'll often arrive at the right pattern naturally —
        or realize you don't need one.
      </Callout>

      <div className="prose-pattern">
        <p>
          Some SOLID framing assumes inheritance that Go doesn't have. Where that happens, we reinterpret
          honestly rather than force-fitting. ISP, for instance, is almost free in Go because interfaces
          are implicit and small by convention. LSP has nothing to do with subclasses and everything to do
          with behavioral contracts.
        </p>
      </div>

      {PRINCIPLES.map((p, idx) => (
        <section key={p.letter} className="mt-16 pt-8 border-t border-border first:border-t-0 first:mt-8 first:pt-0">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary text-primary-foreground font-mono font-bold text-lg">
              {p.letter}
            </span>
            <h2 className="text-2xl font-semibold text-foreground">{p.name}</h2>
          </div>
          <p className="text-sm font-medium text-primary mb-4 italic">"{p.oneLiner}"</p>

          <div className="prose-pattern">
            <h3>What it means in Go</h3>
            {p.goMeaning.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>

          <h3 className="text-lg font-semibold mt-8 mb-3 text-foreground">Before — the violation</h3>
          <CodeBlock code={p.beforeCode} filename={`before_${p.letter.toLowerCase()}.go`} />

          <h3 className="text-lg font-semibold mt-6 mb-3 text-foreground">After — the principle applied</h3>
          <CodeBlock code={p.afterCode} filename={`after_${p.letter.toLowerCase()}.go`} />

          <Callout variant="warning" title="Smell that signals a violation">
            {p.smell}
          </Callout>
        </section>
      ))}

      <PrevNextNav />
    </div>
  );
}