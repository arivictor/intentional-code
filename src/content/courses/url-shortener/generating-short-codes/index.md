---
title: "Generating Short Codes"
order: 2
description: "Turn a number into a compact code, then make the generation strategy swappable — sequential, random, or hashed — behind one interface."
---

## The First Real Decision

A short code is the product. `sho.rt/9aX2` lives or dies on how those four characters are chosen: too predictable and competitors scrape your growth; too long and it isn't short; collision-prone and you lose links.

This chapter fills the `Generator` hole from Chapter 1. First we build the primitive every numeric scheme needs — base62 encoding — as its own package with a real test. Then we discover there isn't one right generation algorithm; there are three, each with a different tradeoff. Rather than pick one and hard-code it, we make the choice swappable with the [Strategy pattern](/go/patterns/behavioral/strategy), and configure it with functional options.

By the end, switching from human-friendly sequential codes to unguessable random ones is a one-line change at startup — and `Service` never notices.
