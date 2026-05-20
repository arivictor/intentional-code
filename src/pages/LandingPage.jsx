import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Code2, GitBranch, BookMarked, Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme";
import PageMeta from "@/components/PageMeta";

const TRACKS = [
  {
    lang: "Go",
    slug: "go",
    accent: "#00adb5",
    description: "All 22 Gang-of-Four patterns and SOLID principles, implemented in idiomatic Go.",
    stats: "30 patterns · SOLID · TDD",
    available: true,
  },
  {
    lang: "Python",
    slug: "python",
    accent: "#3b82f6",
    description: "Patterns in Python — leveraging duck typing, dataclasses, and the standard library.",
    stats: "Coming soon",
    available: false,
  },
  {
    lang: "Terraform",
    slug: "terraform",
    accent: "#7c3aed",
    description: "Infrastructure patterns — modules, abstractions, and composition in HCL.",
    stats: "Coming soon",
    available: false,
  },
];

const FEATURES = [
  {
    icon: Code2,
    title: "Idiomatic, not translated",
    body: "Every pattern is written the way you'd actually use it — not a Java example with the syntax swapped. Where a pattern fights the language, the page says so and shows what to reach for instead.",
  },
  {
    icon: GitBranch,
    title: "Cross-referenced",
    body: "Each pattern links to related ones with directional guidance: not just \"these are similar\" but \"use X when you need Y, use Z when you need W.\" No dead ends.",
  },
  {
    icon: BookMarked,
    title: "Built for reading",
    body: "Track what you've read, save pages for later, highlight text and review it in one place. Progress persists across sessions — pick up where you left off.",
  },
];

const GO_CATEGORIES = [
  { label: "Creational", count: 5, desc: "Object-creation patterns" },
  { label: "Structural", count: 7, desc: "Composition and wrappers" },
  { label: "Behavioral", count: 10, desc: "Algorithms and responsibility" },
  { label: "Architectural", count: 8, desc: "System-level structure" },
];

export default function LandingPage() {
  const { theme, toggle } = useTheme();

  return (
    <>
      <PageMeta description="The 22 Gang-of-Four design patterns and SOLID principles, implemented in idiomatic Go." />
      <div className="min-h-screen bg-background flex flex-col">
        <header className="flex items-center justify-between px-6 py-5 border-b border-border">
          <span className="font-mono font-bold text-lg text-primary">Intentional Code</span>
          <button
            onClick={toggle}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center px-6 py-20">
          {/* Hero */}
          <div className="text-center max-w-2xl mb-6">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-5 leading-tight">
              Design patterns for the{" "}
              <span className="text-primary">language you write</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Not textbook translations. Every pattern shows the idiomatic implementation — where it fits,
              where it fights the language, and what to reach for instead.
            </p>
          </div>

          {/* Stats strip */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-16 text-sm text-muted-foreground">
            {["30 patterns", "4 categories", "SOLID + TDD", "Highlights & bookmarks"].map((s, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-primary/60 inline-block" />
                {s}
              </span>
            ))}
          </div>

          {/* Feature cards */}
          <div className="grid gap-5 sm:grid-cols-3 w-full max-w-3xl mb-16">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="flex flex-col gap-3 p-5 rounded-xl border border-border bg-card"
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 shrink-0">
                  <Icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground mb-1">{title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Go track category preview */}
          <div className="w-full max-w-3xl mb-16">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              What's inside the Go track
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {GO_CATEGORIES.map(({ label, count, desc }) => (
                <Link
                  key={label}
                  to={`/go/patterns/${label.toLowerCase()}`}
                  className="group flex flex-col gap-1 p-4 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-accent/30 transition-all"
                >
                  <span className="text-2xl font-bold text-primary">{count}</span>
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {label}
                  </span>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Language tracks */}
          <div className="w-full max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Choose your language
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {TRACKS.map((track) =>
                track.available ? (
                  <Link
                    key={track.slug}
                    to={`/${track.slug}`}
                    className="group relative flex flex-col gap-3 p-6 rounded-xl border border-border hover:border-primary/50 bg-card hover:bg-accent/30 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-2xl" style={{ color: track.accent }}>
                        {track.lang}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{track.description}</p>
                    <span className="text-xs text-primary/70 font-mono">{track.stats}</span>
                  </Link>
                ) : (
                  <div
                    key={track.slug}
                    className="flex flex-col gap-3 p-6 rounded-xl border border-border bg-card opacity-50 cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-2xl text-muted-foreground">
                        {track.lang}
                      </span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        Soon
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{track.description}</p>
                    <span className="text-xs text-muted-foreground/60 font-mono">{track.stats}</span>
                  </div>
                )
              )}
            </div>
          </div>
        </main>

        <footer className="border-t border-border px-6 py-5 text-center">
          <span className="text-xs text-muted-foreground font-mono">intentionalcode.com</span>
        </footer>
      </div>
    </>
  );
}
