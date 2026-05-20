---
title: Design Philosophy
intro: Good Terraform design is mostly about choosing stable boundaries and making change boring.
---

Terraform rewards explicitness. The teams that stay fast are rarely the ones with the cleverest HCL. They are the ones that make contracts obvious, keep state boundaries intentional, and resist the urge to turn every variation into a special case.

The philosophy pages in this section focus on the habits that keep Terraform maintainable: designing module interfaces as contracts, and treating state layout as a first-order architectural decision instead of an implementation detail.
