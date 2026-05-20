---
title: State-First Design
description: Choose Terraform state boundaries around ownership, change cadence, and blast radius before writing resources.
---

# State-First Design

Terraform state is not just bookkeeping. It defines the unit of change, the unit of locking, and often the unit of ownership. Teams usually discover this late, after one monolithic state file starts blocking parallel work or a badly chosen split makes every change cross-stack.

## Why It Matters

State layout determines:

- who can apply safely
- what changes together
- how failures are isolated
- where remote outputs become dependencies
- how quickly plans stay understandable

Treating state as an afterthought often creates either a giant "platform" stack that nobody can move safely, or dozens of tiny stacks with tangled remote-state dependencies.

## What Good State Boundaries Optimize For

- **Ownership:** one team can reason about one state file
- **Blast radius:** risky changes stay local
- **Change cadence:** frequently changing resources are isolated from slow-moving foundations
- **Dependency clarity:** downstream stacks depend on a few stable outputs, not whole infrastructures

## Practical Rule

Split state when ownership, lifecycle, or failure domains differ. Keep it together when the resources must change atomically and are operated by the same team.
