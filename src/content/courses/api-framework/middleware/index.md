---
title: "Middleware"
order: 3
description: "Build a composable middleware system, then write the handful of middleware every production API actually needs."
---

Middleware is where cross-cutting concerns live: logging, recovery, request IDs, CORS. We build the composition mechanism first — and discover it is two classic design patterns wearing a trench coat — then implement the middleware no production service should ship without.
