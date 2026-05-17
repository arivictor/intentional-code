import React, { useRef, useState, useEffect, useCallback } from "react";
import { Highlighter, X } from "lucide-react";

/**
 * Wraps content and lets users highlight selected text.
 * Highlights are stored as { id, text, color } and rendered via a
 * custom ::selection-style overlay using <mark> injection into text nodes.
 *
 * Strategy: on mouseup, read window.getSelection(), record the selected
 * text string and the paragraph/node index so we can re-apply it on mount.
 * We match by text content (simple, reliable for static content).
 */

const COLORS = [
  { id: "yellow", label: "Yellow", bg: "bg-yellow-200/70 dark:bg-yellow-500/30", mark: "yellow" },
  { id: "green",  label: "Green",  bg: "bg-green-200/70  dark:bg-green-500/30",  mark: "green"  },
  { id: "blue",   label: "Blue",   bg: "bg-blue-200/70   dark:bg-blue-500/30",   mark: "blue"   },
  { id: "pink",   label: "Pink",   bg: "bg-pink-200/70   dark:bg-pink-500/30",   mark: "pink"   },
];

const COLOR_STYLES = {
  yellow: "background-color: rgba(253,224,71,0.45)",
  green:  "background-color: rgba(134,239,172,0.45)",
  blue:   "background-color: rgba(147,197,253,0.45)",
  pink:   "background-color: rgba(249,168,212,0.45)",
};

function applyHighlightsToDOM(container, highlights) {
  if (!container) return;

  // Reset first — remove existing marks
  container.querySelectorAll("mark[data-hl]").forEach((mark) => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });

  // Re-apply each highlight by searching text nodes
  highlights.forEach(({ id, text, color }) => {
    if (!text) return;
    findAndWrapText(container, text, id, color);
  });
}

function findAndWrapText(container, searchText, id, color) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    // Skip inside already-wrapped marks to avoid double-wrapping
    if (node.parentElement?.closest("mark[data-hl]")) continue;
    nodes.push(node);
  }

  // Build a combined string with node boundaries tracked
  let combined = "";
  const offsets = [];
  nodes.forEach((n) => {
    offsets.push({ node: n, start: combined.length });
    combined += n.textContent;
  });

  const idx = combined.toLowerCase().indexOf(searchText.toLowerCase());
  if (idx === -1) return;

  const end = idx + searchText.length;

  // Find which nodes overlap [idx, end)
  const involved = offsets.filter(
    (o) => o.start < end && o.start + o.node.textContent.length > idx
  );
  if (!involved.length) return;

  involved.forEach(({ node: n, start: nStart }) => {
    const localStart = Math.max(0, idx - nStart);
    const localEnd = Math.min(n.textContent.length, end - nStart);
    if (localStart >= localEnd) return;

    const before = n.textContent.slice(0, localStart);
    const match  = n.textContent.slice(localStart, localEnd);
    const after  = n.textContent.slice(localEnd);

    const mark = document.createElement("mark");
    mark.dataset.hl = id;
    mark.style.cssText = `${COLOR_STYLES[color] || COLOR_STYLES.yellow}; border-radius:2px; padding:0 1px;`;
    mark.textContent = match;

    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    frag.appendChild(mark);
    if (after)  frag.appendChild(document.createTextNode(after));

    n.parentNode.replaceChild(frag, n);
  });
}

export default function HighlightableContent({ children, highlights, onAdd, onRemove }) {
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null); // { x, y, text }

  // Re-apply highlights whenever they change
  useEffect(() => {
    applyHighlightsToDOM(containerRef.current, highlights);
  }, [highlights, children]);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const text = sel.toString().trim();
    if (text.length < 3) return;

    // Ensure selection is inside our container
    if (!containerRef.current?.contains(sel.anchorNode)) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      text,
    });
  }, []);

  const handlePickColor = (color) => {
    if (!tooltip) return;
    onAdd({ id: Date.now().toString(), text: tooltip.text, color });
    window.getSelection()?.removeAllRanges();
    setTooltip(null);
  };

  const handleRemoveMark = useCallback((e) => {
    const mark = e.target.closest("mark[data-hl]");
    if (!mark) return;
    const id = mark.dataset.hl;
    onRemove(id);
  }, [onRemove]);

  // Dismiss tooltip on outside click
  useEffect(() => {
    const dismiss = (e) => {
      if (!e.target.closest("[data-highlight-tooltip]")) {
        setTooltip(null);
      }
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, []);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        onClick={handleRemoveMark}
        className="select-text"
      >
        {children}
      </div>

      {/* Color-picker tooltip */}
      {tooltip && (
        <div
          data-highlight-tooltip
          className="fixed z-50 flex items-center gap-1 p-1.5 rounded-lg border border-border bg-popover shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <Highlighter className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
          {COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => handlePickColor(c.id)}
              className={`w-5 h-5 rounded-full border border-border/50 ${c.bg} hover:scale-110 transition-transform`}
              title={c.label}
            />
          ))}
          <button
            onClick={() => setTooltip(null)}
            className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}