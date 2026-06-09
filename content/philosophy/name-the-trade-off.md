---
title: If you can't name the trade-off, you didn't decide — you defaulted
nav_title: Name the trade-off
description: Every structural choice gives something up. If you can't say what, you didn't choose — you inherited a habit.
order: 2
---

# If you can't name the trade-off, you didn't decide — you defaulted

Every structural choice buys something and pays for something. An interface buys substitutability and pays in indirection. A cache buys latency and pays in staleness. A new package buys isolation and pays in ceremony. There is no free move. So the test of whether you actually *made* a decision is blunt: can you say, out loud, what you gave up to get what you wanted?

If you can't, you didn't decide. You defaulted — to habit, to fashion, to the shape of the last codebase you worked in, to whatever looked impressive in a conference talk. Defaulting isn't always wrong; the default is sometimes the right answer. But you can't know that until you've named the alternative you're rejecting and the cost you're agreeing to pay.

## Decisions, not preferences

This is why architectural choices can't be settled by taste. "I like it this way" is not a reason; it's the absence of one. The reason has to come from the problem and the people in front of you — the change you expect, the team that will maintain it, the failures you can't afford — not from what you happen to find elegant or have used before.

Sometimes the honest answer is that the problem in front of you needs a dirty, top-to-bottom script, and any structure you add is pure cost. Naming the trade-off is what lets you say that without flinching.

## How to name one

A trade-off you can defend usually fits in a single sentence: *"I'm adding this seam because the storage backend is likely to change, and I'm paying for it with one more layer of indirection."* If you can't finish that sentence — if the "because" is vague or the "paying with" comes up empty — stop. The decision isn't ready, and shipping it commits the next reader to a cost you can't explain.

The discipline compounds. Code review stops being a clash of preferences and becomes a conversation about named costs. Pull requests discuss behaviour and trade-offs instead of style.
