---
title: Plan/Apply Separation
category: delivery
intent: Generate reviewed Terraform plans in CI and apply only the exact approved plan artifact in the target environment.
idiomSummary: Run terraform plan in automation, persist the binary plan file, and require approval before terraform apply consumes that same artifact.
relatedSlugs: ["policy-as-code-guardrails", "workspace-per-environment"]
tags: [delivery, ci-cd, review, safety]
isFeatured: true
---

# Plan/Apply Separation

Terraform is safest when the thing you review is the thing you apply. If teams plan in one context and apply in another, or re-run plan during apply, the reviewed change and the actual change can drift apart.

## Problem

A pull request shows a clean Terraform plan. Hours later, the apply job runs `terraform apply` without a saved plan file. A provider version changed, state moved, or another merge altered the graph. The apply is now acting on a different reality than the reviewers approved.

## Solution

Separate planning from applying, and carry the reviewed plan artifact forward.

```yaml
jobs:
  plan:
    steps:
      - run: terraform init -input=false
      - run: terraform validate
      - run: terraform plan -input=false -out=tfplan.binary
      - run: terraform show -no-color tfplan.binary > tfplan.txt
      - uses: actions/upload-artifact@v4
        with:
          name: tfplan
          path: |
            tfplan.binary
            tfplan.txt

  apply:
    needs: plan
    environment: production
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: tfplan
      - run: terraform init -input=false
      - run: terraform apply -input=false tfplan.binary
```

Review happens against `tfplan.txt`; execution happens against `tfplan.binary`.

## When to Use

- Terraform runs through CI/CD instead of direct local applies.
- Changes need peer review, change approval, or auditable promotion.
- Production applies must be deterministic and reproducible.

## When Not to Use

- A solo-owned sandbox stack where the extra workflow would cost more than it returns.
- Rapid prototyping where infrastructure is intentionally disposable.

## Advantages

- Reviewers approve the exact plan that will be executed.
- Approval workflows become auditable because the artifact is preserved.
- Applies are less likely to surprise operators with last-minute graph changes.
- The pattern fits naturally with protected environments and manual approvals.

## Disadvantages

- Plan artifacts must be stored and secured correctly.
- Saved plans can become stale if the state changes before approval.
- CI pipelines become more complex than a direct apply workflow.

## Related Patterns

- **Policy as Code Guardrails** — Policy checks should run during planning, before an approved artifact is produced.
- **Workspace per Environment** — Saved plan discipline matters even more when one codebase targets multiple isolated workspaces.
