---
title: "Binding and Validating Input"
order: 1
description: "Turn untrusted request bytes into validated Go structs safely, with a validation contract that keeps handlers short."
---

## The Most Dangerous Line in Your API

`json.NewDecoder(r.Body).Decode(&req)` is where untrusted input becomes a Go value. Get it wrong and you have silent data loss, unbounded memory reads, or a handler that trusts fields the client never sent. The framework should make the *safe* version the default so two hundred handlers don't each get it subtly wrong.

We already sketched `Bind` on the `Context` back in [Chapter 1](/go/courses/api-framework/foundations/design-the-core). Let's harden it and pair it with validation.

## Decoding Safely

Three defaults matter, and the standard library gets two of them wrong unless you ask:

```go
package framework

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

// Bind decodes the JSON body into dst with production-safe defaults:
// it rejects unknown fields, caps the body size, and rejects trailing
// garbage after the first JSON value.
func (c *Context) Bind(dst any) error {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20) // 1 MiB cap

	dec := json.NewDecoder(c.Request.Body)
	dec.DisallowUnknownFields()

	if err := dec.Decode(dst); err != nil {
		return BadRequest("invalid request body: " + err.Error())
	}

	// Reject a second JSON value, e.g. `{...}{...}`.
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return BadRequest("request body must contain a single JSON object")
	}
	return nil
}
```

- **`MaxBytesReader`** caps the body. Without it, a client can stream gigabytes into your decoder and exhaust memory. This is the single most important line.
- **`DisallowUnknownFields`** turns a client typo (`{"emial": ...}`) into a `400` instead of a silently dropped field — a debugging nightmare avoided.
- **The trailing-value check** rejects `{...}{...}`, which the default decoder accepts (it reads only the first value).

`BadRequest` is the structured error we build in the next step. Already `Bind` returns errors instead of writing responses — consistent with the whole framework's [error-returning design](/go/courses/api-framework/foundations/why-build-your-own).

## Validation as a Contract

Decoding proves the JSON is well-formed. It says nothing about whether the *values* make sense — an empty email, a negative age, a missing required field. Rather than scatter `if req.Email == ""` checks through handlers, we define a one-method interface and let request types validate themselves.

```go
package framework

// Validator is implemented by request types that can check their own
// invariants. Keeping validation on the type means the rules live next
// to the fields they constrain.
type Validator interface {
	Validate() error
}

// BindValid decodes the body and, if the target implements Validator,
// runs its Validate method. Handlers get one call that guarantees a
// fully-checked struct or a 400.
func (c *Context) BindValid(dst any) error {
	if err := c.Bind(dst); err != nil {
		return err
	}
	if v, ok := dst.(Validator); ok {
		if err := v.Validate(); err != nil {
			return BadRequest(err.Error())
		}
	}
	return nil
}
```

The `dst.(Validator)` type assertion is the hinge: validation is *opt-in*. A type with a `Validate()` method gets checked; one without is simply decoded. No reflection, no struct tags to parse, no third-party dependency — just an interface, which is the [Go-idiomatic](/go/philosophy/composition-over-inheritance) way to make behavior pluggable.

## A Handler, Start to Finish

Here's what all of this buys at the call site. The request type owns its rules; the handler is four lines.

```go
package main

import (
	"errors"
	"strings"

	"yourmodule/framework"
)

type CreateUserRequest struct {
	Email string `json:"email"`
	Name  string `json:"name"`
	Age   int    `json:"age"`
}

// Validate makes CreateUserRequest satisfy framework.Validator.
func (r CreateUserRequest) Validate() error {
	switch {
	case r.Email == "":
		return errors.New("email is required")
	case !strings.Contains(r.Email, "@"):
		return errors.New("email is not valid")
	case r.Age < 0 || r.Age > 150:
		return errors.New("age must be between 0 and 150")
	}
	return nil
}

func createUser(c *framework.Context) error {
	var req CreateUserRequest
	if err := c.BindValid(&req); err != nil {
		return err // 400 with the validation message — handled centrally
	}
	// req is now decoded AND validated. Business logic only.
	return c.JSON(201, map[string]string{"email": req.Email, "status": "created"})
}
```

The handler contains zero plumbing. No decoding boilerplate, no validation branches, no manual error responses. That brevity is the entire reason to build the framework — compare it to the tangled handler the [Decorator pattern page](/go/patterns/structural/decorator) opens with.

## A Note on Pluggable Encoders (and YAGNI)

You may wonder: what if a client wants XML, or msgpack, instead of JSON? The textbook answer is the [Strategy pattern](/go/patterns/behavioral/strategy) — inject an `Encoder` interface and pick the implementation by `Accept` header. It's a clean design *if you need it*.

Most services don't. They speak JSON and only JSON, and a configurable encoder is a layer of indirection that earns nothing. We ship JSON, hardcoded, on purpose — [YAGNI](/go/philosophy/yagni). The seam to add Strategy later is obvious (replace the body of `JSON` with `c.encoder.Encode`), so deferring the decision costs nothing. Build the abstraction the day a second format actually appears, not before.

## What's Next

`Bind`, `BindValid`, and our handlers all return errors like `BadRequest(...)` and `Unauthorised(...)` that don't exist yet. The next step builds the `HTTPError` type behind them and the one piece of middleware that turns any returned error into a consistent JSON response — finally replacing that placeholder 500 from Chapter 1.
