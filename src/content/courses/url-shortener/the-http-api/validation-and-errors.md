---
title: "Validation and Error Envelopes"
order: 2
description: "Reject bad URLs at the right layer, and return one consistent JSON error shape — without leaking internals on unexpected failures."
---

## Where Validation Belongs

The API will currently shorten `""`, `"not a url"`, or `"javascript:alert(1)"`. We need to reject those — but *where*? The handler is one tempting spot; the `Service` is the other. The deciding question: who must this rule protect?

A URL has to be valid no matter how the request arrives — today it's HTTP, tomorrow it might be a CLI or a queue consumer calling `Shorten` directly. A rule that protects the domain belongs *in* the domain, so it can't be bypassed by a second caller. We put validation in the `Service`, expressed as a domain error, and let the HTTP layer translate that error into a status code. (The handler still does cheap transport-level checks — like rejecting a malformed JSON body — because those are genuinely about HTTP, not about what a valid link is.)

```go
import (
	"fmt"
	"net/url"
)

// ErrInvalidURL is returned by Shorten for any URL we refuse to store.
// Its message is safe to show clients, so it carries the specific reason.
var ErrInvalidURL = errors.New("invalid url")

// validateURL enforces a syntactically valid, absolute http(s) URL of
// reasonable length. net/url does the parsing; we add the policy.
func validateURL(raw string) error {
	if raw == "" {
		return fmt.Errorf("%w: url is required", ErrInvalidURL)
	}
	if len(raw) > 2048 {
		return fmt.Errorf("%w: url exceeds 2048 characters", ErrInvalidURL)
	}
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("%w: %s", ErrInvalidURL, err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("%w: scheme must be http or https", ErrInvalidURL)
	}
	if u.Host == "" {
		return fmt.Errorf("%w: missing host", ErrInvalidURL)
	}
	return nil
}
```

Each `fmt.Errorf("%w: …", ErrInvalidURL, …)` wraps the sentinel so `errors.Is(err, ErrInvalidURL)` stays true while the message gains a specific reason. That's the modern Go idiom: one sentinel for *classification*, wrapped context for *explanation*.

Now `Shorten` validates before it does anything else:

```go
func (s *Service) Shorten(rawURL string) (Link, error) {
	if err := validateURL(rawURL); err != nil {
		return Link{}, err
	}
	// ...unchanged: Next, Generate, Save with collision retry...
}
```

The `2048` cap and the `http`/`https` allowlist are policy, and worth stating as such. The length bound stops someone storing megabyte "URLs" to bloat the log. The scheme allowlist blocks `javascript:`, `data:`, and `file:` URIs — schemes that turn a shortener into an XSS or local-file vector the instant a victim clicks. Allowlisting two safe schemes is far sturdier than blocklisting the dangerous ones you can remember.

## One Error Shape for the Whole API

Clients can only handle errors gracefully if every error looks the same. We promote the stubbed `writeError` from the last step into the single source of error responses, emitting one envelope for *every* failure:

```go
import "log"

// errorEnvelope is the one and only error shape clients ever see:
//   {"error": {"code": "...", "message": "..."}}
type errorEnvelope struct {
	Error *apiError `json:"error"`
}

func writeError(w http.ResponseWriter, err error) {
	var apiErr *apiError
	if !errors.As(err, &apiErr) {
		// An error we didn't anticipate. Log the real thing for ourselves,
		// return a generic 500 to the client — never leak internals.
		log.Printf("unhandled error: %v", err)
		apiErr = &apiError{
			Status:  http.StatusInternalServerError,
			Code:    "internal",
			Message: "something went wrong",
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(apiErr.Status)
	_ = json.NewEncoder(w).Encode(errorEnvelope{Error: apiErr})
}
```

The `errors.As` branch is the most important security line in the service. Expected failures (`*apiError`) carry a client-safe message we wrote on purpose. *Unexpected* ones — a disk error, a nil dereference surfaced as a panic-turned-error — get logged for us and replaced with a bland 500. A leaked raw error is how internal file paths, query fragments, and library versions end up in someone's browser console, handing an attacker a map of your system. Recall that `apiError.Status` is tagged `json:"-"`, so the status drives the HTTP code without appearing in the body — the response carries only `code` and `message`.

## Translating Domain Errors at the Boundary

The handler maps the `Service`'s domain errors to HTTP, exactly as it already does for `ErrNotFound`:

```go
func (s *Server) handleShorten(w http.ResponseWriter, r *http.Request) error {
	var req shortenRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10))
	if err := dec.Decode(&req); err != nil {
		return badRequest("invalid_json", `body must be JSON: {"url": "https://..."}`)
	}

	link, err := s.svc.Shorten(req.URL)
	switch {
	case errors.Is(err, ErrInvalidURL):
		return badRequest("invalid_url", err.Error()) // safe message, 400
	case err != nil:
		return err // unexpected: writeError logs it and returns a 500
	}

	return writeJSON(w, http.StatusCreated, shortenResponse{
		Code:     link.Code,
		ShortURL: s.baseURL + "/" + link.Code,
		URL:      link.URL,
	})
}
```

The domain layer classifies (`ErrInvalidURL`); the transport layer assigns the status (`400`). Each layer does the part it's qualified for, and the [separation](/go/philosophy/separation-of-concerns) means you could swap HTTP for gRPC tomorrow and the validation rules wouldn't move.

## Proving the Rules

Validation is pure logic over inputs — table-driven testing fits like a glove:

```go
func TestValidateURL(t *testing.T) {
	cases := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{"plain https", "https://go.dev/blog", false},
		{"plain http", "http://example.com", false},
		{"empty", "", true},
		{"no scheme", "example.com", true},
		{"javascript", "javascript:alert(1)", true},
		{"ftp", "ftp://files.example.com", true},
		{"no host", "https://", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := validateURL(c.url)
			if (err != nil) != c.wantErr {
				t.Errorf("validateURL(%q) err = %v, wantErr %v", c.url, err, c.wantErr)
			}
		})
	}
}
```

```
$ curl -s -X POST localhost:8080/shorten -d '{"url":"javascript:alert(1)"}'
{"error":{"code":"invalid_url","message":"invalid url: scheme must be http or https"}}

$ curl -s -X POST localhost:8080/shorten -d 'not json'
{"error":{"code":"invalid_json","message":"body must be JSON: {\"url\": \"https://...\"}"}}
```

Same envelope, every time, whatever goes wrong.

## The Honest Limit: Open Redirects

One risk is inherent to *every* URL shortener and worth naming plainly: an **open redirect**. By design we'll redirect to any valid `http(s)` URL, so an attacker can wrap a phishing site behind your trusted short domain — `sho.rt/x9Qk` looks safe and lands on a credential-stealing page. We don't fetch URLs server-side, so classic SSRF isn't our exposure, but the phishing vector is real and unavoidable for the core feature.

Mitigations exist — domain allowlists, a safe-browsing lookup before storing, an interstitial "you're leaving" page for unknown destinations — and they're deliberately out of scope here. The right move for now is to *know* the risk exists rather than discover it in an incident report. ([YAGNI](/go/philosophy/yagni) cuts both ways: don't build a phishing-detection pipeline on day one, but do write down that you skipped it.)

## What's Next

The API is now defensible: validated input, one error shape, no leaked internals. It's still defenceless against *volume* — one client can hammer `POST /shorten` in a loop and fill the disk. The next chapter hardens it, starting with a rate limiter we'll recognise as [Strategy](/go/patterns/behavioral/strategy) and [Decorator](/go/patterns/structural/decorator) working together as middleware.
