import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Box, Puzzle, Workflow, CheckCircle, Building2, Scale } from "lucide-react";
import { PATTERNS, CATEGORY_ORDER, CATEGORIES, getPatternsByCategory } from "@/lib/content/patterns";
import { ALL_CONTENT, PHILOSOPHY } from "@/lib/content/all-content";
import { getReadPatterns } from "@/lib/readingProgress";
import PageMeta from "@/components/PageMeta";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";
import CategoryBadge from "@/components/content/CategoryBadge";

const CATEGORY_ICONS = { creational: Box, structural: Puzzle, behavioral: Workflow, architectural: Building2 };

export default function Home() {
  const [readSlugs, setReadSlugs] = useState([]);

  useEffect(() => {
    setReadSlugs(getReadPatterns());
  }, []);

  const readCount = ALL_CONTENT.filter((c) => readSlugs.includes(c.slug)).length;
  const totalCount = ALL_CONTENT.length;
  const progressPct = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

  // Last 3 read items (patterns + philosophy) for "Continue reading"
  const recentlyRead = ALL_CONTENT.filter((c) => readSlugs.includes(c.slug)).slice(-3).reverse();
  // Next unread item across all content
  const nextUnread = ALL_CONTENT.find((c) => !readSlugs.includes(c.slug));

  return (
    <>
    <PageMeta title="Design Patterns in Go" description="23 design patterns and SOLID principles, implemented in idiomatic Go — with examples, tradeoffs, and cross-references." />
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Hero */}
      <div className="mb-16">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
          Intentional Code{" "}
          <span className="text-primary">with Go</span>
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
          Software design patterns and principles, written for Go engineers. Every pattern shows what
          idiomatic Go actually looks like — where a pattern fits, where it fights the language, and
          what to reach for instead.
        </p>
      </div>

{/* Progress + Continue Reading */}
      {readCount > 0 && (
        <section className="mb-12 p-5 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Your progress</h2>
            <span className="text-sm text-muted-foreground">{readCount} / {totalCount} pages read</span>
          </div>
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mb-5">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {nextUnread && (
            <div className="mb-4">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Up next</div>
              <Link
                to={nextUnread.url}
                className="group flex items-center gap-3 p-3 rounded-md border border-border hover:border-primary/40 hover:bg-accent/40 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">{nextUnread.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{nextUnread.description}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
              </Link>
            </div>
          )}
          {recentlyRead.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Recently read</div>
              <div className="space-y-1">
                {recentlyRead.map((item) => (
                  <Link
                    key={item.slug}
                    to={item.url}
                    className="group flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-accent/50 transition-colors"
                  >
                    <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{item.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Pattern Catalog Grid */}
      <section id="patterns" className="mb-12">
        <h2 className="text-2xl font-semibold mb-6 text-foreground">Pattern catalog</h2>

        {/* Philosophy */}
        <div className="mb-8">
          <Link
            to="/go/philosophy"
            className="flex items-center gap-2 mb-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Scale className="h-4 w-4" />
            <h3 className="font-semibold text-sm uppercase tracking-wider">Design Philosophy</h3>
          </Link>
          <div className="grid gap-2 sm:grid-cols-2">
            {PHILOSOPHY.map((item) => (
              <Link
                key={item.slug}
                to={item.url}
                className="group flex items-start gap-3 p-3 rounded-md hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                      {item.title}
                    </span>
                    {readSlugs.includes(item.slug) && (
                      <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {CATEGORY_ORDER.map((catKey) => {
          const cat = CATEGORIES[catKey];
          const patterns = getPatternsByCategory(catKey);
          const Icon = CATEGORY_ICONS[catKey];
          return (
            <div key={catKey} className="mb-8">
              <Link
                to={`/go/patterns/${catKey}`}
                className="flex items-center gap-2 mb-3 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon className="h-4 w-4" />
                <h3 className="font-semibold text-sm uppercase tracking-wider">{cat.title}</h3>
              </Link>
              <div className="grid gap-2 sm:grid-cols-2">
                {patterns.map((p) => (
                  <Link
                    key={p.slug}
                    to={`/go/patterns/${p.category}/${p.slug}`}
                    className="group flex items-start gap-3 p-3 rounded-md hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                          {p.title}
                        </span>
                        {readSlugs.includes(p.slug) && (
                          <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.intent}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <PrevNextNav />
    </div>
    </>
  );
}