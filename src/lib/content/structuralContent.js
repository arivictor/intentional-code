export const STRUCTURAL_CONTENT = {
  "adapter": {
    intentDetail: `Adapter wraps an existing type so it satisfies a different interface. In Go, this is a struct that holds a reference to the "adaptee" and implements the target interface by delegating calls with any necessary translation.

This is one of the most commonly used patterns in Go, often without being recognized as a pattern. Any time you write a wrapper struct to make one package's type compatible with another package's interface, you're using Adapter.`,

    problem: `You're integrating a third-party payment gateway. Your application works with a PaymentProcessor interface, but the gateway's SDK has a completely different method signature. You can't modify the SDK, and you don't want to change your application's interface — it's used in dozens of places.`,

    problemCode: `package payment

// Your application's interface
type PaymentProcessor interface {
    Charge(customerID string, amountCents int64) (transactionID string, err error)
}

// Third-party SDK — you can't change this
type StripeGateway struct {
    APIKey string
}

func (s *StripeGateway) CreateCharge(params map[string]interface{}) (map[string]interface{}, error) {
    // Completely different signature: map-based, amount in dollars, different naming
    // Your PaymentProcessor interface expects (string, int64) → (string, error)
    // These don't match. Now what?
    return map[string]interface{}{"id": "ch_123"}, nil
}`,
    problemCodeFile: "mismatch.go",

    problemExplain: `The SDK's method takes a map and returns a map. Your interface takes typed parameters and returns a string. You can't change either side. Without an adapter, you'd scatter type conversions and map building throughout your codebase.`,

    solutionIntro: `Create a wrapper struct that holds the SDK client and implements your interface, translating between the two APIs in one place.`,

    diagram: `┌──────────────────────────┐
│    PaymentProcessor      │
│    <<interface>>          │
│──────────────────────────│
│ Charge(id, amt) (txn, e) │
└────────────┬─────────────┘
             │ implements
     ┌───────▼───────┐         ┌──────────────────┐
     │StripeAdapter  │────────►│  StripeGateway   │
     │               │ has-a   │  (third-party)   │
     │ Charge(...)   │         │ CreateCharge(...) │
     └───────────────┘         └──────────────────┘`,
    diagramCaption: "The adapter satisfies your interface while delegating to the third-party SDK.",

    solutionSteps: [
      {
        prose: "The adapter struct wraps the SDK and translates the call:",
        code: `package payment

import "fmt"

// StripeAdapter adapts StripeGateway to the PaymentProcessor interface.
type StripeAdapter struct {
    gateway *StripeGateway
}

func NewStripeAdapter(apiKey string) *StripeAdapter {
    return &StripeAdapter{
        gateway: &StripeGateway{APIKey: apiKey},
    }
}

func (a *StripeAdapter) Charge(customerID string, amountCents int64) (string, error) {
    params := map[string]interface{}{
        "customer": customerID,
        "amount":   amountCents,
        "currency": "usd",
    }
    result, err := a.gateway.CreateCharge(params)
    if err != nil {
        return "", fmt.Errorf("stripe charge failed: %w", err)
    }
    txnID, ok := result["id"].(string)
    if !ok {
        return "", fmt.Errorf("unexpected response format")
    }
    return txnID, nil
}`,
        filename: "adapter.go",
      },
      {
        prose: "Application code uses the interface — no knowledge of Stripe:",
        code: `package main

import (
    "fmt"
    "payment"
)

func processOrder(pp payment.PaymentProcessor, customerID string, total int64) {
    txn, err := pp.Charge(customerID, total)
    if err != nil {
        fmt.Printf("Payment failed: %v\\n", err)
        return
    }
    fmt.Printf("Payment successful: %s\\n", txn)
}

func main() {
    processor := payment.NewStripeAdapter("sk_test_xxx")
    processOrder(processor, "cust_42", 4999)
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `Payment successful: ch_123`,

    whenToUse: [
      "You need to use a type whose interface doesn't match what your code expects.",
      "You're integrating a third-party library and want to isolate its API from your domain.",
      "You're writing a compatibility layer between two subsystems with different conventions.",
    ],

    whenNotToUse: [
      "You can change the target interface to match — modifying the interface is simpler than wrapping.",
      "The adaptation is trivial (just renaming a method). Go's implicit interface satisfaction might mean you don't need a wrapper at all.",
      "You're adapting for hypothetical future flexibility. Only adapt when the mismatch is real.",
    ],

    advantages: [
      "Single Responsibility: translation logic lives in one place, not scattered across callers.",
      "Open/Closed: add new adapters for new SDKs without modifying existing code.",
      "Testable: your code tests against the interface, not the SDK.",
    ],
    disadvantages: [
      "Adds a layer of indirection — one more type to navigate.",
      "If the adapted API changes, the adapter must be updated (though this is better than updating every caller).",
      "Can mask performance issues if the translation is costly.",
    ],

    relatedPatterns: [
      { slug: "bridge", relation: "Bridge separates abstraction from implementation upfront; Adapter retrofits compatibility." },
      { slug: "decorator", relation: "Decorator adds behavior while keeping the same interface; Adapter changes the interface." },
      { slug: "facade", relation: "Facade simplifies a complex API; Adapter makes an incompatible API compatible." },
      { slug: "proxy", relation: "Proxy provides the same interface to control access; Adapter provides a different interface." },
    ],
  },

  "bridge": {
    intentDetail: `Bridge splits a large type into two independent dimensions that can vary separately — the abstraction (what you do) and the implementation (how you do it). In Go, both sides are interfaces composed via struct fields, not inheritance.

This pattern is useful when you'd otherwise face a combinatorial explosion of types: 3 shapes × 2 renderers = 6 types without Bridge, but only 3 + 2 = 5 with it.`,

    problem: `You're building a notification system that sends messages through different channels (email, SMS, push) with different urgency levels (regular, urgent). Without Bridge, you'd need RegularEmail, UrgentEmail, RegularSMS, UrgentSMS, RegularPush, UrgentPush — six types, growing quadratically.`,

    problemCode: `package notify

// Without Bridge: one type per (urgency × channel) combination.
// Adding a new channel means adding one type per urgency level.
// Adding a new urgency level means adding one type per channel.
// 3 channels × 3 urgency levels = 9 types.

type RegularEmailNotification struct{}
func (n *RegularEmailNotification) Send(msg string) { /* ... */ }

type UrgentEmailNotification struct{}
func (n *UrgentEmailNotification) Send(msg string) { /* prefix [URGENT], send email */ }

type RegularSMSNotification struct{}
func (n *RegularSMSNotification) Send(msg string) { /* ... */ }

type UrgentSMSNotification struct{}
func (n *UrgentSMSNotification) Send(msg string) { /* prefix [URGENT], send SMS */ }

// ... and so on. Adding "push" means 3 more types.`,
    problemCodeFile: "explosion.go",

    problemExplain: `Every combination of two independent dimensions produces a new type. This is a cartesian product that grows unmanageable. Worse, the urgency logic (how to format the message) is duplicated across every channel-specific type.`,

    solutionIntro: `Separate the two dimensions into two interfaces. The abstraction (urgency formatter) holds a reference to the implementation (delivery channel). They vary independently.`,

    diagram: `┌────────────────────┐         ┌──────────────────┐
│   <<interface>>    │         │  <<interface>>   │
│   MessageSender    │         │   Channel        │
│────────────────────│         │──────────────────│
│ Send(msg)          │────────►│ Deliver(msg)     │
└────────┬───────────┘  uses   └────────┬─────────┘
         │                              │
   ┌─────┼──────┐               ┌───────┼──────┐
   │            │               │              │
Regular     Urgent           Email          SMS
Sender      Sender          Channel        Channel`,
    diagramCaption: "Abstraction (left) and implementation (right) vary independently via composition.",

    solutionSteps: [
      {
        prose: "Define the implementation interface — the delivery channel:",
        code: `package notify

import "fmt"

// Channel is the implementation dimension — how messages are delivered.
type Channel interface {
    Deliver(message string) error
}

type EmailChannel struct{ Addr string }

func (e *EmailChannel) Deliver(message string) error {
    fmt.Printf("[Email → %s] %s\\n", e.Addr, message)
    return nil
}

type SMSChannel struct{ Phone string }

func (s *SMSChannel) Deliver(message string) error {
    fmt.Printf("[SMS → %s] %s\\n", s.Phone, message)
    return nil
}`,
        filename: "channels.go",
      },
      {
        prose: "Define the abstraction — message senders with different urgency handling:",
        code: `package notify

import "fmt"

// Sender is the abstraction dimension — how messages are formatted.
type Sender struct {
    channel Channel
}

type RegularSender struct{ Sender }

func NewRegularSender(ch Channel) *RegularSender {
    return &RegularSender{Sender{channel: ch}}
}

func (s *RegularSender) Send(msg string) error {
    return s.channel.Deliver(msg)
}

type UrgentSender struct{ Sender }

func NewUrgentSender(ch Channel) *UrgentSender {
    return &UrgentSender{Sender{channel: ch}}
}

func (s *UrgentSender) Send(msg string) error {
    return s.channel.Deliver(fmt.Sprintf("🚨 URGENT: %s", msg))
}`,
        filename: "senders.go",
      },
      {
        code: `package main

import "notify"

func main() {
    email := &notify.EmailChannel{Addr: "ops@example.com"}
    sms := &notify.SMSChannel{Phone: "+1-555-0123"}

    // Mix and match freely — no combinatorial explosion
    notify.NewRegularSender(email).Send("Deployment complete")
    notify.NewUrgentSender(email).Send("Server on fire")
    notify.NewRegularSender(sms).Send("Daily report ready")
    notify.NewUrgentSender(sms).Send("Database unreachable")
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `[Email → ops@example.com] Deployment complete
[Email → ops@example.com] 🚨 URGENT: Server on fire
[SMS → +1-555-0123] Daily report ready
[SMS → +1-555-0123] 🚨 URGENT: Database unreachable`,

    whenToUse: [
      "You have two or more independent dimensions of variation that would otherwise create a type explosion.",
      "You want to change the implementation at runtime (swap email for SMS).",
      "The abstraction and implementation should be able to evolve independently.",
    ],

    whenNotToUse: [
      "You only have one dimension of variation. Use a simple interface instead.",
      "The two dimensions are tightly coupled and always change together — separation adds complexity without benefit.",
      "Your type hierarchy is small and unlikely to grow. Two or three concrete types are fine.",
    ],

    advantages: [
      "Eliminates combinatorial type explosion — N + M instead of N × M.",
      "Abstraction and implementation evolve independently.",
      "You can swap implementations at runtime.",
    ],
    disadvantages: [
      "Adds structural complexity — more interfaces and types to understand.",
      "Can be overkill for simple hierarchies that don't face a real explosion.",
      "The abstraction/implementation split can be hard to identify correctly upfront.",
    ],

    relatedPatterns: [
      { slug: "adapter", relation: "Adapter connects existing incompatible types; Bridge designs the separation upfront." },
      { slug: "strategy", relation: "Strategy varies one algorithm; Bridge varies two dimensions simultaneously." },
    ],
  },

  "composite": {
    intentDetail: `Composite lets you treat individual objects and compositions of objects uniformly through a single interface. The classic example is a file system: both files and directories satisfy the same interface, and a directory contains other entries (which may themselves be directories).

In Go, this is one interface implemented by both leaf and composite types, where the composite holds a slice of the interface type and delegates operations recursively.`,

    problem: `You're building a pricing engine for product bundles. Products have a price. Bundles contain products and other bundles. You need to calculate the total price of any combination, but the code treats products and bundles differently, with type checks everywhere.`,

    problemCode: `package pricing

import "fmt"

type Product struct {
    Name  string
    Price int64
}

type Bundle struct {
    Name     string
    Products []Product
    Bundles  []Bundle
}

func TotalPrice(b Bundle) int64 {
    total := int64(0)
    for _, p := range b.Products {
        total += p.Price
    }
    for _, sub := range b.Bundles {
        total += TotalPrice(sub) // manual recursion, type-aware
    }
    return total
}

// Adding a "DiscountedProduct" or "SubscriptionBundle" requires
// modifying this function and every function like it.`,
    problemCodeFile: "pricing_naive.go",

    problemExplain: `The code must know about every type in the hierarchy. Adding a new kind of priceable item (a subscription, a gift card, a discount wrapper) means changing TotalPrice and every similar function. The tree structure is implicit and fragile.`,

    solutionIntro: `Define a single interface — PriceComponent — that both leaf items and composites implement. The composite delegates to its children, and the tree structure emerges naturally.`,

    diagram: `┌─────────────────────────┐
│     <<interface>>       │
│    PriceComponent       │
│─────────────────────────│
│ + Price() int64         │
│ + Name()  string        │
└────────────┬────────────┘
             │ implements
     ┌───────┼────────┐
     │                │
┌────▼──────┐  ┌──────▼──────┐
│  Product  │  │   Bundle    │
│ (leaf)    │  │ (composite) │
│           │  │             │
│ Price()   │  │ children    │──► []PriceComponent
│ Name()    │  │ Price()     │    (recursive)
└───────────┘  │ Name()      │
               └─────────────┘`,
    diagramCaption: "Both leaf and composite satisfy the same interface. Bundle's Price() sums its children recursively.",

    solutionSteps: [
      {
        code: `package pricing

import "fmt"

// PriceComponent is anything with a price.
type PriceComponent interface {
    Price() int64
    Name() string
}

// Product is a leaf node.
type Product struct {
    name  string
    price int64
}

func NewProduct(name string, price int64) *Product {
    return &Product{name: name, price: price}
}

func (p *Product) Price() int64  { return p.price }
func (p *Product) Name() string  { return p.name }

// Bundle is a composite node.
type Bundle struct {
    name     string
    children []PriceComponent
}

func NewBundle(name string, children ...PriceComponent) *Bundle {
    return &Bundle{name: name, children: children}
}

func (b *Bundle) Price() int64 {
    total := int64(0)
    for _, c := range b.children {
        total += c.Price()
    }
    return total
}

func (b *Bundle) Name() string { return b.name }

func (b *Bundle) Add(c PriceComponent) {
    b.children = append(b.children, c)
}`,
        filename: "pricing.go",
      },
      {
        code: `package main

import (
    "fmt"
    "pricing"
)

func main() {
    keyboard := pricing.NewProduct("Keyboard", 7999)
    mouse := pricing.NewProduct("Mouse", 3999)
    monitor := pricing.NewProduct("Monitor", 39999)

    peripherals := pricing.NewBundle("Peripherals", keyboard, mouse)
    workstation := pricing.NewBundle("Workstation", peripherals, monitor)

    // Uniform interface — works the same for products and bundles
    items := []pricing.PriceComponent{keyboard, peripherals, workstation}
    for _, item := range items {
        fmt.Printf("%-15s $%6.2f\\n", item.Name(), float64(item.Price())/100)
    }
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `Keyboard        $  79.99
Peripherals     $ 119.98
Workstation     $ 519.97`,

    whenToUse: [
      "You have a tree structure where parts and wholes should be treated uniformly.",
      "Clients shouldn't need to know whether they're working with a single object or a group.",
      "New component types should be addable without modifying the tree-traversal logic.",
    ],

    whenNotToUse: [
      "Your structure isn't a tree. Composite adds unnecessary complexity to flat collections.",
      "Leaf and composite types have very different operations. Forcing a common interface creates methods that don't make sense for one side.",
      "You don't need uniform treatment — it's fine to treat items and groups differently.",
    ],

    advantages: [
      "Uniform interface for individual items and groups — clean, recursive code.",
      "New component types are easy to add without changing existing traversal logic.",
      "Tree depth is unlimited and naturally recursive.",
    ],
    disadvantages: [
      "The common interface may be too general — some methods might not make sense for all components.",
      "Harder to restrict what can go where (e.g., preventing a product from being added to itself).",
      "Debugging deep trees can be tricky — errors may be buried many levels deep.",
    ],

    relatedPatterns: [
      { slug: "decorator", relation: "Decorator wraps one object; Composite wraps many." },
      { slug: "iterator", relation: "Iterator provides a way to traverse composite structures." },
      { slug: "visitor", relation: "Visitor separates operations from the composite structure." },
    ],
  },

  "decorator": {
    intentDetail: `Decorator wraps an object to add behavior, keeping the same interface. In Go, this pattern is everywhere — it's how HTTP middleware works. Any function that takes an interface and returns the same interface, adding behavior in between, is a decorator.

The canonical Go example is http.Handler middleware: a function that takes a handler, returns a new handler that logs, authenticates, compresses, or rate-limits, and then calls the original.`,

    problem: `You have an HTTP handler that serves an API. You need to add logging. Then authentication. Then CORS headers. Then rate limiting. Each concern is independent, but you don't want to stuff all of them into one giant handler. And you want to compose them differently for different routes.`,

    problemCode: `package api

import (
    "log"
    "net/http"
    "time"
)

func handleOrder(w http.ResponseWriter, r *http.Request) {
    // Authentication check (shouldn't be here)
    token := r.Header.Get("Authorization")
    if token == "" {
        http.Error(w, "unauthorized", 401)
        return
    }

    // Logging (shouldn't be here)
    start := time.Now()
    defer func() {
        log.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start))
    }()

    // CORS (shouldn't be here)
    w.Header().Set("Access-Control-Allow-Origin", "*")

    // Actual business logic — buried under cross-cutting concerns
    w.Write([]byte("order processed"))
}`,
    problemCodeFile: "fat_handler.go",

    problemExplain: `Every cross-cutting concern is tangled into the handler. Want logging on another route? Copy-paste. Want auth on some routes but not others? Conditionals. This doesn't scale, and the business logic is obscured by plumbing.`,

    solutionIntro: `Each concern becomes a middleware function: it takes an http.Handler, returns a new http.Handler that adds one behavior, and calls the original. Stack them like function composition.`,

    diagram: `Request ──► Logging ──► Auth ──► CORS ──► Handler
                │           │        │         │
              wraps       wraps    wraps     actual
             handler     handler  handler   logic

Each layer: func(http.Handler) http.Handler`,
    diagramCaption: "Middleware wraps handlers like layers of an onion. Each adds one behavior.",

    solutionSteps: [
      {
        prose: "Each middleware is a function that wraps a handler:",
        code: `package middleware

import (
    "log"
    "net/http"
    "time"
)

// Logging logs the method, path, and duration of each request.
func Logging(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        next.ServeHTTP(w, r)
        log.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start))
    })
}

// Auth rejects requests without an Authorization header.
func Auth(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.Header.Get("Authorization") == "" {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }
        next.ServeHTTP(w, r)
    })
}

// CORS adds permissive CORS headers.
func CORS(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "*")
        w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")
        next.ServeHTTP(w, r)
    })
}`,
        filename: "middleware.go",
      },
      {
        prose: "Compose them in any combination:",
        code: `package main

import (
    "middleware"
    "net/http"
)

func orderHandler(w http.ResponseWriter, r *http.Request) {
    w.Write([]byte("order processed"))
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
    w.Write([]byte("ok"))
}

func main() {
    // Orders: logging + auth + CORS
    orders := middleware.Logging(
        middleware.Auth(
            middleware.CORS(
                http.HandlerFunc(orderHandler),
            ),
        ),
    )

    // Health: logging only — no auth, no CORS
    health := middleware.Logging(http.HandlerFunc(healthHandler))

    http.Handle("/orders", orders)
    http.Handle("/health", health)
    http.ListenAndServe(":8080", nil)
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `GET /health 52µs
GET /orders 128µs`,

    whenToUse: [
      "You need to add behavior to objects without modifying their code.",
      "You want to compose behaviors independently — different combinations for different cases.",
      "The behavior is cross-cutting (logging, auth, caching, metrics) and shouldn't live in business logic.",
      "You see yourself wrapping an http.Handler — you're already using Decorator.",
    ],

    whenNotToUse: [
      "The added behavior is tightly coupled to the object's internals. A decorator that needs private fields isn't a decorator — it's a refactoring need.",
      "Deep decorator stacks (5+ layers) make debugging difficult. Consider whether a pipeline or chain pattern would be clearer.",
      "You only ever need one fixed combination. Direct composition in a single handler might be simpler.",
    ],

    advantages: [
      "Each concern is isolated in its own function — Single Responsibility.",
      "Compose any combination at the call site without creating new types.",
      "Standard Go idiom for HTTP middleware — instantly recognizable.",
    ],
    disadvantages: [
      "Deep wrapping can make stack traces harder to read.",
      "Order matters: Logging(Auth(handler)) logs all requests; Auth(Logging(handler)) only logs authenticated ones.",
      "Each wrapper adds a function call, though the overhead is negligible for HTTP handlers.",
    ],

    relatedPatterns: [
      { slug: "adapter", relation: "Adapter changes the interface; Decorator keeps the same interface and adds behavior." },
      { slug: "composite", relation: "Decorator wraps one object; Composite wraps many." },
      { slug: "proxy", relation: "Proxy controls access; Decorator adds behavior. Both wrap with the same interface." },
      { slug: "chain-of-responsibility", relation: "Middleware chains are a form of both Decorator and Chain of Responsibility." },
    ],
  },

  "facade": {
    intentDetail: `Facade provides a simplified interface to a complex subsystem. It doesn't add new functionality — it curates existing functionality into a convenient API that covers the most common use cases. In Go, this is typically a struct that coordinates multiple packages or services behind a small set of methods.`,

    problem: `You're building an e-commerce checkout. The process involves validating the cart, checking inventory, processing payment, sending a confirmation email, and updating analytics. Each subsystem has its own package with its own API. Orchestrating all of them in every handler that needs "checkout" logic is verbose and error-prone.`,

    problemCode: `package handler

func HandleCheckout(w http.ResponseWriter, r *http.Request) {
    cart := cartpkg.Load(r)
    if err := cartpkg.Validate(cart); err != nil { /* ... */ }
    for _, item := range cart.Items {
        if !inventory.Check(item.SKU, item.Qty); err != nil { /* ... */ }
    }
    txn, err := payment.Charge(cart.CustomerID, cart.Total())
    if err != nil { /* ... */ }
    inventory.Reserve(cart.Items)
    email.SendConfirmation(cart.CustomerEmail, txn.ID)
    analytics.Track("checkout", map[string]string{"txn": txn.ID})
    // Every handler that needs checkout must repeat this dance
}`,
    problemCodeFile: "checkout_scattered.go",

    problemExplain: `This orchestration logic is duplicated wherever checkout happens — the HTTP handler, a CLI tool, a batch processor. Change the sequence (e.g., add fraud checking) and you must find and update every copy.`,

    solutionIntro: `Create a Checkout facade struct that encapsulates the multi-step process. Callers get one method; the facade coordinates the subsystems.`,

    diagram: `                  ┌────────────────────┐
    Handler ─────►│   CheckoutFacade   │
    CLI    ─────►│                    │
    Batch  ─────►│ PlaceOrder(cart)   │
                  └───────┬────────────┘
                          │ coordinates
            ┌─────────────┼─────────────────┐
            │             │                 │
      ┌─────▼────┐  ┌─────▼────┐   ┌───────▼──────┐
      │ Inventory │  │ Payment  │   │ Email/Analyt.│
      └──────────┘  └──────────┘   └──────────────┘`,
    diagramCaption: "The facade coordinates subsystem calls into a single PlaceOrder operation.",

    solutionSteps: [
      {
        code: `package checkout

import "fmt"

// Dependencies as interfaces — testable, swappable.
type InventoryChecker interface {
    Available(sku string, qty int) bool
    Reserve(sku string, qty int) error
}

type PaymentProcessor interface {
    Charge(customerID string, amount int64) (string, error)
}

type Mailer interface {
    SendConfirmation(email, txnID string) error
}

type CartItem struct {
    SKU string
    Qty int
}

type Cart struct {
    CustomerID    string
    CustomerEmail string
    Items         []CartItem
    Total         int64
}

// Facade coordinates the checkout process.
type Facade struct {
    inventory InventoryChecker
    payment   PaymentProcessor
    mailer    Mailer
}

func NewFacade(inv InventoryChecker, pay PaymentProcessor, mail Mailer) *Facade {
    return &Facade{inventory: inv, payment: pay, mailer: mail}
}

func (f *Facade) PlaceOrder(cart Cart) (string, error) {
    // Step 1: check inventory
    for _, item := range cart.Items {
        if !f.inventory.Available(item.SKU, item.Qty) {
            return "", fmt.Errorf("item %s not available", item.SKU)
        }
    }

    // Step 2: process payment
    txnID, err := f.payment.Charge(cart.CustomerID, cart.Total)
    if err != nil {
        return "", fmt.Errorf("payment failed: %w", err)
    }

    // Step 3: reserve inventory
    for _, item := range cart.Items {
        if err := f.inventory.Reserve(item.SKU, item.Qty); err != nil {
            return "", fmt.Errorf("reservation failed: %w", err)
        }
    }

    // Step 4: send confirmation
    f.mailer.SendConfirmation(cart.CustomerEmail, txnID)

    return txnID, nil
}`,
        filename: "checkout.go",
      },
    ],

    exampleOutput: `Order placed: txn_abc123`,

    whenToUse: [
      "Multiple subsystems must be coordinated in a specific sequence, and that sequence is needed in more than one place.",
      "You want to isolate clients from subsystem complexity.",
      "You're wrapping a third-party library or legacy system with a cleaner API.",
    ],

    whenNotToUse: [
      "The subsystem is already simple. A facade over one function is just indirection.",
      "Different callers need different orchestration sequences. The facade becomes a god object with many methods.",
      "You're hiding complexity that callers actually need to understand and control.",
    ],

    advantages: [
      "Simplifies client code — one method instead of a multi-step dance.",
      "Changes to the process happen in one place.",
      "Subsystems remain independent and reusable outside the facade.",
    ],
    disadvantages: [
      "Can become a god object if it accumulates too many operations.",
      "Hides subsystem capabilities that power users might need.",
      "Adds a layer of abstraction that may not be justified for simple workflows.",
    ],

    relatedPatterns: [
      { slug: "adapter", relation: "Adapter makes one interface compatible; Facade simplifies a whole subsystem." },
      { slug: "mediator", relation: "Mediator coordinates peer interactions; Facade coordinates subsystem calls." },
    ],
  },

  "flyweight": {
    intentDetail: `Flyweight minimizes memory by sharing immutable data (intrinsic state) across many objects, while keeping variable data (extrinsic state) separate. In Go, this typically means a map that interns shared values, returning pointers to the same instance instead of creating duplicates.

sync.Pool is a related but different tool — it recycles mutable temporary objects to reduce GC pressure, whereas Flyweight shares immutable permanent state.`,

    problem: `You're building a game with thousands of tree objects in a forest. Each tree has a species (name, texture, color — large, repeated data) and a position (small, unique data). Storing the full species data on every tree wastes hundreds of megabytes.`,

    problemCode: `package forest

type Tree struct {
    X, Y    float64
    Species string  // "Oak", "Pine", "Birch" — same across thousands
    Texture []byte  // Large texture data — identical for same species
    Color   [3]byte // RGB — identical for same species
    Height  float64 // Unique per tree
}

// 10,000 oak trees each store the same 2MB texture.
// That's 20GB of duplicated data.`,
    problemCodeFile: "bloated.go",

    problemExplain: `The species name, texture, and color are the same for all oaks. Storing them on every tree instance is wasteful. With 10,000 trees, you're storing 10,000 copies of data that could be stored once.`,

    solutionIntro: `Extract the shared intrinsic state (species data) into a separate type. Use a factory that interns these types — returning the existing instance if one with the same key already exists.`,

    diagram: `┌────────────────┐
│ TreeType (shared)│ ◄── interned, one per species
│ Name, Texture,  │
│ Color           │
└───────┬────────┘
        │ many trees reference same TreeType
┌───────▼────────┐
│ Tree (unique)  │
│ X, Y, Height   │
│ Type *TreeType  │
└────────────────┘`,
    diagramCaption: "Thousands of Tree instances reference a handful of interned TreeType values.",

    solutionSteps: [
      {
        code: `package forest

import "fmt"

// TreeType holds shared intrinsic state — one per species.
type TreeType struct {
    Name    string
    Texture string // simplified for demonstration
    Color   [3]byte
}

// Tree holds unique extrinsic state + a reference to shared data.
type Tree struct {
    X, Y   float64
    Height float64
    Type   *TreeType
}

func (t *Tree) Render() string {
    return fmt.Sprintf("%s at (%.0f,%.0f) h=%.1f color=#%02x%02x%02x",
        t.Type.Name, t.X, t.Y, t.Height,
        t.Type.Color[0], t.Type.Color[1], t.Type.Color[2])
}

// Factory interns TreeType instances.
var typeCache = map[string]*TreeType{}

func GetTreeType(name, texture string, color [3]byte) *TreeType {
    key := name
    if tt, ok := typeCache[key]; ok {
        return tt
    }
    tt := &TreeType{Name: name, Texture: texture, Color: color}
    typeCache[key] = tt
    return tt
}`,
        filename: "forest.go",
      },
      {
        code: `package main

import (
    "fmt"
    "forest"
)

func main() {
    oak := forest.GetTreeType("Oak", "oak_bark.png", [3]byte{34, 120, 15})
    pine := forest.GetTreeType("Pine", "pine_bark.png", [3]byte{10, 80, 30})

    trees := []*forest.Tree{
        {X: 10, Y: 20, Height: 15.5, Type: oak},
        {X: 30, Y: 40, Height: 12.0, Type: oak},   // same *TreeType
        {X: 50, Y: 60, Height: 20.0, Type: pine},
        {X: 70, Y: 80, Height: 18.3, Type: pine},   // same *TreeType
    }

    for _, t := range trees {
        fmt.Println(t.Render())
    }
    fmt.Printf("\\nUnique tree types: %d (shared across %d trees)\\n",
        2, len(trees))
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `Oak at (10,20) h=15.5 color=#22780f
Oak at (30,40) h=12.0 color=#22780f
Pine at (50,60) h=20.0 color=#0a501e
Pine at (70,80) h=18.3 color=#0a501e

Unique tree types: 2 (shared across 4 trees)`,

    whenToUse: [
      "You have a large number of objects that share significant amounts of identical data.",
      "Memory usage is a measurable problem — profile before optimizing.",
      "The shared state is immutable (or can be made immutable).",
      "You can clearly separate intrinsic (shared) from extrinsic (unique) state.",
    ],

    whenNotToUse: [
      "You don't have enough objects for the sharing to matter. Profile first.",
      "The shared state is mutable — concurrent mutation of shared state creates race conditions.",
      "The distinction between intrinsic and extrinsic state is unclear or unstable.",
    ],

    advantages: [
      "Dramatic memory reduction when many objects share the same data.",
      "The interning map provides deduplication automatically.",
    ],
    disadvantages: [
      "Adds complexity — two types instead of one, plus the interning factory.",
      "The intern map is package-level mutable state (use sync.Mutex in concurrent code).",
      "Trading CPU (hash lookups) for memory — measure both.",
      "Shared state must be immutable. If you accidentally mutate it, all referencing objects break.",
    ],

    relatedPatterns: [
      { slug: "composite", relation: "Flyweight nodes can be leaves in a Composite tree." },
      { slug: "singleton", relation: "Both involve shared instances; Singleton is one instance total, Flyweight is one per key." },
    ],
  },

  "proxy": {
    intentDetail: `Proxy wraps an object with the same interface to control access to it. The wrapper can add lazy initialization, access control, logging, caching, or remote communication — all without the client knowing it's not talking to the real object.

In Go, Proxy and Decorator look structurally identical (both wrap an interface). The distinction is intent: Decorator adds new behavior; Proxy controls access to existing behavior.`,

    problem: `You have a database query service that's expensive to initialize and you don't always need it. Some callers also need access control — only admins should be able to run certain queries. You want to delay initialization until the first actual call and enforce permissions, but you don't want to change the service's interface or litter every call site with auth checks.`,

    problemCode: `package db

type QueryService struct {
    conn *Connection // expensive to create
}

func NewQueryService() *QueryService {
    // This connects to the database immediately,
    // even if no queries are ever made.
    conn := Connect("prod-db:5432") // slow, may fail
    return &QueryService{conn: conn}
}

func (s *QueryService) Execute(query string) ([]Row, error) {
    return s.conn.Query(query)
}`,
    problemCodeFile: "eager.go",

    problemExplain: `The service eagerly connects to the database. If the handler path doesn't always need queries, this wastes a connection. And there's no access control — any caller can execute any query.`,

    solutionIntro: `Create a proxy that implements the same interface. It lazily initializes the real service on first use and checks permissions before delegating.`,

    diagram: `┌────────────────────────┐
│    <<interface>>       │
│    QueryRunner         │
│────────────────────────│
│ Execute(q) ([]Row, e)  │
└────────────┬───────────┘
             │ implements
     ┌───────┼───────┐
     │               │
┌────▼────────┐ ┌────▼──────────┐
│QueryService │ │  QueryProxy   │
│ (real)      │ │ (proxy)       │
│             │ │ - lazy init   │
│ Execute()   │ │ - access ctrl │
└─────────────┘ │ Execute()     │
                └───────────────┘`,
    diagramCaption: "The proxy implements the same interface and adds lazy initialization and access control.",

    solutionSteps: [
      {
        code: `package db

import (
    "fmt"
    "sync"
)

// QueryRunner is the interface both real service and proxy implement.
type QueryRunner interface {
    Execute(query string) ([]string, error)
}

// RealQueryService is the expensive real implementation.
type RealQueryService struct{}

func (s *RealQueryService) Execute(query string) ([]string, error) {
    fmt.Println("[db] Executing:", query)
    return []string{"row1", "row2"}, nil
}

// QueryProxy adds lazy initialization and access control.
type QueryProxy struct {
    real   *RealQueryService
    once   sync.Once
    role   string
}

func NewQueryProxy(role string) *QueryProxy {
    return &QueryProxy{role: role}
}

func (p *QueryProxy) init() {
    fmt.Println("[proxy] Initializing database connection...")
    p.real = &RealQueryService{}
}

func (p *QueryProxy) Execute(query string) ([]string, error) {
    // Access control
    if p.role != "admin" {
        return nil, fmt.Errorf("access denied: role %q cannot execute queries", p.role)
    }

    // Lazy initialization
    p.once.Do(p.init)

    // Logging
    fmt.Printf("[proxy] role=%s query=%s\\n", p.role, query)

    return p.real.Execute(query)
}`,
        filename: "proxy.go",
      },
      {
        code: `package main

import (
    "db"
    "fmt"
)

func runQuery(runner db.QueryRunner, query string) {
    rows, err := runner.Execute(query)
    if err != nil {
        fmt.Printf("Error: %v\\n", err)
        return
    }
    fmt.Printf("Results: %v\\n\\n", rows)
}

func main() {
    admin := db.NewQueryProxy("admin")
    viewer := db.NewQueryProxy("viewer")

    runQuery(admin, "SELECT * FROM orders")
    runQuery(admin, "SELECT * FROM users") // no re-init
    runQuery(viewer, "SELECT * FROM secrets")
}`,
        filename: "main.go",
      },
    ],

    exampleOutput: `[proxy] role=admin query=SELECT * FROM orders
[proxy] Initializing database connection...
[db] Executing: SELECT * FROM orders
Results: [row1 row2]

[proxy] role=admin query=SELECT * FROM users
[db] Executing: SELECT * FROM users
Results: [row1 row2]

Error: access denied: role "viewer" cannot execute queries`,

    whenToUse: [
      "You need lazy initialization — the real object is expensive to create and may not be needed.",
      "You need access control — check permissions before delegating to the real object.",
      "You need logging or caching around an interface without modifying the implementation.",
      "You want a local representative for a remote object.",
    ],

    whenNotToUse: [
      "The real object is cheap to create. Lazy initialization adds complexity without benefit.",
      "Access control belongs at a higher level (HTTP middleware, gateway) rather than at the object level.",
      "You're adding behavior (not controlling access) — that's Decorator, not Proxy.",
    ],

    advantages: [
      "Controls access without changing the real object or its clients.",
      "Lazy initialization defers costly work until it's actually needed.",
      "sync.Once makes the initialization goroutine-safe with no contention after first call.",
    ],
    disadvantages: [
      "Adds indirection — harder to trace which implementation is actually running.",
      "The proxy must stay in sync with the real interface — if methods are added, the proxy must be updated.",
      "Lazy initialization can surprise callers if the first call takes unexpectedly long.",
    ],

    relatedPatterns: [
      { slug: "adapter", relation: "Adapter changes the interface; Proxy preserves it." },
      { slug: "decorator", relation: "Structurally identical to Proxy, but intent differs: Decorator adds behavior, Proxy controls access." },
    ],
  },
};