---
title: Philosophy
description: The Tenets of Intentional Code — How to make better software decisions
icon: scroll
order: 2
---

Architecture is more philosophy than pattern. It is a way of thinking about code, not a checklist to apply — and the principles here are lenses, not a rulebook.

These are **the Tenets**: ten positions on how to decide, not what to type. They're ordered so the first frames the rest and the last keeps the whole set honest. Each one carries the field's well-known laws inside it — DRY, SOLID, YAGNI, KISS, Gall's Law, and the others — not as separate commandments but as worked examples of the judgment the tenet describes. The tenet is the principle; the named law is what it looks like in practice.

Read them in order the first time. After that, jump to whichever one matches the pressure you're under.

1. [Architecture is a philosophy, not a rule](/philosophy/architecture-is-a-philosophy) — the shape is always there; the only question is whether you chose it. *(Clean Code)*
2. [If you can't name the trade-off, you didn't decide — you defaulted](/philosophy/name-the-trade-off) — every choice gives something up; say what.
3. [The best pattern is often no pattern](/philosophy/no-pattern) — most over-engineering solves a problem you don't have yet. *(YAGNI, KISS)*
4. [Build the simplest thing that could possibly work](/philosophy/build-the-simplest-thing) — make it work before you make it elegant; the crude version is how you learn the problem.
5. [Every abstraction is borrowed against the future](/philosophy/borrowed-abstraction) — only borrow flexibility you'll actually spend. *(Composition over Inheritance)*
6. [Design for the change you can see, not the change you imagine](/philosophy/change-you-can-see) — build for the backlog, not the daydream. *(Gall's Law)*
7. [Hard to test is the design talking — listen to it](/philosophy/listen-to-the-tests) — pain in a test is a design smell, not a testing problem. *(TDD, Functional Programming)*
8. [Duplication is cheaper than the wrong abstraction](/philosophy/wrong-abstraction) — un-welding two things that only looked alike costs more than repeating yourself. *(DRY)*
9. [Make the next change local. That's the whole job](/philosophy/keep-changes-local) — locality is the payoff; coupling is the tax. *(Separation of Concerns, Law of Demeter, SOLID)*
10. [You may disagree — but you need a reason](/philosophy/disagree-with-reason) — a reasoned exception is intentional; an unreasoned one is just the default in disguise.
