---
title: Intentional Code
nav_title: Home
description: Learn Godot and GDScript patterns with intention. When to use them, when they're over-engineering.
icon: house
order: 0
---

![Intentional Code](/assets/image.png)

Most pattern catalogues show you the code. This one shows you the call. Every pattern here—21 architectural, 11 behavioural, 8 concurrency, 6 creational, 7 structural, 8 synchronisation—comes with the trade-off it makes, the situation that earns it, and the situation where it's over-engineering. The examples are GDScript for Godot 4, and the situations are the ones a game actually produces: enemies, inventories, dialogue, save systems, HUDs, and the scene tree that holds them together.

The goal is never a finished game. It's the ability to make a good structural call on a problem you've never seen—including the call to use no pattern at all.

## Not a tutorial

A tutorial answers "how do I build X?" and hands you the one true path. You cannot disagree with it.

Intentional Code answers "why would you structure X this way, and when wouldn't you?" It takes positions you could argue with. That is the point.

Good architecture is knowing which pattern the problem in front of you actually needs — a state machine, a component node, a signal, an Autoload — and having the judgment to reach for none of them when a plain method call is the right answer.

## But A Philosophy

Most of what's written about software design is presented as rules: name your laws, apply your patterns, pass the code review. But the rules disagree with each other. DRY tells you to merge the two enemies, YAGNI tells you to wait, SOLID tells you to abstract, KISS tells you to stop. Following all of them at once is impossible, and that's the point. They were never meant to be followed as rules. They're positions in an argument about trade-offs, and the real skill is knowing which one wins in the situation you're actually in.

The reasoning behind these arguments is what I call intentional code, and the [Tenets](/philosophy) are it written down. They're ten positions on how to make architectural decisions with intention, with the laws as worked examples.

## With Intention

Code written this way is:

1. **Easier to read**: You come back in three months and still know where to look. A teammate joins the project and can follow the path without asking for a map.
2. **Easier to test**: Seams are visible. Boundaries are small enough to hold in your head. Tests stop fighting the design and start confirming it.
3. **Easier to change**: A new requirement lands, and you can move one part without shaking the whole system. The change stays local.
