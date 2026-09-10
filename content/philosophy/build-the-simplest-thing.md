---
title: Build the simplest thing that could possibly work
nav_title: Simplest thing that works
description: Make it work before you make it elegant. The crude first version is how you learn what the problem actually is.
order: 4
---

# Build the simplest thing that could possibly work

Ward Cunningham's old question, *"what's the simplest thing that could possibly work?"* outlines a rule about sequence: make it *work* before you make it *elegant*, because until something works you don't actually know what you're building. The crude first version is an instrument. A player made of a `CharacterBody2D` and a coloured rectangle, one enemy hard-coded in the level, health as an `int` on the player script: that version shows you which parts of the game are genuinely hard, which of your assumptions about the feel were wrong, and which of the abstractions you were itching to add — the state machine, the component system, the event bus — you'd only have regretted.

That's the line between *simple* and *naive*. The simplest thing that could possibly work still has to **work**, to handle the real edge cases, to fail honestly, to tell the truth in its errors. Coyote time is still there if the jump feels wrong without it; a null check on a freed enemy is correctness, not polish. What it skips is everything aimed at problems you haven't met yet: the difficulty curve nobody has tuned, the indirection guarding a change that may never come, the generality bought on spec. It's the same instinct as [the best pattern is often no pattern](/philosophy/no-pattern), aimed this time at how you *start*.

The reason it's worth the discipline is feedback. A working simple version can be played, profiled, handed to someone, and argued with. A half-finished elegant one can only be defended. And once the simple thing is real, you've earned the right to make it better, guided by what you actually saw rather than what you feared, which is exactly how good games [grow under real pressure](/philosophy/change-you-can-see) instead of being designed perfect on day one.
