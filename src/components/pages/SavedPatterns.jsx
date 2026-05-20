import React, { useState, useEffect } from "react";
import { Bookmark, ArrowRight, Highlighter, X, FileCode2, Copy, Download, Check } from "lucide-react";
import { getBookmarks, removeBookmark } from "@/lib/bookmarks";
import { HIGHLIGHT_COLORS } from "@/lib/highlight-colors";
import { getAllHighlights, removeHighlight } from "@/lib/highlights";
import { generateClaudeMd } from "@/lib/generateClaudeMd";
import Breadcrumbs from "@/components/layout/Breadcrumbs";

export default function SavedPatterns({
  allContent,
  allPatterns = [],
  navOrder,
  pathname,
  generatorLanguageLabel = "Go",
}) {
  const [slugs, setSlugs] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [mode, setMode] = useState("all"); // 'saved' | 'all'
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    const bookmarks = getBookmarks();
    setSlugs(bookmarks);
    setHighlights(getAllHighlights());
    // Default to saved mode if there are any bookmarks
    if (bookmarks.length > 0) setMode("saved");
  }, []);

  const contentMap = Object.fromEntries(allContent.map((c) => [c.slug, c]));

  const handleRemoveBookmark = (slug) => {
    removeBookmark(slug);
    setSlugs((prev) => {
      const next = prev.filter((s) => s !== slug);
      if (next.length === 0) setMode("all");
      return next;
    });
  };

  const handleRemoveHighlight = (slug, id) => {
    removeHighlight(slug, id);
    setHighlights((prev) => prev.filter((h) => !(h.slug === slug && h.id === id)));
  };

  const saved = slugs.map((s) => contentMap[s]).filter(Boolean);

  // Generator
  const claudeMd = generateClaudeMd(allPatterns, {
    includeAll: mode === "all",
    savedSlugs: slugs,
  });

  const savedPatternCount = allPatterns.filter((p) => slugs.includes(p.slug)).length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(claudeMd);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
      setCopied(false);
      setTimeout(() => setCopyFailed(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([claudeMd], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "CLAUDE.md";
    a.click();
    URL.revokeObjectURL(url);
  };

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
                key={item.slug}
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
                  onClick={() => handleRemoveBookmark(item.slug)}
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

      {allPatterns.length > 0 && (
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-primary" />
            Generate CLAUDE.md
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Drop this file in your {generatorLanguageLabel} project root. Claude Code will use it as context when helping with architecture decisions.
          </p>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode("saved")}
              disabled={savedPatternCount === 0}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                mode === "saved"
                  ? "bg-primary text-primary-foreground border-primary"
                  : savedPatternCount === 0
                    ? "border-border text-muted-foreground/40 cursor-not-allowed"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              Saved patterns only {savedPatternCount > 0 && `(${savedPatternCount})`}
            </button>
            <button
              onClick={() => setMode("all")}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                mode === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              All patterns ({allPatterns.length})
            </button>
          </div>

          {/* Preview */}
          <div className="relative mb-3">
            <textarea
              readOnly
              value={claudeMd}
              rows={14}
              className="w-full rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs font-mono text-foreground/80 leading-relaxed resize-none focus:outline-none scrollbar-thin"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md border border-border bg-card hover:border-primary/50 hover:bg-accent/40 transition-all text-foreground"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-primary" />
                  Copied!
                </>
              ) : copyFailed ? (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy failed
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy to clipboard
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download CLAUDE.md
            </button>
          </div>
        </section>
      )}

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
