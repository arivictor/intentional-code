---
title: The Twelve-Factor App
description: A methodology for building software-as-a-service that is portable, deployable, and operable at scale.
---

# The Twelve-Factor App

The Twelve-Factor App methodology, published by Heroku engineers in 2011, describes twelve practices for building modern web applications and services. The goal is portability (runs the same anywhere), operability (easy to deploy and scale), and developer experience (minimal ceremony between writing code and running it).

These aren't abstract ideals. Each factor solves a specific operational problem that teams hit repeatedly as applications grow.

---

## I. Codebase

*One codebase tracked in version control, many deploys.*

One repository per application. Multiple environments (staging, production, QA) deploy from the same repo at different commits — they are not different codebases. If you find yourself maintaining separate repos for separate environments, or a monorepo where multiple apps are tightly entangled, the app boundary is wrong.

---

## II. Dependencies

*Explicitly declare and isolate dependencies.*

Never rely on implicit system-wide packages. Declare every dependency explicitly and isolate the app from the surrounding environment.

```go
// go.mod explicitly declares all dependencies and their exact versions.
// go.sum pins each dependency to a cryptographic hash.
// A fresh checkout on any machine resolves to identical binaries.

module github.com/example/myapp

go 1.22

require (
    github.com/lib/pq v1.10.9
    golang.org/x/crypto v0.21.0
)
```

Run `go mod vendor` to include dependencies in the repo, ensuring reproducible builds even if upstream disappears.

---

## III. Config

*Store config in the environment, not in code.*

Config is anything that varies between deploys: database URLs, API keys, hostnames, feature flags. It must never be hardcoded or committed to the repository.

```go
// BAD — config hardcoded in source.
const databaseURL = "postgres://prod-db.internal/myapp"

// GOOD — config from environment variables.
dbURL := os.Getenv("DATABASE_URL")
if dbURL == "" {
    log.Fatal("DATABASE_URL is required")
}
```

A useful test: could the codebase be made public right now without compromising credentials? If the answer is no, config is leaking into code.

Use a struct to centralize config loading at startup, so failures are loud and early:

```go
type Config struct {
    DatabaseURL string
    Port        int
    SecretKey   string
}

func LoadConfig() (Config, error) {
    port, err := strconv.Atoi(os.Getenv("PORT"))
    if err != nil {
        return Config{}, fmt.Errorf("invalid PORT: %w", err)
    }
    cfg := Config{
        DatabaseURL: os.Getenv("DATABASE_URL"),
        Port:        port,
        SecretKey:   os.Getenv("SECRET_KEY"),
    }
    if cfg.DatabaseURL == "" {
        return Config{}, errors.New("DATABASE_URL is required")
    }
    return cfg, nil
}
```

---

## IV. Backing Services

*Treat backing services as attached resources.*

Databases, queues, caches, SMTP servers — all are attached resources accessed via URL or credentials from config. The app should be able to swap a local Postgres for a managed RDS instance with only a config change.

```go
// The app receives a connection string; it doesn't know or care
// whether it points to a local container or a cloud database.
db, err := sql.Open("postgres", cfg.DatabaseURL)
```

---

## V. Build, Release, Run

*Strictly separate build, release, and run stages.*

- **Build:** compile source and assets into an executable.
- **Release:** combine the build with config to produce a release (timestamped, immutable).
- **Run:** execute the release in an environment.

No modifications at run time. The running binary is the release. If you need to change config, create a new release.

```dockerfile
# Multi-stage Dockerfile separates build from run.
FROM golang:1.22 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app/server ./cmd/server

FROM gcr.io/distroless/static
COPY --from=builder /app/server /server
ENTRYPOINT ["/server"]
```

---

## VI. Processes

*Execute the app as one or more stateless processes.*

Processes share nothing. Any data that needs to persist must be stored in a backing service (database, cache). In-memory state and local disk are ephemeral — the process may be restarted or replaced at any time.

```go
// BAD — storing session state in process memory.
var sessions = map[string]Session{}

// GOOD — sessions stored in Redis, accessible by any process instance.
func GetSession(ctx context.Context, rdb *redis.Client, token string) (Session, error) {
    data, err := rdb.Get(ctx, "session:"+token).Bytes()
    // ...
}
```

---

## VII. Port Binding

*Export services via port binding.*

The app is self-contained and serves by binding to a port — it does not rely on an external web server. In Go, this is the default: `net/http` binds directly.

```go
port := os.Getenv("PORT")
if port == "" {
    port = "8080"
}
log.Fatal(http.ListenAndServe(":"+port, mux))
```

---

## VIII. Concurrency

*Scale out via the process model.*

