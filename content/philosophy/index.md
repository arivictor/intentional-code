---
title: Philosophy
description: The Tenets of Intentional Code — How to make better software decisions
icon: scroll
order: 2
---

Architecture is more philosophy than pattern.

When I was learning to write software, I could read the code but not the decision behind it. I could see the pattern, but not the call. Even with the well-known principles, SOLID and the rest, I kept asking "why is that right here?" and "when would it be wrong?" Nobody was writing down the judgment, only the rules.

The Tenets are my answer: ten positions on how to make architectural decisions with intention. They reference the named laws, DRY, YAGNI, KISS, Gall's Law, as worked examples. The tenet is the principle; the law is what it looks like in practice.

1. [Architecture is a philosophy, not a rule](/philosophy/architecture-is-a-philosophy) — the shape is always there; the only question is whether you chose it. *(Clean Code)*
2. [If you can't name the trade-off, you didn't decide — you defaulted](/philosophy/name-the-trade-off) — every choice gives something up; you must be able to say what.
3. [The best pattern is often no pattern](/philosophy/no-pattern) — most over-engineering solves a problem you don't have yet. A pattern without intention is solving the solution, not the problem. *(YAGNI, KISS)*
4. [Build the simplest thing that could possibly work](/philosophy/build-the-simplest-thing) — make it work before you make it elegant; the crude version is how you learn the problem.
5. [Every abstraction is borrowed against the future](/philosophy/borrowed-abstraction) — only borrow flexibility you'll actually spend. *(Composition over Inheritance)*
6. [Design for the change you can see, not the change you imagine](/philosophy/change-you-can-see) — build for the backlog, not the daydream. *(Gall's Law)*
7. [Hard to test is the design talking — listen to it](/philosophy/listen-to-the-tests) — pain in a test is a design smell, not a testing problem. *(TDD, Functional Programming)*
8. [Duplication is cheaper than the wrong abstraction](/philosophy/wrong-abstraction) — un-welding two things that only looked alike costs more than repeating yourself. *(DRY)*
9. [Make the next change local. That's the whole job](/philosophy/keep-changes-local) — locality is the payoff; coupling is the tax. *(Separation of Concerns, Law of Demeter, SOLID)*
10. [You may disagree — but you need a reason](/philosophy/disagree-with-reason) — a reasoned exception is intentional; an unreasoned one is just preference in disguise.
