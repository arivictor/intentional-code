---
title: "Shorten and Redirect"
order: 1
description: "Two handlers on Go 1.22's net/http router, built on a handler-returns-error design that keeps the happy path clean and centralises failure."
---

## Handlers That Return Errors

Before the two endpoints, one decision shapes both. The standard library's handler signature has no error return:

```go
func(w http.ResponseWriter, r *http.Request) // no error in sight
```

So every handler is on its own for failures — each one writes its own status code and body, and the moment you have more than two handlers they drift: one returns plain text, another JSON, a third forgets to `return` after writing and runs on. We borrow the fix from the [API Framework course](/go/courses/api-framework): give *our* handlers an error return, then adapt them to the standard signature with a wrapper that turns a returned error into a response, in exactly one place.

```go
package shortener

import (
	"encoding/json"
	"errors"
	"net/http"
)

// handler is an HTTP handler that can fail by returning an error. The
// ServeHTTP adapter turns it into a normal http.Handler, funnelling every
// failure through writeError so no handler hand-rolls its own error body.
type handler func(http.ResponseWriter, *http.Request) error

func (h handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if err := h(w, r); err != nil {
		writeError(w, err)
	}
}
```

That tiny `ServeHTTP` is the hinge. Because `handler` has a method named `ServeHTTP`, it *is* an `http.Handler` and drops straight into any router. And because it inspects the returned error centrally, every handler we write gets to do the most natural thing in Go — `return err` — instead of remembering to write a response and bail.

## Errors That Know Their Status

For the wrapper to produce the right status code, an error needs to carry one. A small typed error does that:

```go
// apiError is an error that carries an HTTP status and a stable, machine-
// readable code. Handlers return these for expected failures.
type apiError struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`    // e.g. "invalid_url" — stable for clients
	Message string `json:"message"` // human-readable explanation
}

func (e *apiError) Error() string { return e.Message }

func badRequest(code, msg string) *apiError {
	return &apiError{Status: http.StatusBadRequest, Code: code, Message: msg}
}
func notFound(msg string) *apiError {
	return &apiError{Status: http.StatusNotFound, Code: "not_found", Message: msg}
}
```

For now `writeError` stays deliberately minimal — we'll give it a proper JSON envelope and unexpected-error handling in the next step:

```go
// writeError is the single place failures become responses. The next step
// replaces this with a consistent JSON envelope; for now it's enough to
// route the status code correctly.
func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	var apiErr *apiError
	if errors.As(err, &apiErr) {
		status = apiErr.Status
	}
	http.Error(w, err.Error(), status)
}
```

## The Router

Go 1.22 taught `net/http`'s own `ServeMux` two tricks that used to require a third-party router: **method matching** and **path wildcards**. We need nothing else.

```go
// Server holds what the HTTP layer depends on: the Service and the public
// base URL used to build absolute short links in responses.
type Server struct {
	svc     *Service
	baseURL string
}

func NewServer(svc *Service, baseURL string) *Server {
	return &Server{svc: svc, baseURL: baseURL}
}

// Routes wires patterns to handlers and returns the API as one http.Handler.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("POST /shorten", handler(s.handleShorten))
	mux.Handle("GET /{code}", handler(s.handleRedirect))
	mux.Handle("GET /healthz", handler(s.handleHealth))
	return mux
}
```

`"POST /shorten"` matches only POST; a GET to the same path gets an automatic 405. `"GET /{code}"` captures the path segment into a named wildcard we read with `r.PathValue("code")`. The `handler(...)` conversion wraps each error-returning function in the adapter from above. This is a complete, production-grade router using nothing but the standard library.

## Shortening

The create handler reads JSON, calls the `Service`, and writes JSON back. Every failure is a `return`:

```go
type shortenRequest struct {
	URL string `json:"url"`
}

type shortenResponse struct {
	Code     string `json:"code"`
	ShortURL string `json:"short_url"`
	URL      string `json:"url"`
}

func (s *Server) handleShorten(w http.ResponseWriter, r *http.Request) error {
	// Cap the body so a giant payload can't exhaust memory.
	var req shortenRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)) // 8 KB
	if err := dec.Decode(&req); err != nil {
		return badRequest("invalid_json", `body must be JSON: {"url": "https://..."}`)
	}

	link, err := s.svc.Shorten(req.URL)
	if err != nil {
		return err // validation/storage errors handled centrally
	}

	return writeJSON(w, http.StatusCreated, shortenResponse{
		Code:     link.Code,
		ShortURL: s.baseURL + "/" + link.Code,
		URL:      link.URL,
	})
}
```

`http.MaxBytesReader` is the kind of guard that's invisible until someone POSTs a 2 GB body to knock your service over. Capping at 8 KB costs nothing and closes that door. The handler reads as a clean narrative — decode, shorten, respond — because every error path is a single `return`, not an `if err != nil { write; return }` ritual repeated three times.

`writeJSON` is the success counterpart to `writeError`:

```go
func writeJSON(w http.ResponseWriter, status int, v any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(v)
}
```

## Redirecting

The redirect handler is the one users actually hit, millions of times. It reads the wildcard, resolves the link, and sends a redirect:

```go
func (s *Server) handleRedirect(w http.ResponseWriter, r *http.Request) error {
	code := r.PathValue("code")

	link, err := s.svc.Resolve(code)
	if errors.Is(err, ErrNotFound) {
		return notFound("no link exists for code " + code)
	}
	if err != nil {
		return err
	}

	// 302, not 301, on purpose — see below.
	http.Redirect(w, r, link.URL, http.StatusFound)
	return nil
}
```

The status code is a real decision, not a default. **301 Moved Permanently** is cacheable: the browser remembers it and, on the next click, jumps straight to the destination *without ever contacting us again*. Great for latency — fatal for click counting, because we never see the repeat clicks. **302 Found** keeps every click flowing through our service, which is exactly what we need for the analytics we add in the next chapter. We're trading a little redirect latency for the ability to count — a deliberate choice, and the kind worth a comment so the next reader doesn't "fix" it to 301.

The `errors.Is(err, ErrNotFound)` check translates a storage-layer sentinel into an HTTP 404. That translation is the transport layer's proper job: the `Service` speaks in domain errors, and the handler maps them to status codes. Neither leaks into the other.

A trivial health check rounds out the routes:

```go
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) error {
	return writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
```

## Seeing It Work

Wire a `Server` to an in-memory stack and serve it:

```go
func main() {
	store := shortener.NewMemoryStore()
	gen := shortener.NewRandomGenerator(shortener.WithLength(7))
	svc := shortener.NewService(store, gen)
	srv := shortener.NewServer(svc, "http://localhost:8080")

	http.ListenAndServe(":8080", srv.Routes())
}
```

```
$ curl -s -X POST localhost:8080/shorten -d '{"url":"https://go.dev/blog"}'
{"code":"k3Qm9Z","short_url":"http://localhost:8080/k3Qm9Z","url":"https://go.dev/blog"}

$ curl -sI localhost:8080/k3Qm9Z | grep -i location
Location: https://go.dev/blog

$ curl -si localhost:8080/nope | head -1
HTTP/1.1 404 Not Found
```

A working URL shortener, end to end, on the standard library. But it will cheerfully shorten `"not a url"`, `"javascript:alert(1)"`, or an empty string — because nothing validates the input yet.

## What's Next

The happy path works; the unhappy paths are wide open. Next we close them: validate that a URL is actually a fetchable `http`/`https` address before we store it, and replace the stubbed `writeError` with one consistent JSON envelope every client can rely on — turning our error-returning handlers into a properly defensible API.
