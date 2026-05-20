---
title: State Patterns
lede: Patterns for organizing Terraform state, ownership boundaries, and cross-stack dependencies.
---

Terraform state is where design mistakes become operational pain.

A state file defines what changes together, what locks together, and often who is allowed to touch what. That makes state layout an architectural choice, not just a backend configuration detail. Too coarse and every plan becomes risky. Too fine and the system turns into a web of remote-state lookups that nobody can untangle.

These patterns focus on choosing state boundaries that preserve clarity without sacrificing autonomy.
