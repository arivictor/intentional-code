---
title: Intentional Code with Go
tagline: The patterns and principles that make Go code easier to read, test, and change.
catalogHeading: Pattern catalog
---

Every architectural decision is a bet. Choosing layers means betting the cost of the separation is less than the cost of tangling HTTP, business rules, and SQL in the same place. Choosing microservices means betting that deployment independence is worth the distributed-systems overhead. Choosing events means betting that decoupling producers from consumers is worth the eventual-consistency complexity.

The difference between architecture and preference is a *because*. "I chose layered architecture because I need to test business rules without a database" is a decision. "I use layered architecture because it's clean" is a preference.

The patterns and principles here are tools for making intentional decisions. Each pattern names the problem it solves. Each principle names the reasoning that makes the solution work. Use them so you can always answer *why* before you commit to *how*.
