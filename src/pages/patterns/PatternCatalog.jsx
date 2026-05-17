import React from "react";
import { Link } from "react-router-dom";
import { PATTERNS, CATEGORY_ORDER, CATEGORIES, getPatternsByCategory } from "@/lib/content/patterns";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";
import CategoryBadge from "@/components/content/CategoryBadge";
import Callout from "@/components/content/Callout";

export default function PatternCatalog() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Breadcrumbs />

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">Pattern Catalog</h1>
      <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-2xl">
        All 22 Gang-of-Four design patterns, organized into three categories. Each pattern is
        presented with idiomatic Go implementations and honest assessments of when to use it —
        and when the language gives you something better.
      </p>

      <Callout variant="tip" title="How to read a pattern page">
        Every pattern page follows the same structure: <strong>Intent</strong> (what it's for),
        <strong> Problem</strong> (a concrete scenario with naive code), <strong>Solution</strong> (the
        pattern with diagrams and idiomatic Go), <strong>When to use / not use</strong>,
        <strong> Advantages & Disadvantages</strong>, and <strong>Related Patterns</strong>. This rigid
        structure lets you compare patterns directly and build intuition for which one fits your situation.
      </Callout>

      {CATEGORY_ORDER.map((catKey) => {
        const cat = CATEGORIES[catKey];
        const patterns = getPatternsByCategory(catKey);
        return (
          <section key={catKey} className="mb-12">
            <Link
              to={`/patterns/${catKey}`}
              className="group flex items-center gap-2 mb-1 hover:text-primary transition-colors"
            >
              <h2 className="text-2xl font-semibold text-foreground group-hover:text-primary transition-colors">
                {cat.title}
              </h2>
            </Link>
            <p className="text-sm text-muted-foreground mb-4">{cat.lede}</p>

            <div className="border border-border rounded-lg overflow-hidden">
              {patterns.map((p, i) => (
                <Link
                  key={p.slug}
                  to={`/patterns/${p.category}/${p.slug}`}
                  className={`group flex items-start gap-4 p-4 hover:bg-accent/50 transition-colors ${
                    i < patterns.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {p.title}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">{p.intent}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <PrevNextNav />
    </div>
  );
}