---
title: "The HTTP API"
order: 4
description: "Open the doors: net/http handlers for shortening and redirecting, built on a handler-returns-error design, with validation and consistent JSON errors."
---

## From Engine to Service

Three chapters in, we have a working engine — generate a code, store a link, resolve it, cache the hot ones — and absolutely no way to talk to it. This chapter adds the transport layer: the HTTP API that turns a request into a `Service` call and a `Service` result into a response.

Two endpoints carry the whole product:

- `POST /shorten` — accept a long URL, return a short code.
- `GET /{code}` — look up the code, redirect to the original URL.

We'll build them on Go 1.22's `net/http` router — method-aware patterns and path wildcards, no third-party mux required — and on one structural decision borrowed from the [API Framework course](/go/courses/api-framework): **handlers return errors.** That single choice makes validation, error envelopes, and the middleware of the next chapter fall into place instead of fighting each other.

First the happy path and the error-returning shape that supports it; then the validation and JSON error envelopes that make it safe to expose.
