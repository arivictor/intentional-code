import React, { useState, useEffect } from "react";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";
import TableOfContents from "@/components/layout/TableOfContents";
import ReadingProgressBar from "@/components/layout/ReadingProgressBar";
import FeedbackButtons from "@/components/content/FeedbackButtons";
import HighlightableContent from "@/components/content/HighlightableContent";
import { CheckCircle, Circle, Bookmark, Clock } from "lucide-react";
import { isPatternRead, markPatternRead, markPatternUnread } from "@/lib/readingProgress";
import { isBookmarked, toggleBookmark } from "@/lib/bookmarks";
import { getHighlights, addHighlight, removeHighlight } from "@/lib/highlights";

export const HEADING_ANCHOR_PLUGINS = [
  { type: "element", tagName: "path", properties: { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }, children: [] },
  { type: "element", tagName: "path", properties: { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }, children: [] },
];

export const AUTOLINK_OPTIONS = {
  behavior: "prepend",
  properties: { className: ["heading-anchor"], ariaHidden: true, tabIndex: -1 },
  content: {
    type: "element",
    tagName: "svg",
    properties: {
      xmlns: "http://www.w3.org/2000/svg",
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    children: HEADING_ANCHOR_PLUGINS,
  },
};

export default function DetailPageShell({
  title,
  subtitle,
  slug,
  storageKey,
  navOrder,
  pathname,
  patternMap = {},
  readingTimeText = null,
  markdown = null,
  children,
}) {
  const [read, setRead] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [highlights, setHighlights] = useState([]);

  useEffect(() => {
    setRead(isPatternRead(storageKey));
    setBookmarked(isBookmarked(storageKey));
    setHighlights(getHighlights(storageKey));
  }, [storageKey]);

  const toggleRead = () => {
    if (read) { markPatternUnread(storageKey); setRead(false); }
    else { markPatternRead(storageKey); setRead(true); }
  };

  const handleBookmark = () => setBookmarked(toggleBookmark(storageKey));
  const handleAddHighlight = (hl) => setHighlights(addHighlight(storageKey, hl));
  const handleRemoveHighlight = (id) => setHighlights(removeHighlight(storageKey, id));

  return (
    <>
      <ReadingProgressBar />
      <div className="flex gap-8 max-w-5xl mx-auto px-6 py-12">
        <div className="flex-1 min-w-0">
          <Breadcrumbs pathname={pathname} patternMap={patternMap} />

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2">{title}</h1>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">{subtitle}</p>

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
            {readingTimeText && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {readingTimeText}
              </span>
            )}
            <button
              onClick={handleBookmark}
              title={bookmarked ? "Remove bookmark" : "Bookmark"}
              className={`flex items-center gap-1.5 text-sm transition-colors ${
                bookmarked ? "text-primary" : "text-muted-foreground hover:text-primary"
              }`}
            >
              <Bookmark className={`h-4 w-4 ${bookmarked ? "fill-current" : ""}`} />
              <span>{bookmarked ? "Saved" : "Save for later"}</span>
            </button>
          </div>

          <HighlightableContent highlights={highlights} onAdd={handleAddHighlight} onRemove={handleRemoveHighlight}>
            {children}
          </HighlightableContent>

          <FeedbackButtons contentTitle={title} contentSlug={slug ?? storageKey} />

          <PrevNextNav navOrder={navOrder} pathname={pathname} />
        </div>

        <TableOfContents markdown={markdown} title={title} />
      </div>
    </>
  );
}
