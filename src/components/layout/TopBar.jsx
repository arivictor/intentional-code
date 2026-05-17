import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Sun, Moon, Menu, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PATTERNS } from "@/lib/content/patterns";
import { GLOSSARY } from "@/lib/content/glossary";

const SEARCHABLE = [
  { title: "Home", path: "/", type: "page" },
  { title: "Philosophy", path: "/philosophy", type: "page" },
  { title: "SOLID Principles", path: "/philosophy/solid", type: "page" },
  { title: "Test-Driven Development", path: "/philosophy/tdd", type: "page" },
  { title: "Pattern Catalog", path: "/patterns", type: "page" },
  { title: "Creational Patterns", path: "/patterns/creational", type: "category" },
  { title: "Structural Patterns", path: "/patterns/structural", type: "category" },
  { title: "Behavioral Patterns", path: "/patterns/behavioral", type: "category" },
  ...PATTERNS.map((p) => ({
    title: p.title,
    path: `/patterns/${p.category}/${p.slug}`,
    type: "pattern",
    subtitle: p.intent,
  })),
  { title: "Glossary", path: "/glossary", type: "page" },
  ...GLOSSARY.map((g) => ({
    title: g.term,
    path: "/glossary",
    type: "glossary",
    subtitle: g.definition.slice(0, 80) + "…",
  })),
];

export default function TopBar({ theme, onToggleTheme, onToggleSidebar }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = query.length >= 2
    ? SEARCHABLE.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 8)
    : [];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <Link to="/" className="flex items-center gap-2 font-semibold text-foreground shrink-0">
          <span className="text-primary font-mono text-lg font-bold">Go</span>
          <span className="hidden sm:inline text-sm tracking-tight">Intentional Architecture</span>
        </Link>

        <div className="flex-1" />

        <div className="relative">
          {searchOpen ? (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Input
                  autoFocus
                  placeholder="Search patterns, concepts…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-48 sm:w-72 h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearchOpen(false);
                      setQuery("");
                    }
                  }}
                />
                {results.length > 0 && (
                  <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-80 overflow-auto z-50">
                    {results.map((r, i) => (
                      <Link
                        key={i}
                        to={r.path}
                        className="block px-3 py-2 hover:bg-accent text-sm transition-colors"
                        onClick={() => { setSearchOpen(false); setQuery(""); }}
                      >
                        <div className="font-medium text-foreground">{r.title}</div>
                        {r.subtitle && (
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.subtitle}</div>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSearchOpen(false); setQuery(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSearchOpen(true)} aria-label="Search">
              <Search className="h-4 w-4" />
            </Button>
          )}
        </div>

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleTheme} aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}