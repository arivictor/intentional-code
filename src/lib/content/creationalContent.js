export const CREATIONAL_CONTENT = {
  "factory-method": {
    intentDetail: `Factory Method lets you produce objects without specifying their exact type. In Go, this means a constructor function that returns an interface type, so the caller works with the interface and doesn't know — or care — which concrete struct it got back.

This is one of the most natural patterns in Go. Unlike languages that need an abstract class with an overridable factory method, Go just uses a plain function that returns an interface. The "factory" is the function itself.`,

    problem: `You're building a notification system. Initially you only send emails, so you hardcode an email sender. Then you need SMS. Then Slack. Every new channel means editing the same function, retesting everything, and risking breakage in channels that were already working.`,

    problemCode: `package notify

import "fmt"

func Send(channel, recipient, message string) error {
    switch channel {
    case "email":
        fmt.Printf("Sending email to %s: %s\\n", recipient, message)
        return nil
    case "sms":
        fmt.Printf("Sending SMS to %s: %s\\n", recipient, message)
        return nil
    // Every new channel: add a case, redeploy, re-test everything.
    default:
        return fmt.Errorf("unsupported channel: %s", channel)
    }
}`,
    problemCodeFile: "notify.go",

    problemExplain: `This switch statement is a magnet for change. Every new notification channel requires modifying this function. You can't add channels from outside the package. Testing one channel means loading the code for all of them. And the string-based channel selection has no compile-time safety.`,

    solutionIntro: `Define a Notifier interface with a single method. Each channel implements it independently. A constructor function selects the right implementation and returns the interface. The caller never sees the concrete types.`,

    diagram: `┌─────────────────────────┐
│     <<interface>>       │
│       Notifier          │
│─────────────────────────│
│ + Notify(to, msg) error │
└────────────┬────────────┘
             │ implements
     ┌───────┼────────┐
     │       │        │
┌────▼──┐ ┌──▼───┐ ┌──▼────┐
│ Email │ │ SMS  │ │ Slack │
│Notif. │ │Notif.│ │Notif. │
└───────┘ └──────┘ └───────┘

NewNotifier(channel) ──► Notifier`,
    diagramCaption: "NewNotifier returns a Notifier interface; callers never depend on concrete types.",

    solutionSteps: [
      {
        prose: "First, define the interface. Keep it small — one method is ideal.",
        code: `package notify

// Notifier sends a notification to a recipient.
type Notifier interface {
    Notify(recipient, message string) error
}`,
        filename: "notifier.go",
      },
      {
        prose: "Each channel is its own struct satisfying the interface. They can live in separate files or even separate packages.",
        code: `package notify

import "fmt"

type EmailNotifier struct {
    SMTPAddr string
}

func (e *EmailNotifier) Notify(recipient, message string) error {
    fmt.Printf("[email] to=%s via=%s msg=%s\\n", recipient, e.SMTPAddr, message)
    return nil
}

type SMSNotifier struct {
    APIKey string
}

func (s *SMSNotifier) Notify(recipient, message string) error {
    fmt.Printf("[sms] to=%s msg=%s\\n", recipient, message)
    return nil
}

type SlackNotifier struct {
    WebhookURL string
}

func (sl *SlackNotifier) Notify(recipient, message string) error {
    fmt.Printf("[slack] channel=%s msg=%s\\n", recipient, message)
    return nil
}`,
        filename: "channels.go",
      },
      {
        prose: `Now the factory: a constructor function that returns the interface. Using a map of constructors is cleaner than a switch — and it's extensible at runtime.`,
        code: `package notify

import "fmt"

// constructor is a function that creates a Notifier.
type constructor func() Notifier

// registry maps channel names to their constructors.
var registry = map[string]constructor{
    "email": func() Notifier { return &EmailNotifier{SMTPAddr: "smtp.example.com:587"} },
    "sms":   func() Notifier { return &SMSNotifier{APIKey: "key-123"} },
    "slack": func() Notifier { return &SlackNotifier{WebhookURL: "https://hooks.slack.com/xxx"} },
}

// Register adds a new channel at runtime.
func Register(name string, c constructor) {
    registry[name] = c
}

// NewNotifier returns a Notifier for the given channel.
func NewNotifier(channel string) (Notifier, error) {
    ctor, ok := registry[channel]
    if !ok {
        return nil, fmt.Errorf("unknown channel: %s", channel)
    }
    return ctor(), nil
}`,
        filename: "factory.go",
      },
      {
        prose: "A main that demonstrates the factory in action:",
        code: `package main

import (
    "fmt"
    "notify"
)

func main() {
    for _, ch := range []string{"email", "sms", "slack"} {
        n, err := notify.NewNotifier(ch)
        if err != nil {
            fmt.Println(err)
            continue
        }
        n.Notify("alice@example.com", "Your order shipped")
    }
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `[email] to=alice@example.com via=smtp.example.com:587 msg=Your order shipped
[sms] to=alice@example.com msg=Your order shipped
[slack] channel=alice@example.com msg=Your order shipped`,

    whenToUse: [
      "You see a growing switch or if/else chain selecting which type to create based on a runtime value.",
      "Different parts of your system need to create objects that share a common interface but differ in implementation.",
      "You want to let packages or plugins register new implementations without modifying core code.",
      "You need to decouple object creation from usage — the caller should work with the interface, not know the concrete type.",
    ],

    whenNotToUse: [
      "You have only one or two implementations and no expectation of more. A plain constructor function (NewEmailNotifier) is simpler and more direct.",
      "The concrete type matters to the caller — they need access to type-specific methods beyond the interface. In that case, return the concrete type.",
      "The factory adds indirection without benefit. Don't add a factory 'just in case' — add it when you feel the switch-statement pain.",
    ],

    advantages: [
      "New implementations require zero changes to existing code — just register a new constructor.",
      "Callers depend only on the interface, so they're easy to test with fakes.",
      "The map-of-constructors approach is extensible at runtime (plugins, configuration).",
      "Each implementation is isolated — changes to email don't risk breaking SMS.",
    ],
    disadvantages: [
      "Adds indirection — you have to look up the registry to find the concrete type.",
      "Runtime errors (unknown channel) instead of compile-time errors for unregistered types.",
      "For small, stable sets of types, a simple switch or direct construction is clearer.",
      "The registry is package-level mutable state, which can complicate testing if not managed carefully.",
    ],

    relatedPatterns: [
      { slug: "abstract-factory", relation: "Groups related factory methods into a family-creating interface." },
      { slug: "builder", relation: "Also about object creation, but focuses on step-by-step construction rather than type selection." },
      { slug: "prototype", relation: "Creates objects by cloning rather than by calling constructors." },
    ],
  },

  "abstract-factory": {
    intentDetail: `Abstract Factory provides an interface for creating families of related objects without specifying their concrete types. Where Factory Method selects one type, Abstract Factory selects a coherent group of types that are designed to work together.

In Go, this is an interface whose methods each return another interface. One struct per family implements the factory interface, returning concrete types that belong together.`,

    problem: `You're building a UI toolkit that must work across platforms. Buttons, dialogs, and checkboxes look different on macOS, Windows, and Linux, but the application code should use them interchangeably. Hardcoding platform-specific types throughout the app means every new platform requires shotgun surgery.`,

    problemCode: `package ui

import "fmt"

func CreateButton(platform string) {
    switch platform {
    case "macos":
        fmt.Println("Creating macOS Aqua button")
    case "windows":
        fmt.Println("Creating Windows Fluent button")
    case "linux":
        fmt.Println("Creating GTK button")
    }
}

func CreateDialog(platform string) {
    switch platform {
    case "macos":
        fmt.Println("Creating macOS sheet dialog")
    case "windows":
        fmt.Println("Creating Windows modal dialog")
    case "linux":
        fmt.Println("Creating GTK dialog")
    }
}

// Every new component × every new platform = quadratic growth in switch cases.
// Nothing ensures a macOS button is used with a macOS dialog.`,
    problemCodeFile: "ui_naive.go",

    problemExplain: `Two problems: the switch statements grow with every component and platform, and there's no compile-time guarantee that components from the same family are used together. You could accidentally mix a macOS button with a Windows dialog.`,

    solutionIntro: `Define product interfaces (Button, Dialog) and a factory interface whose methods return them. Each platform gets one factory struct that produces a consistent family of components.`,

    diagram: `┌─────────────────────┐
│   <<interface>>     │
│   UIFactory         │
│─────────────────────│
│ + CreateButton()    │──► Button interface
│ + CreateDialog()    │──► Dialog interface
└─────────┬───────────┘
          │ implements
    ┌─────┼──────┐
    │            │
┌───▼────┐ ┌────▼────┐
│ macOS  │ │ Windows │
│Factory │ │ Factory │
└────────┘ └─────────┘`,
    diagramCaption: "Each factory implementation produces a consistent family of UI components.",

    solutionSteps: [
      {
        prose: "Define the product interfaces — what every button and dialog must do:",
        code: `package ui

// Button is a clickable UI element.
type Button interface {
    Render() string
}

// Dialog is a modal window.
type Dialog interface {
    Show(title, message string) string
}`,
        filename: "products.go",
      },
      {
        prose: "Define the abstract factory interface:",
        code: `package ui

// UIFactory creates a family of related UI components.
type UIFactory interface {
    CreateButton() Button
    CreateDialog() Dialog
}`,
        filename: "factory.go",
      },
      {
        prose: "Implement a macOS family:",
        code: `package ui

import "fmt"

type macButton struct{}

func (b *macButton) Render() string { return "[macOS Aqua Button]" }

type macDialog struct{}

func (d *macDialog) Show(title, message string) string {
    return fmt.Sprintf("[macOS Sheet: %s — %s]", title, message)
}

type MacFactory struct{}

func (f *MacFactory) CreateButton() Button { return &macButton{} }
func (f *MacFactory) CreateDialog() Dialog { return &macDialog{} }`,
        filename: "mac.go",
      },
      {
        prose: "And a Windows family:",
        code: `package ui

import "fmt"

type winButton struct{}

func (b *winButton) Render() string { return "[Windows Fluent Button]" }

type winDialog struct{}

func (d *winDialog) Show(title, message string) string {
    return fmt.Sprintf("[Windows Modal: %s — %s]", title, message)
}

type WinFactory struct{}

func (f *WinFactory) CreateButton() Button { return &winButton{} }
func (f *WinFactory) CreateDialog() Dialog { return &winDialog{} }`,
        filename: "windows.go",
      },
      {
        prose: "Application code works with the factory interface. It never imports platform-specific types:",
        code: `package main

import (
    "fmt"
    "ui"
)

func buildUI(factory ui.UIFactory) {
    btn := factory.CreateButton()
    dlg := factory.CreateDialog()
    fmt.Println(btn.Render())
    fmt.Println(dlg.Show("Welcome", "Hello from the app"))
}

func main() {
    fmt.Println("--- macOS ---")
    buildUI(&ui.MacFactory{})

    fmt.Println("--- Windows ---")
    buildUI(&ui.WinFactory{})
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `--- macOS ---
[macOS Aqua Button]
[macOS Sheet: Welcome — Hello from the app]
--- Windows ---
[Windows Fluent Button]
[Windows Modal: Welcome — Hello from the app]`,

    whenToUse: [
      "You need families of related objects that must be used together consistently.",
      "The system should be configurable to work with one of several product families.",
      "You want to enforce that products from different families aren't accidentally mixed.",
    ],

    whenNotToUse: [
      "You only have one product type — use Factory Method instead.",
      "The products in each family are trivially different — the abstraction overhead isn't justified.",
      "You don't actually need family consistency. If mixing is fine, individual factory functions are simpler.",
    ],

    advantages: [
      "Guarantees consistency within a product family — macOS button always pairs with macOS dialog.",
      "Application code is completely decoupled from concrete product types.",
      "Adding a new family (e.g., Linux) is one new struct implementing the factory interface.",
    ],
    disadvantages: [
      "Adding a new product type (e.g., Checkbox) requires changing the factory interface and every implementation. This is a real cost.",
      "More interfaces and types than simpler alternatives — significant overhead for small programs.",
      "In Go, the pattern can feel heavy because Go's implicit interfaces already provide much of the decoupling benefit without the ceremony.",
    ],

    relatedPatterns: [
      { slug: "factory-method", relation: "Abstract Factory is often implemented using factory methods internally." },
      { slug: "builder", relation: "Builder constructs complex objects step by step; Abstract Factory creates families at once." },
    ],
  },

  "builder": {
    intentDetail: `Builder separates the construction of a complex object from its representation. In Go, the idiomatic form is the functional options pattern — a variadic list of option functions passed to a constructor. This avoids long parameter lists, eliminates the need for a separate builder type in most cases, and keeps the API extensible without breaking changes.

The classic chained builder also works in Go and is preferable when construction has a meaningful order or when you want to reuse a partially configured builder.`,

    problem: `You're building an HTTP server with many optional configuration parameters: timeouts, TLS, middleware, max connections, logging. A constructor with twelve parameters is unreadable. A config struct helps, but requires the caller to know which zero values are meaningful and which mean "use default."`,

    problemCode: `package server

import "time"

// Twelve parameters. Which ones are required? What are the defaults?
// Zero value of time.Duration is 0 — does that mean "no timeout" or "instant timeout"?
func NewServer(
    addr string,
    readTimeout time.Duration,
    writeTimeout time.Duration,
    idleTimeout time.Duration,
    maxConns int,
    tlsCert string,
    tlsKey string,
    enableLogging bool,
    logLevel string,
    enableMetrics bool,
    metricsAddr string,
    shutdownTimeout time.Duration,
) *Server {
    // ...
}

// Calling this is painful and error-prone:
// s := NewServer(":8080", 5*time.Second, 10*time.Second, 30*time.Second,
//     100, "", "", true, "info", false, "", 5*time.Second)`,
    problemCodeFile: "server_naive.go",

    problemExplain: `The caller has to remember the position of twelve arguments. Zero values are ambiguous — is maxConns=0 "unlimited" or "no connections"? Adding a new option means changing every call site. This API fights its users.`,

    solutionIntro: `The functional options pattern solves this elegantly. Define an Option type as a function that modifies a config. The constructor accepts a variadic list of options. Defaults are set inside the constructor, and only the options you care about are passed.`,

    diagram: `┌──────────────────────────────────┐
│          NewServer(addr,         │
│            ...Option)            │
│──────────────────────────────────│
│  1. Set defaults in config      │
│  2. Apply each Option func      │
│  3. Build and return *Server    │
└──────────────────────────────────┘

Option = func(*config)

WithReadTimeout(d) ──► func(c *config) { c.readTimeout = d }
WithMaxConns(n)    ──► func(c *config) { c.maxConns = n }
WithTLS(cert, key) ──► func(c *config) { c.tls = ... }`,
    diagramCaption: "Each With* function returns an Option that sets one field on the internal config.",

    solutionSteps: [
      {
        prose: "Define the internal config and the Option type:",
        code: `package server

import "time"

type config struct {
    readTimeout  time.Duration
    writeTimeout time.Duration
    idleTimeout  time.Duration
    maxConns     int
    tlsCert      string
    tlsKey       string
    enableLog    bool
    logLevel     string
}

// Option configures a Server.
type Option func(*config)`,
        filename: "options.go",
      },
      {
        prose: "Each option is a simple function returning an Option:",
        code: `package server

import "time"

func WithReadTimeout(d time.Duration) Option {
    return func(c *config) { c.readTimeout = d }
}

func WithWriteTimeout(d time.Duration) Option {
    return func(c *config) { c.writeTimeout = d }
}

func WithMaxConns(n int) Option {
    return func(c *config) { c.maxConns = n }
}

func WithTLS(cert, key string) Option {
    return func(c *config) {
        c.tlsCert = cert
        c.tlsKey = key
    }
}

func WithLogging(level string) Option {
    return func(c *config) {
        c.enableLog = true
        c.logLevel = level
    }
}`,
        filename: "options.go",
      },
      {
        prose: "The constructor sets sensible defaults, then applies options:",
        code: `package server

import (
    "fmt"
    "time"
)

type Server struct {
    Addr string
    cfg  config
}

func NewServer(addr string, opts ...Option) *Server {
    cfg := config{
        readTimeout:  5 * time.Second,
        writeTimeout: 10 * time.Second,
        idleTimeout:  120 * time.Second,
        maxConns:     1000,
        logLevel:     "info",
    }
    for _, opt := range opts {
        opt(&cfg)
    }
    return &Server{Addr: addr, cfg: cfg}
}

func (s *Server) String() string {
    return fmt.Sprintf("Server{addr=%s, read=%v, write=%v, maxConns=%d, tls=%v, log=%s}",
        s.Addr, s.cfg.readTimeout, s.cfg.writeTimeout,
        s.cfg.maxConns, s.cfg.tlsCert != "", s.cfg.logLevel)
}`,
        filename: "server.go",
      },
      {
        prose: "Clean, readable call sites:",
        code: `package main

import (
    "fmt"
    "server"
    "time"
)

func main() {
    // Minimal — all defaults
    s1 := server.NewServer(":8080")
    fmt.Println(s1)

    // Custom — only the options you care about
    s2 := server.NewServer(":443",
        server.WithTLS("cert.pem", "key.pem"),
        server.WithReadTimeout(30*time.Second),
        server.WithMaxConns(5000),
        server.WithLogging("debug"),
    )
    fmt.Println(s2)
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `Server{addr=:8080, read=5s, write=10s, maxConns=1000, tls=false, log=info}
Server{addr=:443, read=30s, write=10s, maxConns=5000, tls=true, log=debug}`,

    whenToUse: [
      "A constructor needs more than 3–4 optional parameters.",
      "You want sensible defaults with the ability to override any subset.",
      "The API needs to be extensible — adding options shouldn't break existing callers.",
      "Configuration is provided at construction time and doesn't change afterward.",
    ],

    whenNotToUse: [
      "The object has only a few required fields and no optional ones. A plain NewX(a, b) is simpler.",
      "Construction has a meaningful sequence of steps that must be followed in order — use a chained builder or a step-interface builder instead.",
      "You need to reuse a partially configured builder to stamp out similar objects — the functional options pattern creates a new config each time.",
    ],

    alternativeNote: "The functional options pattern is the preferred Go idiom for this problem. The classic chained builder (b.SetA().SetB().Build()) also works and is better when construction order matters or you need to reuse a partially configured builder.",

    advantages: [
      "Clean call sites — only specify what you need.",
      "Adding new options is backward compatible — no existing callers change.",
      "Defaults are explicit and centralized in one place.",
      "Options are composable — you can build 'preset' option bundles.",
    ],
    disadvantages: [
      "The pattern requires writing one function per option, which adds boilerplate.",
      "Option validation happens at runtime, not compile time. An invalid combination won't be caught until the constructor runs.",
      "For very simple types, the pattern is over-engineering.",
    ],

    relatedPatterns: [
      { slug: "factory-method", relation: "Factory Method selects which type to build; Builder configures how to build it." },
      { slug: "abstract-factory", relation: "Abstract Factory creates families of objects; Builder focuses on one complex object." },
    ],
  },

  "prototype": {
    intentDetail: `Prototype creates new objects by copying an existing instance. In Go, this means a Clone() method on a type. The pattern is straightforward in concept but treacherous in practice: Go's reference types (slices, maps, pointers) make shallow copies dangerous. The value of this pattern in Go is less about avoiding constructors and more about being explicit about copy semantics.`,

    problem: `You have a document template system. Users start from a template and customize it. The template has nested structures — paragraphs, metadata maps, style settings. You need independent copies, but Go's assignment operator only does a shallow copy. Modifying the "copy" mutates the original.`,

    problemCode: `package document

type Document struct {
    Title      string
    Author     string
    Tags       []string
    Metadata   map[string]string
    Paragraphs []*Paragraph
}

type Paragraph struct {
    Text  string
    Style string
}

func main() {
    original := &Document{
        Title:  "Template",
        Tags:   []string{"draft"},
        Metadata: map[string]string{"version": "1"},
        Paragraphs: []*Paragraph{{Text: "Hello", Style: "normal"}},
    }

    // WRONG: shallow copy — slices and maps share underlying memory
    copy := *original
    copy.Title = "My Document"     // safe — string is a value
    copy.Tags = append(copy.Tags, "mine") // DANGER: mutates original.Tags!
    copy.Metadata["author"] = "me"       // DANGER: mutates original.Metadata!
    copy.Paragraphs[0].Text = "Changed"  // DANGER: mutates original!
}`,
    problemCodeFile: "shallow_bug.go",

    problemExplain: `The struct assignment copies the struct's fields by value, but slices, maps, and pointers hold references. The "copy" and original share the same underlying arrays and maps. This is a common source of subtle bugs in Go, especially in concurrent code where one goroutine mutates what another goroutine is reading.`,

    solutionIntro: `Implement a Clone() method that explicitly deep-copies every reference type. This is tedious but necessary, and making it a method ensures the copy logic lives with the type rather than scattered across callers.`,

    diagram: `┌───────────────┐    Clone()    ┌───────────────┐
│   original    │──────────────►│     copy      │
│───────────────│               │───────────────│
│ Title: "Tmpl" │               │ Title: "Tmpl" │
│ Tags ──────►[draft]           │ Tags ──────►[draft]  ◄── new slice
│ Meta ──────►{v:1}             │ Meta ──────►{v:1}    ◄── new map
│ Paras ─────►[*P1]            │ Paras ─────►[*P2]    ◄── new slice
│              │                │              │           of new ptrs
└───────────────┘               └───────────────┘`,
    diagramCaption: "Clone() creates independent copies of all reference types.",

    solutionSteps: [
      {
        prose: "The Paragraph type gets its own Clone method:",
        code: `package document

type Paragraph struct {
    Text  string
    Style string
}

func (p *Paragraph) Clone() *Paragraph {
    return &Paragraph{
        Text:  p.Text,
        Style: p.Style,
    }
}`,
        filename: "paragraph.go",
      },
      {
        prose: "The Document's Clone method deep-copies every field:",
        code: `package document

type Document struct {
    Title      string
    Author     string
    Tags       []string
    Metadata   map[string]string
    Paragraphs []*Paragraph
}

func (d *Document) Clone() *Document {
    // Copy value types directly
    clone := &Document{
        Title:  d.Title,
        Author: d.Author,
    }

    // Deep copy slice
    if d.Tags != nil {
        clone.Tags = make([]string, len(d.Tags))
        copy(clone.Tags, d.Tags)
    }

    // Deep copy map
    if d.Metadata != nil {
        clone.Metadata = make(map[string]string, len(d.Metadata))
        for k, v := range d.Metadata {
            clone.Metadata[k] = v
        }
    }

    // Deep copy slice of pointers
    if d.Paragraphs != nil {
        clone.Paragraphs = make([]*Paragraph, len(d.Paragraphs))
        for i, p := range d.Paragraphs {
            clone.Paragraphs[i] = p.Clone()
        }
    }

    return clone
}`,
        filename: "document.go",
      },
      {
        code: `package main

import "fmt"

func main() {
    template := &Document{
        Title:    "Invoice Template",
        Tags:     []string{"template", "finance"},
        Metadata: map[string]string{"version": "1.0"},
        Paragraphs: []*Paragraph{
            {Text: "Dear Customer,", Style: "heading"},
            {Text: "Thank you for your purchase.", Style: "body"},
        },
    }

    invoice := template.Clone()
    invoice.Title = "Invoice #1042"
    invoice.Tags = append(invoice.Tags, "sent")
    invoice.Metadata["customer"] = "Acme Corp"
    invoice.Paragraphs[0].Text = "Dear Acme Corp,"

    fmt.Printf("Template: %s, tags=%v\\n", template.Title, template.Tags)
    fmt.Printf("Invoice:  %s, tags=%v\\n", invoice.Title, invoice.Tags)
    fmt.Printf("Template para[0]: %s\\n", template.Paragraphs[0].Text)
    fmt.Printf("Invoice  para[0]: %s\\n", invoice.Paragraphs[0].Text)
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `Template: Invoice Template, tags=[template finance]
Invoice:  Invoice #1042, tags=[template finance sent]
Template para[0]: Dear Customer,
Invoice  para[0]: Dear Acme Corp,`,

    whenToUse: [
      "You need to create objects that are variations of an existing instance, and construction from scratch is expensive or complex.",
      "You want to decouple code from the concrete types it copies — work with a Cloneable interface.",
      "Your types contain reference types (slices, maps, pointers) and you need truly independent copies.",
    ],

    whenNotToUse: [
      "Your type is simple and has only value fields — plain struct assignment is the correct copy mechanism.",
      "Deep copying is too expensive for your use case — consider immutable shared state (Flyweight) instead.",
      "You only need a few variations — a constructor with parameters is simpler than cloning and modifying.",
    ],

    advantages: [
      "Makes copy semantics explicit — no hidden sharing of reference types.",
      "New objects without knowing their concrete type (via a Cloneable interface).",
      "Avoids complex construction when the prototype already has the right shape.",
    ],
    disadvantages: [
      "Deep copy code is tedious and must be updated whenever fields are added.",
      "No compiler enforcement — if you add a slice field and forget to clone it, you get a subtle bug.",
      "Circular references make deep copying significantly harder.",
      "Performance cost of copying large object graphs.",
    ],

    relatedPatterns: [
      { slug: "factory-method", relation: "Factory Method creates via constructors; Prototype creates via cloning." },
      { slug: "memento", relation: "Memento also captures object state, but for save/restore rather than cloning." },
    ],
  },

  "singleton": {
    intentDetail: `Singleton ensures a type has exactly one instance and provides a global access point. In Go, the idiomatic implementation uses a package-level variable and sync.Once for thread-safe lazy initialization. But here's the honest truth: in most Go codebases, Singleton is an anti-pattern. It creates global mutable state, makes testing painful, and hides dependencies. The recommended alternative is dependency injection.`,

    problem: `Your application needs a database connection pool. Creating multiple pools wastes resources and can hit connection limits. You want exactly one pool shared across the entire application. The naive approach uses a global variable initialized at package load time — but package init order is fragile, and there's no way to configure the pool differently for tests.`,

    problemCode: `package db

import "database/sql"

// Global state, initialized at import time.
// Problems:
// 1. Can't configure differently for tests
// 2. Package init order may not have config ready yet
// 3. Any package that imports db gets a real database connection
// 4. No way to swap in a mock
var Pool *sql.DB

func init() {
    var err error
    Pool, err = sql.Open("postgres", "host=prod-db ...")
    if err != nil {
        panic(err)
    }
}`,
    problemCodeFile: "db_global.go",

    problemExplain: `This global pool couples every consumer to a real database. Tests can't run without a PostgreSQL server. The DSN is hardcoded. And init() runs at import time, before your application has a chance to read configuration or set up test fixtures.`,

    solutionIntro: `The Go-idiomatic singleton uses sync.Once for thread-safe lazy initialization. Then we'll show why dependency injection is almost always better.`,

    diagram: `        sync.Once
            │
  ┌─────────▼──────────┐
  │  GetPool()         │
  │  ┌───────────────┐ │
  │  │  once.Do(     │ │
  │  │    initPool   │ │
  │  │  )            │ │
  │  └───────────────┘ │
  │  return pool       │
  └────────────────────┘
            │
  First call: creates pool
  All others: returns same instance`,
    diagramCaption: "sync.Once guarantees the initialization function runs exactly once, even under concurrent access.",

    solutionSteps: [
      {
        prose: "The sync.Once singleton — correct but not recommended:",
        code: `package db

import (
    "database/sql"
    "sync"
)

var (
    pool *sql.DB
    once sync.Once
)

func GetPool(dsn string) *sql.DB {
    once.Do(func() {
        var err error
        pool, err = sql.Open("postgres", dsn)
        if err != nil {
            panic(err) // or handle more gracefully
        }
    })
    return pool
}`,
        filename: "singleton.go",
      },
      {
        prose: `This works correctly. It's thread-safe, lazy, and the DSN is configurable. But it's still global mutable state. Tests that call GetPool get a real database connection, and there's no way to swap in a fake.

The recommended alternative: dependency injection. Pass the pool as a parameter.`,
        code: `package orders

import "database/sql"

// OrderStore depends on an interface, not a global.
type OrderStore struct {
    db *sql.DB
}

func NewOrderStore(db *sql.DB) *OrderStore {
    return &OrderStore{db: db}
}

func (s *OrderStore) FindByID(id string) (*Order, error) {
    row := s.db.QueryRow("SELECT ... WHERE id = $1", id)
    // ...
    return &Order{}, nil
}`,
        filename: "store.go",
      },
      {
        prose: "Wire it up in main — the only place that knows about the real database:",
        code: `package main

import (
    "database/sql"
    "fmt"
    "log"
    "orders"
)

func main() {
    db, err := sql.Open("postgres", "host=prod-db ...")
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    store := orders.NewOrderStore(db)
    // store uses the injected db — no globals, fully testable
    fmt.Println(store)
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `&{0xc0000b4000}`,

    whenToUse: [
      "You genuinely need exactly one instance of something — a hardware driver, a license manager — and dependency injection is impractical.",
      "Package-level, immutable configuration (e.g., a compiled regex, a frozen lookup table) — these are fine as package-level vars, and sync.Once is the right initialization tool.",
    ],

    whenNotToUse: [
      "The 'single instance' is a database pool, logger, or service client. Use dependency injection instead — pass it through constructors. Your tests will thank you.",
      "You're using Singleton because 'there should only be one.' That's an application constraint, not a reason to bake it into the type. Let main() enforce uniqueness by creating one and passing it around.",
      "You need different instances in tests. Singleton makes this painful.",
    ],

    alternativeNote: "In Go, dependency injection (passing dependencies as interface values to constructors) is almost always preferable to singletons. It produces testable, explicit code with no hidden global state. Reserve sync.Once for genuine once-per-process initialization like compiled regexes or hardware handles.",

    advantages: [
      "Guarantees exactly one instance — useful for resource-constrained objects.",
      "sync.Once is simple, correct, and has zero contention after initialization.",
      "Lazy initialization defers costly setup until actually needed.",
    ],
    disadvantages: [
      "Creates hidden global state that makes code harder to reason about.",
      "Extremely difficult to test — you can't swap in a fake without build tags or interface wrappers.",
      "Violates the Dependency Inversion Principle — consumers depend on a concrete global, not an injected interface.",
      "Concurrency bugs if you mutate the singleton's state without additional synchronization.",
    ],

    relatedPatterns: [
      { slug: "factory-method", relation: "Factory methods can enforce singleton behavior for specific types." },
      { slug: "builder", relation: "A builder configured once can serve a similar 'single configuration' role without global state." },
    ],
  },
};