---
title: "Foundations"
order: 1
description: "Decide what you're actually building, and make the one design decision that the whole course depends on: separating code generation, storage, and transport."
---

## Where we start

Before any code, two questions decide whether this project succeeds: *should you build a URL shortener at all*, and *what are its parts*.

This chapter answers both. First, an honest look at when a custom shortener is the right call and when you should reach for an existing service. Then the single design decision the rest of the course leans on — splitting the system into three independent concerns so that swapping a code-generation strategy never touches your storage, and swapping storage never touches your HTTP layer.

Get this division right and every later chapter slots in cleanly. Get it wrong and you'll be threading database calls through your URL-encoding logic by Chapter 3.
