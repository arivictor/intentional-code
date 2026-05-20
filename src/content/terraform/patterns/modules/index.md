---
title: Module Patterns
lede: Patterns for shaping Terraform modules so they stay composable, reusable, and safe to evolve.
---

Terraform module design decides whether your infrastructure grows by composition or by duplication.

Well-designed modules do a few things consistently: they hide resource-level noise, expose a stable contract, and keep environment-specific choices at the call site instead of baking them into reusable code. Bad modules do the opposite. They leak provider details, expose half the resource graph, and force every consumer to understand internal implementation choices.

The patterns in this section focus on building reusable Terraform modules without turning them into miniature frameworks.
