# Intentional Code

This repository contains the Intentional Code reference site.

## Prerequisites

- A current Node.js LTS release
- npm

## Local setup

1. Clone the repository and change into `/tmp/workspace/arivictor/intentional-code`.
2. Install dependencies with `npm ci --legacy-peer-deps`.
3. Start the local dev server with `npm run dev`.

The install step uses `--legacy-peer-deps` because `@astrojs/tailwind` currently declares a peer range that does not include the Astro version used in this repo.

## Build and generated assets

- `npm run build` builds the Astro site.
- `node scripts/generate-sitemap.js` generates `public/sitemap.xml` for production output.
- `npm run generate:og` refreshes Open Graph images.
- `npm run ci` runs the build plus the asset-generation steps used for deployment.
