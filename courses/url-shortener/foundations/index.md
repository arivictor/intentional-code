---
title: "Foundations"
description: "Decide what you're actually building, and make the one design decision that the whole course depends on: separating code generation, storage, and transport."
---

## Where we start

Before any code, we lock down two things: *what you're building*, and the one design decision the rest of the course leans on.

First, what makes a URL shortener the ideal first backend — and the six properties that separate something you can deploy from a weekend toy. Then the decision everything else rests on: splitting the system into three independent concerns so that swapping a code-generation strategy never touches your storage, and swapping storage never touches your HTTP layer.

Get this division right and every later chapter slots in cleanly. Get it wrong and you'll be threading database calls through your URL-encoding logic by Chapter 3.
