---
title: Published Module Interface
category: modules
intent: Design each reusable module around a small, versionable contract of validated inputs and purpose-built outputs.
idiomSummary: Use focused variables, validation blocks, sensible defaults, and stable outputs instead of exposing raw resource internals.
relatedSlugs: ["composition-root-module", "remote-state-contracts"]
tags: [modules, interfaces, reuse, validation]
isFeatured: true
---

# Published Module Interface

Reusable Terraform modules should behave like published APIs. Callers should depend on a stable set of inputs and outputs, not on resource names, implicit defaults, or provider-specific details leaking out of the module.

## Problem

A shared module creates the right AWS resources, but its interface is sloppy. It accepts free-form strings, exposes entire resources through outputs, and makes consumers pass details the module could derive itself. Every caller ends up reading the module internals before using it safely.

```hcl
module "app" {
  source = "../../modules/app"

  name_prefix           = "payments-prod"
  security_group_name   = "payments-sg"
  ecs_service_name      = "payments-service"
  alb_target_group_name = "payments-tg"
  cpu                    = 512
  memory                 = 1024
}
```

That interface is hard to evolve because callers now depend on naming details instead of intent.

## Solution

Publish a narrow contract. Let callers describe intent, then let the module derive implementation details internally.

```hcl
# modules/service/variables.tf
variable "name" {
  type        = string
  description = "Logical service name used for tagging and resource naming."

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.name))
    error_message = "name must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment name."
}

variable "image" {
  type        = string
  description = "Container image reference to deploy."
}

locals {
  full_name = "${var.name}-${var.environment}"
  common_tags = {
    service     = var.name
    environment = var.environment
    managed_by  = "terraform"
  }
}
```

```hcl
# modules/service/outputs.tf
output "service_name" {
  description = "Stable identifier for downstream integrations."
  value       = aws_ecs_service.this.name
}

output "security_group_id" {
  description = "Security group attached to the service."
  value       = aws_security_group.service.id
}
```

Callers now pass business-relevant values:

```hcl
module "payments_service" {
  source = "../../modules/service"

  name        = "payments"
  environment = "prod"
  image       = "123456789012.dkr.ecr.us-east-1.amazonaws.com/payments:2026-05-20"
}
```

## When to Use

- A module is shared across multiple stacks or teams.
- You expect to version the module and upgrade consumers over time.
- Consumers should depend on outcomes, not on the internal resource graph.

## When Not to Use

- A one-off root module owned by one team with no reuse horizon.
- A temporary migration stack you intend to delete after one or two applies.

## Advantages

- Module upgrades are safer because callers depend on a stable contract.
- Validation blocks fail fast during plan instead of after resource creation starts.
- Outputs stay purpose-built, so downstream stacks avoid coupling to internals.
- The module can change naming, tagging, or implementation strategy without breaking consumers.

## Disadvantages

- Designing a good interface up front takes more thought than exposing every knob.
- Some callers will ask for escape hatches that you intentionally refuse to provide.
- Versioning discipline becomes necessary once the module is widely used.

## Related Patterns

- **Composition Root Module** — Keeps environment-specific wiring in the root stack while shared modules stay focused.
- **Remote State Contracts** — Applies the same stable-interface idea at the stack boundary, not just the module boundary.
