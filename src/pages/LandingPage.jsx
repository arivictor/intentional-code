import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { Sun, Moon } from "lucide-react";

const TRACKS = [
  {
    lang: "Go",
    slug: "go",
    accent: "#00adb5",
    description: "All 22 Gang-of-Four patterns and SOLID principles, implemented in idiomatic Go.",
    available: true,
  },
  {
    lang: "Python",
    slug: "python",
    accent: "#3b82f6",
    description: "Patterns in Python — leveraging duck typing, dataclasses, and the standard library.",
    available: false,
  },
  {
    lang: "Terraform",
    slug: "terraform",
    accent: "#7c3aed",
    description: "Infrastructure patterns — modules, abstractions, and composition in HCL.",
    available: false,
  },
];

export default function LandingPage() {
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 py-5 border-b border-border">
        <span className="font-mono font-bold text-lg text-primary">Intentional Code</span>
        <button onClick={toggle} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded" aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground text-center mb-4">
          Pick your language
        </h1>
        <p className="text-lg text-muted-foreground text-center max-w-xl mb-14">
          Software design patterns and principles, written for the language you actually use.
        </p>

        <div className="grid gap-4 sm:grid-cols-3 w-full max-w-3xl">
          {TRACKS.map((track) =>
            track.available ? (
              <Link
                key={track.slug}
                to={`/${track.slug}`}
                className="group relative flex flex-col gap-3 p-6 rounded-xl border border-border hover:border-primary/50 bg-card hover:bg-accent/30 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="font-mono font-bold text-2xl"
                    style={{ color: track.accent }}
                  >
                    {track.lang}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{track.description}</p>
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
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}