Scale horizontally by running more processes, not by making individual processes larger. Design around the Unix process model: small, focused process types (web, worker, scheduler) that can be scaled independently.

Go's goroutines handle concurrency within a process. Kubernetes or a process manager handles scaling across processes.

Design around distinct process types — web, worker, scheduler — that can be scaled independently. In Go, each type runs as a goroutine in development but as a separate deployment in production:

```go
// main.go — web server and background worker as separate process types
func main() {
    cfg := mustLoadConfig()
    ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
    defer cancel()

    var wg sync.WaitGroup

    // Web process: handles inbound HTTP requests
    wg.Add(1)
    go func() {
        defer wg.Done()
        srv := &http.Server{Addr: ":" + cfg.Port, Handler: buildRouter(cfg)}
        go func() { <-ctx.Done(); srv.Shutdown(context.Background()) }()
        srv.ListenAndServe()
    }()

    // Worker process: drains the job queue
    wg.Add(1)
    go func() {
        defer wg.Done()
        NewJobWorker(cfg.QueueURL).Run(ctx)
    }()

    wg.Wait()
}
```

In Kubernetes, `web` and `worker` would be separate Deployments: `kubectl scale deploy/web --replicas=10` scales HTTP capacity without touching the worker pool. Running both in one binary is simpler for early-stage services; split them when their resource profiles diverge enough to warrant independent scaling.

---

## IX. Disposability

*Start fast and shut down gracefully.*

Processes should start fast (seconds, not minutes) and shut down gracefully, finishing in-flight requests before exiting.

```go
// Graceful shutdown — finish serving current requests before exiting.
srv := &http.Server{Addr: ":" + port, Handler: mux}

go func() {
    if err := srv.ListenAndServe(); err != http.ErrServerClosed {
        log.Fatal(err)
    }
}()

quit := make(chan os.Signal, 1)
signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
<-quit

ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()
srv.Shutdown(ctx)
```

---

## X. Dev/Prod Parity

*Keep development, staging, and production as similar as possible.*

Gaps between environments cause bugs that only appear in production. Use the same backing services locally (run Postgres in Docker, not SQLite), the same config loading mechanism, and deploy frequently to close the time gap between writing code and running it in production.

SQLite and Postgres are not interchangeable — behavioral differences cause silent production bugs:

```go
// RETURNING is not supported in SQLite before version 3.35 (2021).
// In Postgres it is standard and widely used.
row := tx.QueryRowContext(ctx,
    "INSERT INTO orders (id, total) VALUES ($1, $2) RETURNING created_at",
    id, total,
) // works in Postgres, fails in older SQLite

// LIKE is case-insensitive for ASCII in SQLite but case-sensitive in Postgres.
// WHERE name LIKE '%alice%' finds "Alice" in SQLite but not in Postgres.
rows, _ := db.QueryContext(ctx, "SELECT id FROM users WHERE name LIKE $1", "%alice%")
```

Use the real Postgres image in local development:

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: myapp_dev
      POSTGRES_USER: myapp
      POSTGRES_PASSWORD: secret
    ports:
      - "5432:5432"
  app:
    build: .
    environment:
      DATABASE_URL: postgres://myapp:secret@db:5432/myapp_dev
    depends_on: [db]
```

Run `docker compose up` before running migrations. Tear it down and recreate when you need a clean slate. Using the same Postgres version locally as in production eliminates an entire class of environment-specific bugs that are expensive to diagnose.

---

## XI. Logs

*Treat logs as event streams.*

The app writes unbuffered to stdout. It does not manage log files, log rotation, or log shipping. The execution environment captures stdout and routes it to whatever destination is appropriate (a file, a log aggregator, a monitoring system).

```go
// Write structured logs to stdout.
log.SetOutput(os.Stdout)
log.Printf(`{"level":"info","msg":"order placed","order_id":%q}`, order.ID)
```

Or with a structured logger like `slog` (Go 1.21+):

```go
logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
logger.Info("order placed", "order_id", order.ID)
```

---

## XII. Admin Processes

*Run admin and management tasks as one-off processes.*

Database migrations, data backups, one-time scripts — run these as separate processes using the same codebase and config, not as in-app endpoints or cron jobs baked into the main process.

```sh
# One-off admin process, same binary, different entrypoint.
./server migrate
./server seed-data
./server export-users > users.csv
```

> **Smell:** Credentials in source code or config files committed to the repo. In-process state (maps, slices) used as a cache that breaks when the service is restarted. Behaviour differences between local development and production that "only happen in prod." Log files manually rotated by a script.

See also: [Clean Architecture](/go/patterns/architectural/clean-architecture), [Circuit Breaker](/go/patterns/architectural/circuit-breaker).
