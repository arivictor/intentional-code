---
title: Workspace per Environment
category: state
intent: Use separate Terraform workspaces for the same stack shape across environments when configuration differences are small and controlled.
idiomSummary: Keep one root module, parameterize the environment, and isolate state with remote backends plus a strict workspace naming convention.
relatedSlugs: ["remote-state-contracts", "plan-apply-separation"]
tags: [state, workspaces, environments, promotion]
isFeatured: false
---

# Workspace per Environment

Terraform workspaces are useful when the infrastructure shape is the same across environments and only a limited set of values changes. They are dangerous when teams use them to hide major architectural differences behind one root module.

## Problem

A team wants separate state for `dev`, `stage`, and `prod`, but they do not want three nearly identical copies of the same stack. Copying directories works at first, then drift appears because each environment evolves separately. Workspaces look attractive, but without discipline they become a place to hide unrelated differences.

## Solution

Use a single root module for one stack shape, then isolate state per environment with controlled workspace-specific inputs.

```hcl
terraform {
  backend "s3" {
    bucket               = "intentional-code-tfstate"
    key                  = "network/terraform.tfstate"
    workspace_key_prefix = "env"
    region               = "us-east-1"
    dynamodb_table       = "intentional-code-tf-locks"
  }
}

locals {
  environment = terraform.workspace

  environment_config = {
    dev = {
      cidr_block = "10.10.0.0/16"
    }
    stage = {
      cidr_block = "10.20.0.0/16"
    }
    prod = {
      cidr_block = "10.30.0.0/16"
    }
  }
}

module "network" {
  source = "../../modules/network"

  name        = "core"
  environment = local.environment
  cidr_block  = local.environment_config[local.environment].cidr_block
}
```

The important constraint is social as much as technical: only use this when the environments are intentionally the same shape.

## When to Use

- The same stack exists in several environments with minor value changes.
- One team owns every environment and wants a single code path.
- Promotion logic lives outside Terraform, but state isolation is still required.

## When Not to Use

- Production has materially different topology, compliance, or networking requirements.
- Different teams own different environments or accounts.
- Workspace selection is likely to be error-prone in your delivery process.

## Advantages

- One root module reduces copy-paste between environments.
- State remains isolated, so locks and applies stay environment-specific.
- Shared changes are easier because the infrastructure shape lives in one place.

## Disadvantages

- Workspace misuse can hide unsafe differences behind one codebase.
- Operators must be careful to select the intended workspace every time.
- Backend and variable design become more constrained because everything shares one root module.

## Related Patterns

- **Remote State Contracts** — Downstream stacks still need stable outputs regardless of whether upstream isolation uses workspaces.
- **Plan Apply Separation** — Workspace-based stacks need especially careful CI discipline so plans and applies run against the same workspace.
