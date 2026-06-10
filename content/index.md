---
title: Go Design Patterns, with the Decision Attached
nav_title: Home
description: Go design, concurrency, and architecture patterns — each with the trade-off it makes, the situation that earns it, and where it's over-engineering.
icon: house
order: 0
---

![Intentional Code](/og-image.svg)

Most pattern catalogues show you the code. This one shows you the call. Every pattern here—21 architectural, 11 behavioural, 8 concurrency, 5 creational, 7 structural, 8 synchronisation—comes with the trade-off it makes, the situation that earns it, and the situation where it's over-engineering. Written by [Ari Victor](https://github.com/arivictor), a security engineer building production Go in financial services, because the resources I wanted didn't exist: opinionated enough to disagree with, specific enough to be wrong about.

The goal is never a finished project. It's the ability to make a good structural call on a problem you've never seen—including the call to use no pattern at all.

## Not a tutorial

A tutorial answers "how do I build X?" and hands you the one true path. You cannot disagree with it.

Intentional Code answers "why would you structure X this way, and when wouldn't you?" Every pattern here comes with the trade-off it makes, the situation that earns it, and the situation where it is just over-engineering. It takes positions you could argue with. That is the point.

Good architecture is not knowing the patterns. It is knowing which one the problem in front of you actually needs, and having the judgment to reach for none of them when that is the right call.

## The Tenets

None of these tell you what to type. All of them shape how you decide, and the last one means it.

1. **[Architecture is a philosophy, not a rule.](/go/philosophy/architecture-is-a-philosophy)**
2. **[If you can't name the trade-off, you didn't decide — you defaulted.](/go/philosophy/name-the-trade-off)**
3. **[The best pattern is often no pattern.](/go/philosophy/no-pattern)**
4. **[Build the simplest thing that could possibly work.](/go/philosophy/build-the-simplest-thing)**
5. **[Every abstraction is borrowed against the future. Only borrow what you'll spend.](/go/philosophy/borrowed-abstraction)**
6. **[Design for the change you can see, not the change you imagine.](/go/philosophy/change-you-can-see)**
7. **[Hard to test is the design talking — listen to it.](/go/philosophy/listen-to-the-tests)**
8. **[Duplication is cheaper than the wrong abstraction.](/go/philosophy/wrong-abstraction)**
9. **[Make the next change local. That's the whole job.](/go/philosophy/keep-changes-local)**
10. **[You may disagree with any of these — but you need a reason.](/go/philosophy/disagree-with-reason)**

## The payoff

Code written this way is:

1. **Easier to read**: You come back in three months and still know where to look. A teammate joins the project and can follow the path without asking for a map.
2. **Easier to test**: Seams are visible. Boundaries are small enough to hold in your head. Tests stop fighting the design and start confirming it.
3. **Easier to change**: A new requirement lands, and you can move one part without shaking the whole system. The change stays local.
