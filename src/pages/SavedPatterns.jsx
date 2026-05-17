import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bookmark, ArrowRight } from "lucide-react";
import { getBookmarks, removeBookmark } from "@/lib/bookmarks";
import { getPattern } from "@/lib/content/patterns";
import Breadcrumbs from "@/components/layout/Breadcrumbs";

export default function SavedPatterns() {
  const [slugs, setSlugs] = useState([]);

  useEffect(() => {
    setSlugs(getBookmarks());
  }, []);

  const handleRemove = (slug) => {
    removeBookmark(slug);
    setSlugs((prev) => prev.filter((s) => s !== slug));
  };

  const patterns = slugs.map((s) => getPattern(s)).filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Breadcrumbs />
      <div className="flex items-center gap-3 mb-2">
        <Bookmark className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Saved Patterns</h1>
      </div>
      <p className="text-muted-foreground mb-8">Patterns you've bookmarked for quick reference.</p>

      {patterns.length === 0 ? (
        <div className="text-center py-16 rounded-lg border border-dashed border-border">
          <Bookmark className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No saved patterns yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Click the bookmark icon on any pattern page to save it here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {patterns.map((p) => (
            <div
              key={p.slug}
              className="group flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary/30 bg-card transition-all"
            >
              <div className="flex-1 min-w-0">
                <Link
                  to={`/patterns/${p.category}/${p.slug}`}
                  className="font-medium text-foreground group-hover:text-primary transition-colors"
                >
                  {p.title}
                </Link>
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{p.intent}</p>
              </div>
              <Link
                to={`/patterns/${p.category}/${p.slug}`}
                className="text-muted-foreground hover:text-primary transition-colors shrink-0"
              >
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                onClick={() => handleRemove(p.slug)}
                className="text-primary hover:text-destructive transition-colors shrink-0"
                title="Remove bookmark"
              >
                <Bookmark className="h-4 w-4 fill-current" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}