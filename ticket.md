# Plan: `index.md` as the folder invariant — nav, routing, and a 404 page

## Context

Clicking the **Patterns** button in the top nav jumps into `patterns/architectural` instead of a patterns landing page. Root cause: the router and the nav disagree about what a folder *is*.

- **Router** ([runtime.go:92](runtime.go:92)) registers a route per `.md` file; an `index.md` becomes the folder's route. `content/patterns/` has **no `index.md`**, so `/patterns` is not a real route.
- **Nav** ([nav.go:120](nav.go:120), [nav.go:165](nav.go:165)) papers over that with `firstRoute` — it links an index-less folder to its first descendant, so the button silently points at `architectural`.

We're formalizing one rule and making both consumers obey it:

> **A directory is represented by its `index.md`. No `index.md` → the folder is not a routable or clickable destination.** Pages inside it are its children.

Design approach: the content tree is a **Composite** (folder = node, `index.md` = the node's page, sub-pages/folders = children), and the invariant above is a **single source of truth** computed in `ContentIndex` and read by *both* the router and the nav so they can't drift again. The 404 reuses the existing `ErrorResponder` **strategy** ([app.go:11](app.go:11)) — we add an HTML implementation alongside the JSON one.

## Decisions (confirmed with user)

- Index-less folder in the **sidebar** → non-clickable group **label** (children stay listed/reachable). Top nav always **skips** it (can't put a non-link in a horizontal bar).
- **Add `content/patterns/index.md`** so Patterns keeps a top-nav button after the rule change.

## In-scope changes

### 1. Nav obeys the invariant — `nav.go`
- **`TopNav()`** ([nav.go:115](nav.go:115)): remove the `firstRoute` fallback. Skip any top-level dir whose `Route == ""` (no `index.md`); keep root-level pages.
- **`buildNodes()`** ([nav.go:153](nav.go:153)): build the node with `Path: dir.Route` directly (no `firstRoute`). An index-less folder gets `Path == ""`, which the `navtree` template **already** renders as `<span class="navitem folder">` ([layout.html:527](templates/layout.html:527)) — i.e. a non-clickable label with children beneath. No template change needed.
- Delete `firstRoute` ([nav.go:181](nav.go:181)) — it becomes unused after the two edits above (only caller sites).

### 2. HTML 404 / error page — `response.go`, `template.go`, new `templates/error.html`, `layout.html`
The error path is currently JSON-only, so a content 404 returns `{"error":"..."}`. Make it render HTML.

- **`template.go`**: add `StatusCode int` to `PageData`; add `RenderStatus(w, status, name, data)` to the `TemplateRenderer` interface + `FileTemplateRenderer` (sets `Content-Type`, then `w.WriteHeader(status)`, then executes). Refactor existing `Render` to delegate: `RenderStatus(w, http.StatusOK, name, data)`. (Today's `Render` sets headers *after* the body starts — `RenderStatus` fixes the ordering for non-200.)
- **`response.go`**: add `HTMLErrorResponder{ Renderer TemplateRenderer; TopNav []NavLink; Logger *log.Logger }`. `Handle` maps the error → status (`BadRequestError`→400, `HTTPError`→`.Status`, else 500 + log), picks a headline/sub-message, and calls `RenderStatus(w, status, "error", PageData{StatusCode, Title, Description, TopNav, Time})`; on render failure, fall back to `http.Error`. Remove the now-unused `JSONErrorResponder` (no API consumers in the repo).
- **`templates/error.html`** (new): a `content` block — big muted `{{.StatusCode}}`, `<h1>{{.Title}}</h1>`, optional `.lede`, and a "Back to home" link. Renders through `layout` so it gets the header/top-nav + footer; no sidebar/TOC (empty `Nav`/`Headings`).
- **`layout.html`**: add a small `.errorpage` style block in the existing `<style>`, reusing current CSS tokens.

### 3. Routing wires the 404 — `runtime.go`
- Reorder `App.Run` so `renderer` and `index` exist *before* the server is created, then:
  `httpApp := NewServer(HTMLErrorResponder{Renderer: renderer, TopNav: index.TopNav(), Logger: log.Default()})`. Reuse that `topNav` in `registerContentRoutes` (it already recomputes it at [runtime.go:89](runtime.go:89)).
- Catch-all `/` handler ([runtime.go:53](runtime.go:53)): keep the existing redirect branches; replace the terminal `staticFiles.ServeHTTP(w, r); return nil` with: *if* the path resolves to a real file under `publicDir` (new `staticFileExists` helper using `filepath.Clean` + `filepath.Rel` containment guard — mirror the pattern in [`resolveContentPath`](markdown.go:169) — and `os.Stat` `!IsDir`), serve it; **else** `return &HTTPError{Status: http.StatusNotFound, Message: "page not found"}`. The error then renders the HTML 404 via the responder. Index-less folder routes (`/patterns` before its `index.md`, any typo) all funnel here.

### 4. New `content/patterns/index.md`
Frontmatter `title: Patterns` + a one-line `description`. Prose intro in the site's voice that names the five families (**Creational, Structural, Behavioral, Concurrency, Architectural**) in **bold** (bold renders; links do not — see below) and points readers to the sidebar to browse. Landing on `/patterns` auto-lists the five category pages in the sidebar, so the page is fully navigable without in-body links.

## Discovered, NOT in this plan (recommended fast-follow)

These make all *existing* content look broken but are independent of the three rules. Suggest a dedicated follow-up:

- **A. Renderer ignores links.** `renderInline` ([markdown.go:396](markdown.go:396)) handles code/bold/italic but not `[text](url)`, so every in-body link renders as literal text sitewide. Fix is a small regex pass in `renderInline`.
- **B. Stale `/go/` link prefix.** In-body links target `/go/patterns/...` but real routes are `/patterns/...` (no `go` prefix). Coupled with A: once links render, they'd 404 until rewritten `/go/` → `/`. The code comments ([runtime.go:108](runtime.go:108), [nav.go:34](nav.go:34)) still say `/go` too.

## Verification

1. `go build ./... && go vet ./...` (module `intentionalcode`, Go 1.24.4).
2. `go run ./cmd` (`:8080`), then verify with preview tools:
   - `/` → 200; top nav shows **Patterns** and **Philosophy**, both clickable.
   - `/patterns` → 200; new landing renders; sidebar lists the 5 categories as links.
   - `/patterns/architectural` → 200 (unchanged behavior).
   - `/nope` and `/patterns/typo` → styled HTML **404** (confirm status via `preview_network`/`curl -i`), with header/top-nav + footer + "Back to home".
   - `/favicon.ico`, `/sitemap.xml` → still served 200 from `public/`.
   - `preview_screenshot` of the 404 page and `/patterns` as proof.
3. Optional — exercise the sidebar-label rule (no index-less folder remains after step 4): temporarily add `content/_tmp/child.md` with no `_tmp/index.md`; confirm `_tmp` shows as a non-clickable label with `child` beneath, and `/​_tmp` returns the 404; then delete it.

## Touched files
`nav.go`, `response.go`, `template.go`, `runtime.go`, `templates/layout.html`, new `templates/error.html`, new `content/patterns/index.md`.