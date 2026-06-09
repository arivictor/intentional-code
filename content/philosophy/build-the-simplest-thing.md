---
title: Build the simplest thing that could possibly work
nav_title: Simplest thing that works
description: Make it work before you make it elegant. The crude first version is how you learn what the problem actually is.
order: 4
---

# Build the simplest thing that could possibly work

Ward Cunningham's old question — *"what's the simplest thing that could possibly work?"* — isn't a licence to be sloppy. It's a rule about sequence: make it *work* before you make it *elegant*, because until something works you don't actually know what you're building. The crude first version isn't a draft to be embarrassed by; it's an instrument. It shows you which parts of the problem are genuinely hard, which of your assumptions were wrong, and which of the abstractions you were itching to add you'd only have regretted.

That's the line between *simple* and *naive*. The simplest thing that could possibly work still has to **work** — handle the real edge cases, fail honestly, tell the truth in its errors. What it skips is everything aimed at problems you haven't met yet: the configuration nobody asked for, the indirection guarding a change that may never come, the generality bought on spec. It's the same instinct as [the best pattern is often no pattern](/go/philosophy/no-pattern), aimed this time at how you *start*.

The reason it's worth the discipline is feedback. A working simple version can be run, measured, shown to someone, and argued with. A half-finished elegant one can only be defended. And once the simple thing is real, you've earned the right to make it better — guided by what you actually saw rather than what you feared, which is exactly how good systems [grow under real pressure](/go/philosophy/change-you-can-see) instead of being designed perfect on day one.
