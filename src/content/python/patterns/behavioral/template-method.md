---
title: "Template Method"
category: behavioral
intent: "Define the skeleton of an algorithm in a base operation, deferring some steps to subclasses — but in Go, use composition and injected hook functions instead."
idiomSummary: "Define the workflow in a base class and let subclasses override selected steps."
relatedSlugs: ["strategy", "factory-method"]
tags: [closures, composition, interfaces]
---

# Template Method

Template Method defines the skeleton of an algorithm in a base class, letting subclasses override specific steps. In Python, this pattern fights the language — there's no inheritance, no abstract classes, no method overriding. But the problem it solves is real: you need a fixed algorithm structure with pluggable steps.

The Go solution: pass the variable steps as function values or interfaces via composition. This achieves the same result without fighting the language.

## Problem

You're building data importers for different file formats (CSV, JSON, XML). The overall process is the same: open the file, parse records, validate each record, save to database. The parsing step differs per format, but the skeleton is identical.

```python
# duplicated.py

def import_csv(path):
    data = readFile(path)
    records = parseCSV(data)
    for r in records:
        if err := validate(r); err != None : continue
        save(r)
    return None

def import_json(path):
    data = readFile(path)
    records = parseJSON(data)
    for r in records:
        if err := validate(r); err != None : continue
        save(r)
    return None

# The skeleton (read → parse → validate → save) is duplicated.
# Only the parse step differs. Adding XML means copying again.
```

The algorithm skeleton is copied for every format. The validation and save logic is duplicated. Adding a new format means copying the whole function and changing one line.

## Solution

In Python, inject the variable step as a function parameter. The skeleton is written once; the specific parser is passed in.

```
Import(path, parser)
  │
  ├── readFile(path)        ← fixed
  ├── parser(data)          ← injected
  ├── validate(record)      ← fixed
  └── save(record)          ← fixed

parser = parseCSV  │ parseJSON │ parseXML
```

Inject the variable step as a function parameter:

```python
# importer.py


class Record:
    id: string
    name: string

# ParseFunc is the pluggable step — the "template method" in Go terms.
type ParseFunc func(data list[byte) (list[Record, error)

# Import is the algorithm skeleton — written once.
def import(path, parse):
    fmt.Printf("Reading file: %s\n", path)
    data = readFile(path)

    records, err := parse(data)
    if err is not None :
        return fmt.Errorf("parse error: %w", err)

    for r in records:
        if err := validate(r); err is not None :
            fmt.Printf("  Skip invalid: %s\n", r.ID)
            continue
        save(r)
    return None

def read_file(path):
    return []byte(fmt.Sprintf("data from %s", path))

def validate(r):
    if r.ID == "" :
        return fmt.Errorf("missing ID")
    return None

def save(r):
    fmt.Printf("  Saved: %s (%s)\n", r.ID, r.Name)
```

Define parsers as plain functions:

```python
# parsers.py

def parse_csv(data):
    return []Record{
    :ID: "1", Name: "Alice"
    :ID: "2", Name: "Bob"
    , None

def parse_json(data):
    return []Record{
    :ID: "3", Name: "Charlie"
    :ID: "", Name: "Invalid"
    , None
```

```python
# main.py


def main():
    importer.Import("users.csv", importer.ParseCSV)
    importer.Import("users.json", importer.ParseJSON)
```

Output:

```
Reading file: users.csv
  Saved: 1 (Alice)
  Saved: 2 (Bob)
Reading file: users.json
  Saved: 3 (Charlie)
  Skip invalid:
```

> In Python, Template Method as described in the GoF book (using inheritance and method overriding) is impossible and should not be attempted. The idiomatic Python solution — injecting hook functions or accepting an interface with the variable steps — achieves the same goal through composition.

## When to Use

- You have an algorithm with a fixed structure and one or two steps that vary.
- In Go: use this when you'd use Template Method in Java — but pass function values instead of overriding methods.

## When Not to Use

- Most or all steps vary — you don't have a fixed skeleton, you have a completely different algorithm. Use [Strategy](/python/patterns/behavioral/strategy) instead.
- The skeleton is trivial (2–3 lines). Just inline it.

## Advantages

- The algorithm skeleton is written once — no duplication.
- New variations only need to implement the pluggable steps.
- In Python, function injection is lightweight and doesn't require new types.

## Disadvantages

- If there are many hooks, the function signature becomes unwieldy (consider a struct of functions or an interface).
- The fixed steps can't be customized — that's by design but can be limiting.

## Related Patterns

- **Strategy** — Strategy replaces the entire algorithm; Template Method holds the skeleton fixed and replaces one or two steps — prefer Strategy when the overall structure varies, Template Method when only the details do.
- **Factory Method** — Factory Method is commonly used as one pluggable step inside a Template Method skeleton, where the "how to create the object" step varies while the overall process stays fixed.
