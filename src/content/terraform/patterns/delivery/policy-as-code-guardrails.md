---
title: Policy as Code Guardrails
category: delivery
intent: Enforce non-negotiable Terraform rules automatically during planning instead of relying on reviewer memory.
idiomSummary: Evaluate plans against codified policies for tagging, encryption, network exposure, and approved module/provider usage before apply is allowed.
relatedSlugs: ["plan-apply-separation", "published-module-interface"]
tags: [delivery, policy, governance, security]
isFeatured: false
---

# Policy as Code Guardrails

Code review is good at nuance and bad at consistency. If certain Terraform rules are always required, public S3 buckets forbidden, encryption enabled, mandatory tags present, then the system should enforce them automatically instead of asking reviewers to remember every rule on every change.

## Problem

A team has a list of infrastructure standards, but enforcement happens through tribal knowledge and PR comments. Some reviewers check tags carefully. Others focus on architecture. The result is inconsistent governance and recurring mistakes.

## Solution

Evaluate Terraform plans against codified policies before a plan can be approved or applied.

```rego
package terraform.guardrails

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_s3_bucket"
  after := resource.change.after
  not after.tags.owner
  msg := sprintf("%s must include an owner tag", [resource.address])
}

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_security_group_rule"
  resource.change.after.cidr_blocks[_] == "0.0.0.0/0"
  resource.change.after.from_port == 22
  msg := sprintf("%s exposes SSH to the internet", [resource.address])
}
```

Run policy checks immediately after `terraform show -json tfplan.binary`.

## When to Use

- Compliance, security, or cost rules apply across many stacks.
- Reviewers repeatedly catch the same classes of Terraform mistakes.
- Platform teams want reusable guardrails without owning every stack directly.

## When Not to Use

- Rules are still unstable and changing faster than the policy code can keep up.
- The team would use policy tooling as a substitute for architecture review instead of a complement to it.

## Advantages

- Guardrails become consistent across teams and repositories.
- Review noise drops because obvious policy violations fail automatically.
- Standards are documented in executable form instead of wiki pages alone.
- Platform teams can scale governance without manually reviewing every change.

## Disadvantages

- Policy code needs ownership, tests, and versioning like any other software.
- Poorly designed policies can slow teams down with false positives.
- Some nuanced decisions still require human review and cannot be reduced to rules.

## Related Patterns

- **Plan/Apply Separation** — Policy evaluation belongs in the reviewed-plan stage, before apply is possible.
- **Published Module Interface** — Standardized module interfaces make policy easier because shared expectations move into module contracts.
