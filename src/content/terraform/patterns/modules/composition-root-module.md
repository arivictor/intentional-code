---
title: Composition Root Module
category: modules
intent: Keep reusable child modules small and compose them in a root module that owns environment-specific wiring.
idiomSummary: Put providers, data sources, and cross-module orchestration in the root module; keep child modules focused on one responsibility.
relatedSlugs: ["published-module-interface", "layered-stacks"]
tags: [modules, composition, environments, orchestration]
isFeatured: true
---

# Composition Root Module

Reusable modules should not know every environment rule, naming convention, or optional integration. Those choices belong in the root module, where a specific stack is assembled for a specific environment.

## Problem

A child module starts simple, then absorbs production-only alarms, staging-specific naming, optional DNS records, and region quirks. Eventually it contains a maze of booleans and conditional resources because every environment variation was pushed down into the shared module.

```hcl
module "service" {
  source = "../../modules/service"

  name                  = "payments"
  environment           = var.environment
  enable_private_dns    = var.environment == "prod"
  create_dashboard      = var.environment != "dev"
  create_canary_alarm   = var.environment == "prod"
  use_regional_failover = var.environment == "prod" && var.region == "us-east-1"
}
```

The module is now reusable in name only. It is really an environment matrix hidden behind variables.

## Solution

Treat the root module as the composition layer. It wires focused child modules together and makes environment decisions explicitly.

```hcl
# live/prod/payments/main.tf
module "network" {
  source = "../../../modules/service-network"

  name        = "payments"
  environment = "prod"
  vpc_id      = data.terraform_remote_state.platform.outputs.vpc_id
}

module "service" {
  source = "../../../modules/service"

  name              = "payments"
  environment       = "prod"
  subnet_ids        = module.network.private_subnet_ids
  security_group_id = module.network.security_group_id
  image             = var.image
}

module "monitoring" {
  source = "../../../modules/service-monitoring"

  service_name = module.service.service_name
  environment  = "prod"
}
```

Each child module stays focused. The root module owns the assembly.

## When to Use

- The same building blocks are used differently across environments or products.
- Provider configuration, remote state lookups, and orchestration vary per stack.
- Teams want reusable modules without turning them into generic platforms for everything.

## When Not to Use

- The stack is tiny enough that a reusable child-module layer would add indirection without reuse.
- The module truly represents one self-contained capability with no meaningful composition around it.

## Advantages

- Reusable modules stay smaller and easier to reason about.
- Environment-specific decisions are obvious at the root, where operators actually work.
- Provider setup and cross-module wiring stay out of leaf modules.
- Testing modules becomes easier because each one has a narrower responsibility.

## Disadvantages

- Root modules can become noisy if you compose too many fine-grained child modules.
- Teams need discipline to resist pushing every new variation back into shared modules.
- Some duplication at the root level is normal and should not be abstracted too early.

## Related Patterns

- **Published Module Interface** — Focused child modules only work when their interfaces are intentionally narrow.
- **Layered Stacks** — Root composition gets easier when state is already separated into platform, shared services, and application layers.
