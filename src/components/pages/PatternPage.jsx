import React, { useState, useEffect, createContext } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import MarkdownCode from "@/components/content/MarkdownCode";
import ComparisonTable from "@/components/content/ComparisonTable";
import PatternLink from "@/components/content/PatternLink";
import { isPatternRead, markPatternRead, markPatternUnread } from "@/lib/readingProgress";
import { CheckCircle, Circle, Bookmark, Clock, AlertTriangle } from "lucide-react";
import { isBookmarked, toggleBookmark } from "@/lib/bookmarks";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";
import TableOfContents from "@/components/layout/TableOfContents";
import HighlightableContent from "@/components/content/HighlightableContent";
import { getHighlights, addHighlight, removeHighlight } from "@/lib/highlights";
import ReadingProgressBar from "@/components/layout/ReadingProgressBar";

export const PatternsContext = createContext([]);

function readingTimeFromMarkdown(md) {
  if (!md) return null;
  const words = md.split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

function parseList(block) {
  return block.trim().split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim());
}

function parseRelated(block) {
  return block.trim().split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => {
      const inner = l.slice(2).trim();
      const match = inner.match(/^\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/);
      if (match) return { title: match[1], description: match[2] };
      return { title: inner.replace(/\*\*/g, ""), description: "" };
    });
}

function splitMarkdown(md) {
  const advMarker = "\n## Advantages\n";
  const disMarker = "\n## Disadvantages\n";
  const relMarker = "\n## Related Patterns\n";
  const advIdx = md.indexOf(advMarker);
  const disIdx = md.indexOf(disMarker);
  const relIdx = md.indexOf(relMarker);
  if (advIdx === -1 || disIdx === -1) return null;

  const before = md.slice(0, advIdx);
  const advContent = md.slice(advIdx + advMarker.length, disIdx);
  const disEnd = relIdx !== -1 ? relIdx : md.length;
  const disContent = md.slice(disIdx + disMarker.length, disEnd);
  const relatedPatterns = relIdx !== -1 ? parseRelated(md.slice(relIdx + relMarker.length)) : [];

  return { before, advantages: parseList(advContent), disadvantages: parseList(disContent), relatedPatterns };
}

export default function PatternPage({ pattern, markdown, allPatterns, navOrder, pathname, basePath = "/go" }) {
  const [read, setRead] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [highlights, setHighlights] = useState([]);
  const { storageKey } = pattern;

  useEffect(() => {
    setRead(isPatternRead(storageKey));
    setBookmarked(isBookmarked(storageKey));
    setHighlights(getHighlights(storageKey));
  }, [storageKey]);

  const handleAddHighlight = (hl) => setHighlights(addHighlight(storageKey, hl));
  const handleRemoveHighlight = (id) => setHighlights(removeHighlight(storageKey, id));
  const handleBookmark = () => setBookmarked(toggleBookmark(storageKey));
  const toggleRead = () => {
    if (read) { markPatternUnread(storageKey); setRead(false); }
    else { markPatternRead(storageKey); setRead(true); }
  };

  const patternMap = Object.fromEntries((allPatterns ?? []).map((p) => [p.slug, p.title]));
  const mdProps = {
    rehypePlugins: [rehypeSlug],
    components: {
      code: MarkdownCode,
      h1: () => null,
      h2: ({ children, ...props }) => {
        const text = Array.isArray(children) ? children.join("") : String(children ?? "");
        if (text === "When Not to Use") {
          return (
            <h2 {...props} className="flex items-center gap-2 text-xl font-semibold mt-10 mb-3 text-foreground border-l-[3px] border-amber-500 pl-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              {children}
            </h2>
          );
        }
        return <h2 {...props}>{children}</h2>;
      },
    },
  };

  return (
    <PatternsContext.Provider value={{ allPatterns: allPatterns ?? [], basePath }}>
      <ReadingProgressBar />
      <div className="flex gap-8 max-w-5xl mx-auto px-6 py-12">
        <div className="flex-1 min-w-0">
          <Breadcrumbs pathname={pathname} patternMap={patternMap} />

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2">{pattern.title}</h1>
          <p className="text-lg text-muted-foreground leading-relaxed mb-4">{pattern.intent}</p>

          <div className="flex items-center gap-3 mb-8">
            <button
              onClick={toggleRead}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition-all ${
                read
                  ? "bg-primary/10 border-primary/30 text-primary font-medium"
                  : "border-border text-muted-foreground hover:border-primary/30 hover:text-primary"
              }`}
            >
              {read ? <CheckCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              {read ? "Read" : "Mark as read"}
            </button>
            {markdown && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {readingTimeFromMarkdown(markdown)}
              </span>
            )}
            <button
              onClick={handleBookmark}
              title={bookmarked ? "Remove bookmark" : "Bookmark this pattern"}
              className={`flex items-center gap-1.5 text-sm transition-colors ${
                bookmarked ? "text-primary" : "text-muted-foreground hover:text-primary"
              }`}
            >
              <Bookmark className={`h-4 w-4 ${bookmarked ? "fill-current" : ""}`} />
              <span>{bookmarked ? "Saved" : "Save for later"}</span>
            </button>
          </div>

          <HighlightableContent highlights={highlights} onAdd={handleAddHighlight} onRemove={handleRemoveHighlight}>
            {(() => {
              const sections = splitMarkdown(markdown);
              if (!sections) {
                return (
                  <div className="prose-pattern">
                    <ReactMarkdown {...mdProps}>{markdown}</ReactMarkdown>
                  </div>
                );
              }
              return (
                <>
                  <div className="prose-pattern">
                    <ReactMarkdown {...mdProps}>{sections.before}</ReactMarkdown>
                  </div>
                  <ComparisonTable advantages={sections.advantages} disadvantages={sections.disadvantages} />
                  {sections.relatedPatterns.length > 0 && (
                    <section id="related-patterns" className="mt-12">
                      <h2 className="text-2xl font-semibold mb-4 text-foreground">Related Patterns</h2>
                      <div className="space-y-3">
                        {sections.relatedPatterns.map((rp, i) => (
                          <PatternLink key={i} title={rp.title} description={rp.description} />
                        ))}
                      </div>
                    </section>
                  )}
                </>
              );
            })()}
          </HighlightableContent>

          <PrevNextNav navOrder={navOrder} pathname={pathname} />
        </div>

        <TableOfContents />
      </div>
    </PatternsContext.Provider>
  );
}
