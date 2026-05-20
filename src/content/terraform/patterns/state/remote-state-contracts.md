---
title: Remote State Contracts
category: state
intent: Treat cross-stack outputs as explicit, versioned contracts instead of ad hoc reach-through into another stack's internals.
idiomSummary: Expose only stable outputs, consume them through terraform_remote_state or platform-specific data sources, and document ownership at the stack boundary.
relatedSlugs: ["published-module-interface", "layered-stacks"]
tags: [state, contracts, outputs, dependencies]
isFeatured: true
---

# Remote State Contracts

When one Terraform stack depends on another, the boundary should look like an API contract: a few stable outputs, owned by the upstream stack, consumed intentionally by the downstream stack.

## Problem

Teams split a monolithic state file, but the new stacks still behave as if they were one. Downstream code expects dozens of outputs, many of them thin wrappers around internal resource names. Every refactor in the upstream stack becomes a breaking change for every consumer.

```hcl
data "terraform_remote_state" "platform" {
  backend = "s3"

  config = {
    bucket = "intentional-code-tfstate"
    key    = "platform/prod/terraform.tfstate"
    region = "us-east-1"
  }
}

resource "aws_security_group_rule" "allow_app_to_db" {
  type                     = "ingress"
  security_group_id        = data.terraform_remote_state.platform.outputs.database_security_group_id
  source_security_group_id = data.terraform_remote_state.platform.outputs.payments_service_security_group_id
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
}
```

The app stack now knows too much about platform internals.

## Solution

Export only stable, intentionally named outputs that represent supported integration points.

```hcl
# platform/outputs.tf
output "vpc_id" {
  description = "Shared VPC for application stacks."
  value       = aws_vpc.shared.id
}

output "private_subnet_ids" {
  description = "Private application subnets in the shared VPC."
  value       = aws_subnet.private[*].id
}

output "shared_services_security_group_id" {
  description = "Security group for dependencies hosted in the platform stack."
  value       = aws_security_group.shared_services.id
}
```

```hcl
# app/main.tf
data "terraform_remote_state" "platform" {
  backend = "s3"

  config = {
    bucket = "intentional-code-tfstate"
    key    = "platform/prod/terraform.tfstate"
    region = "us-east-1"
  }
}

module "payments_service" {
  source = "../../modules/service"

  name        = "payments"
  environment = "prod"
  subnet_ids  = data.terraform_remote_state.platform.outputs.private_subnet_ids
  vpc_id      = data.terraform_remote_state.platform.outputs.vpc_id
}
```

The downstream stack knows only the supported contract, not the upstream implementation.

## When to Use

- State is split across ownership or lifecycle boundaries.
- Several stacks rely on foundational infrastructure such as networking or shared services.
- Teams need a predictable way to refactor internals without breaking consumers.

## When Not to Use

- The resources really should live in the same state because they must change atomically.
- You are exposing outputs only because the current split is artificial or over-fragmented.

## Advantages

- Cross-stack dependencies become explicit and reviewable.
- Upstream refactors are safer because consumers depend on supported outputs only.
- Ownership boundaries stay clearer when integration points are intentionally named.
- Remote-state usage stays small enough to document and reason about.

## Disadvantages

- Output design requires discipline and versioning conversations.
- Consumers can still become tightly coupled if you expose too many details.
- Eventually some integrations are better served by provider data sources or service discovery than by Terraform outputs.

## Related Patterns

- **Published Module Interface** — The same contract-first idea applies inside a reusable module.
- **Layered Stacks** — Stable remote-state contracts make layered state boundaries workable in practice.
