---
title: Layered Stacks
category: architecture
intent: Split Terraform into foundation, shared-service, and application stacks so ownership and blast radius stay explicit.
idiomSummary: Separate low-change platform layers from fast-moving application stacks, and connect them with a small set of stable outputs.
relatedSlugs: ["remote-state-contracts", "platform-modules"]
tags: [architecture, stacks, ownership, platform]
isFeatured: true
---

# Layered Stacks

As Terraform estates grow, one stack stops being a useful unit of ownership. Networking, identity, shared data services, and product workloads change at different speeds and are usually owned by different teams. Layered stacks give each layer room to evolve at its own pace.

## Problem

One repository owns VPCs, IAM, databases, queues, and every application service in one state file. Plans are huge, locks block unrelated work, and risky platform changes are mixed with routine application deploys. No team can move independently.

## Solution

Split the estate into architectural layers with clear responsibilities.

```text
foundation/
  networking/
  identity/
shared-services/
  observability/
  data-platform/
applications/
  payments/
  checkout/
```

Each layer owns its own state. Application stacks consume only the stable outputs they need from lower layers.

```hcl
data "terraform_remote_state" "networking" {
  backend = "s3"

  config = {
    bucket = "intentional-code-tfstate"
    key    = "foundation/networking/prod/terraform.tfstate"
    region = "us-east-1"
  }
}

module "payments_service" {
  source = "../../../modules/service"

  name        = "payments"
  environment = "prod"
  vpc_id      = data.terraform_remote_state.networking.outputs.vpc_id
  subnet_ids  = data.terraform_remote_state.networking.outputs.private_subnet_ids
}
```

## When to Use

- Different teams own foundation and application concerns.
- Platform resources change much less often than product stacks.
- Large plans and lock contention are slowing delivery.

## When Not to Use

- A very small platform where splitting state would add ceremony without autonomy.
- Resources that must always change atomically and are operated by one team.

## Advantages

- Ownership boundaries become clear and review scope shrinks.
- Platform changes stop blocking routine application work.
- Failures and drift stay more localized.
- Application teams consume shared capabilities without owning the whole foundation.

## Disadvantages

- Cross-stack contracts must be designed and maintained carefully.
- Architectural layering adds coordination cost when a change spans several layers.
- Over-splitting can create dependency sprawl if every tiny concern gets its own state file.

## Related Patterns

- **Remote State Contracts** — Layered stacks only stay healthy when lower layers publish stable outputs.
- **Platform Modules** — Shared platform capabilities are easier to roll out consistently when each layer uses curated modules instead of bespoke resource definitions.
