import React from "react";
import { Link, useParams } from "react-router-dom";
import { CATEGORIES, getPatternsByCategory } from "@/lib/content/patterns";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";

export default function CategoryLanding() {
  const { category } = useParams();
  const cat = CATEGORIES[category];

  if (!cat) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold">Category not found</h1>
      </div>
    );
  }

  const patterns = getPatternsByCategory(category);

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Breadcrumbs />

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">{cat.title}</h1>
      <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-2xl">{cat.lede}</p>

      {/* Comparison table */}
      <div className="border border-border rounded-lg overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Pattern</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Intent</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden md:table-cell">Go Idiom</th>
              </tr>
            </thead>
            <tbody>
              {patterns.map((p, i) => (
                <tr key={p.slug} className={i < patterns.length - 1 ? "border-b border-border" : ""}>
                  <td className="px-4 py-3">
                    <Link
                      to={`/go/patterns/${p.category}/${p.slug}`}
                      className="font-medium text-primary hover:underline whitespace-nowrap"
                    >
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.intent}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs font-mono">{p.goIdiomSummary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pattern list */}
      <div className="space-y-3">
        {patterns.map((p) => (
          <Link
            key={p.slug}
            to={`/go/patterns/${p.category}/${p.slug}`}
            className="group block p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/30 transition-all"
          >
            <div className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1">
              {p.title}
            </div>
            <div className="text-sm text-muted-foreground">{p.intent}</div>
          </Link>
        ))}
      </div>

      <PrevNextNav />
    </div>
  );
}