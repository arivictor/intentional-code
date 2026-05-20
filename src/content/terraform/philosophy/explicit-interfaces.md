---
title: Explicit Interfaces
description: Design Terraform modules as stable contracts with clear inputs, outputs, validation, and ownership.
---

# Explicit Interfaces

Terraform modules are APIs. The variables, outputs, providers, and documented assumptions define what callers can rely on. Once another stack depends on a module, changing that surface becomes a compatibility problem, not just a refactor.

## Why It Matters

Loose interfaces create hidden coupling:

- Callers depend on internal naming conventions
- Modules expose entire resource objects instead of stable outputs
- Inputs accept any value and fail late during apply
- Environment-specific behavior leaks into generic building blocks

An explicit interface keeps a module boring to consume. Callers should know what to pass, what they get back, and which assumptions are safe.

## What Explicit Interfaces Look Like

- Variables describe intent, not implementation details
- Validation blocks reject bad input early
- Outputs expose only what downstream stacks need
- Resource names and tags are derived inside the module
- Optional behavior is controlled by a small number of clear flags

## Practical Rule

If a caller needs to understand the internals of your module to use it safely, the interface is too implicit.
