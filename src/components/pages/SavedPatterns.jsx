import React, { useState, useEffect } from "react";
import { Bookmark, ArrowRight, Highlighter, X } from "lucide-react";
import { getBookmarks, removeBookmark } from "@/lib/bookmarks";
import { HIGHLIGHT_COLORS } from "@/lib/highlight-colors";
import { getAllHighlights, removeHighlight } from "@/lib/highlights";
import Breadcrumbs from "@/components/layout/Breadcrumbs";

export default function SavedPatterns({
  allContent,
  navOrder,
  pathname,
}) {
  const [slugs, setSlugs] = useState([]);
  const [highlights, setHighlights] = useState([]);

  useEffect(() => {
    setSlugs(getBookmarks());
    setHighlights(getAllHighlights());
  }, []);

  const contentMap = Object.fromEntries(allContent.map((c) => [c.storageKey, c]));

  const handleRemoveBookmark = (slug) => {
    removeBookmark(slug);
    setSlugs((prev) => prev.filter((s) => s !== slug));
  };

  const handleRemoveHighlight = (slug, id) => {
    removeHighlight(slug, id);
    setHighlights((prev) => prev.filter((h) => !(h.slug === slug && h.id === id)));
  };

  const saved = slugs.map((s) => contentMap[s]).filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Breadcrumbs pathname={pathname} patternMap={{}} />
      <div className="flex items-center gap-3 mb-2">
        <Bookmark className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Saved Content</h1>
      </div>
      <p className="text-muted-foreground mb-10">Your bookmarked patterns and highlighted notes.</p>

      <section className="mb-12">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-primary" />
          Saved Pages
        </h2>
        {saved.length === 0 ? (
          <div className="text-center py-10 rounded-lg border border-dashed border-border">
            <p className="text-muted-foreground text-sm">No saved content yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Click "Save for later" on any page to save it here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {saved.map((item) => (
               <div
                key={item.storageKey}
                className="group flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary/30 bg-card transition-all"
              >
                <div className="flex-1 min-w-0">
                  <a href={item.url} className="font-medium text-foreground group-hover:text-primary transition-colors">
                    {item.title}
                  </a>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                </div>
                <a href={item.url} className="text-muted-foreground hover:text-primary transition-colors shrink-0">
                  <ArrowRight className="h-4 w-4" />
                </a>
                <button
                  onClick={() => handleRemoveBookmark(item.storageKey)}
                  className="text-primary hover:text-destructive transition-colors shrink-0"
                  title="Remove bookmark"
                >
                  <Bookmark className="h-4 w-4 fill-current" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Highlighter className="h-4 w-4 text-primary" />
          Your Highlights
        </h2>
        {highlights.length === 0 ? (
          <div className="text-center py-10 rounded-lg border border-dashed border-border">
            <p className="text-muted-foreground text-sm">No highlights yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Select text on any pattern page to highlight it.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {highlights.map((h) => {
              const source = contentMap[h.slug];
              return (
                <div key={`${h.slug}-${h.id}`} className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card">
                  <div
                    className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: HIGHLIGHT_COLORS[h.color] || HIGHLIGHT_COLORS.yellow }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground/85 leading-relaxed">"{h.text}"</p>
                    {source && (
                      <a href={source.url} className="text-xs text-primary hover:underline mt-1 inline-block">
                        {source.title}
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveHighlight(h.slug, h.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5"
                    title="Remove highlight"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
