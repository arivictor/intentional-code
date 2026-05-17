import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lightbulb, Layers, BookText, ArrowRight, Box, Puzzle, Workflow } from "lucide-react";
import { PATTERNS, CATEGORY_ORDER, CATEGORIES, getPatternsByCategory } from "@/lib/content/patterns";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";
import CategoryBadge from "@/components/content/CategoryBadge";

const ENTRY_POINTS = [
  {
    icon: Lightbulb,
    title: "Philosophy",
    description: "SOLID principles and TDD — reinterpreted for Go's composition-first model.",
    path: "/philosophy",
  },
  {
    icon: Layers,
    title: "Pattern Catalog",
    description: "All 22 GoF patterns, implemented idiomatically in Go with honest assessments.",
    path: "#patterns",
  },
  {
    icon: BookText,
    title: "Glossary",
    description: "Quick reference for Go-specific terms used throughout the site.",
    path: "/glossary",
  },
];

const CATEGORY_ICONS = { creational: Box, structural: Puzzle, behavioral: Workflow };

export default function Home() {
  const navigate = useNavigate();

  const handleEntryClick = (e, path) => {
    if (path.startsWith("#")) {
      e.preventDefault();
      document.getElementById(path.slice(1))?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Hero */}
      <div className="mb-16">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
          Intentional Architecture{" "}
          <span className="text-primary">with Go</span>
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
          A Go-first reference for software design philosophy and the 22 Gang-of-Four design patterns.
          Every pattern presented the way an experienced Go engineer would actually write it — not as a
          mechanical translation of class-based OOP.
        </p>
      </div>

      {/* The Go Framing */}
      <section className="mb-16">
        <h2 className="text-2xl font-semibold mb-4 text-foreground">Why a Go-specific patterns reference?</h2>
        <div className="prose-pattern">
          <p>
            Most design-pattern resources teach patterns through the lens of Java or C++ — languages
            with classes, inheritance hierarchies, and explicit interface implementation. Go has none of
            these. It has composition, implicit interface satisfaction, first-class functions, and a strong
            bias toward simplicity.
          </p>
          <p>
            This means many GoF patterns <strong>change shape</strong> in Go. Some collapse into a single
            function value. Others become unnecessary because the language already provides the mechanism.
            A few gain new power through goroutines and channels. And some genuinely fight the language
            and should be avoided.
          </p>
          <p>
            This site is honest about all of that. Every pattern page tells you not just how to implement
            it in Go, but whether you should — and what the idiomatic alternative looks like when you shouldn't.
          </p>
        </div>
      </section>

      {/* Entry Points */}
      <section className="mb-16">
        <h2 className="text-2xl font-semibold mb-6 text-foreground">Start here</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {ENTRY_POINTS.map((ep) => (
            <Link
              key={ep.path}
              to={ep.path}
              onClick={(e) => handleEntryClick(e, ep.path)}
              className="group p-5 rounded-lg border border-border hover:border-primary/40 bg-card hover:bg-accent/30 transition-all"
            >
              <ep.icon className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                {ep.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{ep.description}</p>
              <div className="mt-3 flex items-center gap-1 text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Explore <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Pattern Catalog Grid */}
      <section id="patterns" className="mb-12">
        <h2 className="text-2xl font-semibold mb-6 text-foreground">Pattern catalog</h2>
        <div className="mb-6 rounded-lg border border-primary/20 bg-accent/40 p-4 flex gap-3">
          <span className="text-primary mt-0.5">💡</span>
          <div className="text-sm text-foreground/85 leading-relaxed">
            <strong>How to read a pattern page: </strong>
            Every pattern follows the same structure: <strong>Intent</strong>, <strong>Problem</strong>, <strong>Solution</strong>, <strong>When to use / not use</strong>, <strong>Advantages & Disadvantages</strong>, and <strong>Related Patterns</strong>.
          </div>
        </div>
        {CATEGORY_ORDER.map((catKey) => {
          const cat = CATEGORIES[catKey];
          const patterns = getPatternsByCategory(catKey);
          const Icon = CATEGORY_ICONS[catKey];
          return (
            <div key={catKey} className="mb-8">
              <Link
                to={`/patterns/${catKey}`}
                className="flex items-center gap-2 mb-3 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon className="h-4 w-4" />
                <h3 className="font-semibold text-sm uppercase tracking-wider">{cat.title}</h3>
              </Link>
              <div className="grid gap-2 sm:grid-cols-2">
                {patterns.map((p) => (
                  <Link
                    key={p.slug}
                    to={`/patterns/${p.category}/${p.slug}`}
                    className="group flex items-start gap-3 p-3 rounded-md hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                        {p.title}
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
  );
}