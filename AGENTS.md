# AGENTS.md

Guidance for AI agents and contributors working in this repo. Read the voice rules
in **Content voice** before editing any `src/content/**` markdown — they are the part
people most often get wrong.

## What this is

**Intentional Code** is a content-driven field guide for writing idiomatic Go — design
patterns, principles, and hands-on courses. It is a **learning and reference resource**,
not a product. Nothing here is about evaluating business cases or commercial viability;
the goal is to help an engineer understand patterns and apply them.

- **Stack:** Astro (SSG) + React islands + Tailwind. Content lives in markdown content
  collections; there are no hardcoded data files for patterns/courses.
- **Output:** a fully static site. The production build is the source of truth — if
  `npm run build` is green, the content and routes are valid.

## Commands

| Task | Command |
|---|---|
| Dev server (port 5173) | `npm run dev` |
| Production build | `npm run build` |
| Preview built site | `npm run preview` |
| Lint / autofix | `npm run lint` / `npm run lint:fix` |
| Full CI (build + sitemap + OG images) | `npm run ci` |

`scripts/generate-sitemap.js` derives the sitemap from `dist/` after a build, so new
pages are picked up automatically — no manual route list to maintain.

## Content voice — the one rule that matters most

There are two kinds of content, and they have **opposite jobs**. Do not apply one's
structure to the other.

### Pattern pages (`src/content/patterns/**`) — reference

The reader is deciding *whether* a pattern fits their problem. These pages **should**:

- weigh tradeoffs honestly and say when **not** to use the pattern,
- push back when warranted (e.g. Singleton opens by calling itself an anti-pattern in
  most Go codebases),
- treat "*should* you use this, and when?" as the governing question.

Intellectual honesty and "when not to" sections belong here.

### Courses (`src/content/courses/**`) — practice

The reader has **already committed to building the project**. The entire point is to
**build it and apply the patterns hands-on**. These pages **must read with confidence**:

- **Assume the build is happening.** Never question whether to build the project.
- **Frame the "why" as what you learn by building it**, not whether it's justified.
- **No pattern-page hedging.** Do not add sections like "When It Is a Mistake," "When
  You Should Just Use a Service," or "should you build X at all." Do not write things
  like "most of the time you should not build this," "you probably won't do better than
  \<library\>," or "reach for \<library\> and move on."
- When describing a technique's limits, frame it as **deliberate scope** ("Where this
  router stops"), not as doubt ("When not to reach for this").

**The one nuance:** per-step **`## Tradeoffs`** sections that explain the engineering
cost of a pattern you *just applied* (e.g. cache invalidation as the Decorator's cost,
the token bucket's limits) are good — that's applying the pattern *with understanding*.
The line is simple:

> Explain the tradeoffs of a **technique you are using**. Never hedge about the
> **project you are building**.

Courses are for learning by building, never for evaluating products or commercial
decisions.

## Repository structure

```
src/
  content/
    patterns/<category>/<slug>.md     # reference pages (creational, structural,
                                      #   behavioral, architectural, concurrency)
    patterns/<category>/index.md      # category landing (pattern-categories collection)
    philosophy/<slug>.md              # principles (SOLID, KISS, YAGNI, …)
    courses/<course>/index.md         # course landing
    courses/<course>/<chapter>/index.md          # chapter
    courses/<course>/<chapter>/<step>.md         # step (the actual lessons)
    pages/home.md                     # editable home copy
  content.config.ts                   # all collection schemas (Zod)
  lib/
    section-config.js                 # GO_SECTION: basePath /go, collection names,
                                      #   category/philosophy/course ordering
    site-data.js                      # builds nav order, search data, course nav/data
  pages/                              # Astro routes (index.astro, go/**, 404)
  components/                         # React islands + Astro layout/UI
scripts/                             # sitemap + OG image generation (post-build)
```

Nav order, breadcrumbs, search, prev/next, and the home page are all **derived** from
content + `section-config.js`. To add a pattern or course step, add the markdown file
with correct frontmatter — wiring is automatic. Adjust ordering in `section-config.js`
(`categoryOrder`, `philosophyOrder`, `courseOrder`).

### Frontmatter (see `src/content.config.ts` for the authority)

- **Pattern:** `title`, `category`, `intent`, `idiomSummary?`, `relatedSlugs[]`,
  `tags[]`, `isFeatured`.
- **Course:** `title`, `description`, `level` (beginner|intermediate|advanced),
  `tags[]`, `isFeatured`.
- **Chapter / step:** `title`, `order` (number), `description?`.

If you add a field to a markdown file, add it to the schema too, or the build fails.
Equally, don't leave schema fields with no consumer (see "drills" below).

## Course conventions

- **Standard library only** in course code examples. The constraint is pedagogical: you
  build each capability instead of importing it, which is where the pattern shows up.
  Don't introduce third-party deps into course code.
- **Anchor each chapter to a pattern/principle** and link to its reference page
  (e.g. the caching wrapper → Decorator, swappable code generators → Strategy).
- **"Practice" in the nav means courses**, not a quiz. The course nav order is built in
  `buildCourseNavOrder` and labelled "Practice".

## Gotchas

- **Dev server goes stale after many content edits.** Astro's dev content layer can get
  into a bad state and return `500` ("Missing parameter: step") on course **step**
  routes while the home and pattern pages still work. It's not your content — **restart
  `npm run dev`** to clear it. The production build is unaffected; trust it.
- **`README.md` is stale/unrelated** — it currently describes an electrical-engineering
  compliance tool, not this site. Don't treat it as a source of truth; prefer this file
  and the actual code/content.

## Removed — do not reintroduce

- The **recognition quiz / "Spot the Pattern" drills** (formerly `/go/drills`, plus the
  `PatternDrills` component, `src/lib/drills.js`, and the `recognitionHook` frontmatter
  field) were removed deliberately as shallow. Don't add them back without a clear ask.
