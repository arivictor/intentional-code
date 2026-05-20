---
title: Platform Modules
category: architecture
intent: Standardize common infrastructure capabilities through curated modules that encode defaults, security, and operational expectations.
idiomSummary: Build opinionated modules for recurring capabilities such as service networking, databases, or observability instead of letting every team assemble raw resources from scratch.
relatedSlugs: ["published-module-interface", "layered-stacks"]
tags: [architecture, modules, platform, standardization]
isFeatured: false
---

# Platform Modules

At scale, Terraform reuse is not about making every resource generic. It is about packaging recurring capabilities with the defaults and guardrails your platform actually wants teams to use.

## Problem

Every product team provisions the same kinds of infrastructure, service roles, queues, dashboards, alarms, databases, but each team assembles them from raw resources. Security settings drift, tagging differs, and platform upgrades require dozens of one-off refactors.

## Solution

Create curated platform modules that represent supported building blocks, not just thin wrappers around provider resources.

```hcl
module "payments_database" {
  source = "../../../modules/platform-rds-postgres"

  name                 = "payments"
  environment          = "prod"
  instance_class       = "db.r6g.large"
  backup_retention_days = 14
  subnet_ids           = data.terraform_remote_state.data_platform.outputs.database_subnet_ids
}
```

Inside the module, encode the defaults that should not be optional every time:

```hcl
resource "aws_db_instance" "this" {
  identifier                  = "${var.name}-${var.environment}"
  engine                      = "postgres"
  storage_encrypted           = true
  copy_tags_to_snapshot       = true
  deletion_protection         = var.environment == "prod"
  backup_retention_period     = var.backup_retention_days
  performance_insights_enabled = true
}
```

The module expresses the platform's opinionated happy path.

## When to Use

- Many teams provision the same capability repeatedly.
- Security, observability, and tagging defaults should be consistent everywhere.
- Platform teams want to make the supported path the easy path.

## When Not to Use

- The capability is too unstable or too one-off to justify a shared abstraction.
- The module would be a nearly transparent wrapper around one resource with no meaningful defaults or policy encoded.

## Advantages

- Platform expectations become reusable instead of manually reimplemented.
- Teams move faster because they consume supported building blocks.
- Security and operational defaults become harder to forget.
- Platform-wide changes are easier because improvements land in shared modules first.

## Disadvantages

- Opinionated modules require product teams to negotiate exceptions instead of self-serving every change.
- Poor module design can become a platform bottleneck.
- Shared modules need documentation, versioning, and support like real products.

## Related Patterns

- **Published Module Interface** — Platform modules are only useful when their contracts are stable and intentionally small.
- **Layered Stacks** — Curated modules work best inside a layered architecture where foundation and application concerns are already separated.
