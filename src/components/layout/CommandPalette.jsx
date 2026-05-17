import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FileText, Layers, BookOpen, BookText, Hash } from "lucide-react";
import { PATTERNS } from "@/lib/content/patterns";
import { GLOSSARY } from "@/lib/content/glossary";

const TYPE_CONFIG = {
  page:     { label: "Page",     icon: FileText, color: "text-blue-500" },
  category: { label: "Category", icon: Layers,   color: "text-violet-500" },
  pattern:  { label: "Pattern",  icon: BookOpen, color: "text-primary" },
  glossary: { label: "Glossary", icon: Hash,     color: "text-amber-500" },
};

const SEARCHABLE = [
  { title: "Philosophy", path: "/philosophy", type: "page" },
  { title: "SOLID Principles", path: "/philosophy/solid", type: "page" },
  { title: "Test-Driven Development", path: "/philosophy/tdd", type: "page" },
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
    subtitle: g.definition?.slice(0, 90) + "…",
  })),
];

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  const results = query.trim().length >= 1
    ? SEARCHABLE.filter((item) =>
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 10)
    : SEARCHABLE.filter((i) => i.type === "pattern").slice(0, 8);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleSelect = useCallback((item) => {
    navigate(item.path);
    onClose();
  }, [navigate, onClose]);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (results[activeIndex]) handleSelect(results[activeIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl mx-4 rounded-xl border border-border bg-popover shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search patterns, concepts, glossary…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border font-mono">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-96 overflow-y-auto py-1">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No results for "{query}"</p>
          ) : (
            results.map((item, idx) => {
              const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.page;
              const Icon = cfg.icon;
              return (
                <button
                  key={idx}
                  data-idx={idx}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    idx === activeIndex ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{item.title}</div>
                    {item.subtitle && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</div>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                    {cfg.label}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-xs text-muted-foreground">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}