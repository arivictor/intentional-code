import { PATTERNS } from "./patterns.js";

export const PHILOSOPHY = [
  {
    slug: "solid",
    title: "SOLID Principles",
    description: "The five SOLID principles, reinterpreted for Go's implicit-interface, composition-first model.",
    url: "/go/philosophy/solid",
    type: "philosophy",
  },
  {
    slug: "tdd",
    title: "Test-Driven Development",
    description: "The red/green/refactor loop in Go — and how design pressure naturally produces patterns.",
    url: "/go/philosophy/tdd",
    type: "philosophy",
  },
];

export const ALL_CONTENT = [
  ...PHILOSOPHY,
  ...PATTERNS.map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.intent,
    url: `/go/patterns/${p.category}/${p.slug}`,
    type: "pattern",
  })),
];

/** Resolve any slug (pattern or philosophy) to a content item, or null. */
export function getContent(slug) {
  return ALL_CONTENT.find((c) => c.slug === slug) ?? null;
}
