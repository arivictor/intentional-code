---
title: If you can't name the trade-off, you didn't decide — you defaulted
nav_title: Name the trade-off
description: Every structural choice gives something up. If you can't say what, you didn't choose — you inherited a habit.
order: 2
---

# If you can't name the trade-off, you didn't decide — you defaulted

Every structural choice buys something and pays for something. An Autoload buys a reference you can reach from anywhere and pays in a scene that can no longer run on its own. A custom Resource buys data a designer can tune in the inspector and pays in a schema you must migrate when the save format changes. A component node buys reuse across a dozen enemies and pays in wiring, because the components have to find each other. There is no free move. So the test of whether you actually *made* a decision is blunt: can you say, out loud, what you gave up to get what you wanted?

If you can't, you didn't decide. You defaulted to habit, to the shape of the last project, to whatever the tutorial you followed happened to do, to what looked impressive in a devlog. Defaulting isn't always wrong; the default is sometimes the right answer. But you can't know that until you've named the alternative you're rejecting and the cost you're agreeing to pay.

## Decisions, not preferences

This is why architectural choices can't be settled by taste. "I like it this way" is not a reason; it's the absence of one. The reason has to come from the problem and the people in front of you — the content the designers will add, the platform you're shipping to, the frame budget you've measured, the team that will maintain the project after launch.

Sometimes the honest answer is that the problem in front of you is a game jam entry and needs a single script with everything in `_process`, and any structure you add is pure cost. Naming the trade-off is what lets you say that without flinching.

## How to name one

A trade-off you can defend usually fits in a single sentence: *"I'm putting the save logic behind a `SaveStorage` class because the file format is going to change before launch, and I'm paying for it with one more script between the player and the disk."* If you can't finish that sentence — if the "because" is vague or the "paying with" comes up empty — stop. The decision isn't ready, and shipping it commits the next reader to a cost you can't explain.

The discipline compounds. Code review stops being a clash of preferences and becomes a conversation about named costs. Pull requests discuss behaviour and trade-offs instead of whether a signal should have been a direct call.
