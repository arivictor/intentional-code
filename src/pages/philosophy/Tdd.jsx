import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";
import MarkdownCode from "@/components/content/MarkdownCode";
import PageMeta from "@/components/PageMeta";
import ReadingProgressBar from "@/components/layout/ReadingProgressBar";
import { CheckCircle, Circle, Bookmark, Clock } from "lucide-react";
import { isPatternRead, markPatternRead, markPatternUnread } from "@/lib/readingProgress";
import { isBookmarked, toggleBookmark } from "@/lib/bookmarks";
import HighlightableContent from "@/components/content/HighlightableContent";
import { getHighlights, addHighlight, removeHighlight } from "@/lib/highlights";

const SLUG = "tdd";
const TITLE = "Test-Driven Development";
const DESCRIPTION = "TDD in Go: the red/green/refactor loop, table-driven tests, implicit interface fakes, and how design pressure produces patterns.";

function readingTime(md) {
  if (!md) return null;
  const minutes = Math.max(1, Math.round(md.split(/\s+/).filter(Boolean).length / 200));
  return `${minutes} min read`;
}

export default function Tdd() {
  const [markdown, setMarkdown] = useState("");
  const [read, setRead] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [highlights, setHighlights] = useState([]);

  useEffect(() => {
    setRead(isPatternRead(SLUG));
    setBookmarked(isBookmarked(SLUG));
    setHighlights(getHighlights(SLUG));
  }, []);

  useEffect(() => {
    import("../../content/philosophy/tdd.md?raw")
      .then((m) => setMarkdown(m.default))
      .catch(() => setMarkdown(""));
  }, []);

  const toggleRead = () => {
    if (read) { markPatternUnread(SLUG); setRead(false); }
    else { markPatternRead(SLUG); setRead(true); }
  };

  const handleBookmark = () => setBookmarked(toggleBookmark(SLUG));
  const handleAddHighlight = (hl) => setHighlights(addHighlight(SLUG, hl));
  const handleRemoveHighlight = (id) => setHighlights(removeHighlight(SLUG, id));

  return (
    <>
      <PageMeta title={TITLE} description={DESCRIPTION} />
      <ReadingProgressBar />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Breadcrumbs />

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2">{TITLE}</h1>
        <p className="text-lg text-muted-foreground leading-relaxed mb-4">{DESCRIPTION}</p>

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
              {readingTime(markdown)}
            </span>
          )}
          <button
            onClick={handleBookmark}
            title={bookmarked ? "Remove bookmark" : "Bookmark this page"}
            className={`flex items-center gap-1.5 text-sm transition-colors ${
              bookmarked ? "text-primary" : "text-muted-foreground hover:text-primary"
            }`}
          >
            <Bookmark className={`h-4 w-4 ${bookmarked ? "fill-current" : ""}`} />
            <span>{bookmarked ? "Saved" : "Save for later"}</span>
          </button>
        </div>

        <HighlightableContent highlights={highlights} onAdd={handleAddHighlight} onRemove={handleRemoveHighlight}>
          <div className="prose-pattern">
            <ReactMarkdown
              rehypePlugins={[rehypeSlug]}
              components={{ code: MarkdownCode, h1: () => null }}
            >
              {markdown}
            </ReactMarkdown>
          </div>
        </HighlightableContent>
        <PrevNextNav />
      </div>
    </>
  );
}
