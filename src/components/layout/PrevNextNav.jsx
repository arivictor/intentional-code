import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function PrevNextNav({ navOrder = [], pathname }) {
  const idx = navOrder.findIndex((n) => n.path === pathname);
  const prev = idx > 0 ? navOrder[idx - 1] : null;
  const next = idx < navOrder.length - 1 ? navOrder[idx + 1] : null;

  if (!prev && !next) return null;

  return (
    <nav aria-label="Previous and next pages" className="flex items-stretch gap-4 mt-16 pt-8 border-t border-border">
      {prev ? (
        <a
          href={prev.path}
          className="flex-1 group flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/50 transition-all"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
          <div className="text-right flex-1">
            <div className="text-xs text-muted-foreground">Previous</div>
            <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{prev.title}</div>
          </div>
        </a>
      ) : (
        <div className="flex-1" />
      )}
      {next ? (
        <a
          href={next.path}
          className="flex-1 group flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/50 transition-all"
        >
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Next</div>
            <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{next.title}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </a>
      ) : (
        <div className="flex-1" />
      )}
    </nav>
  );
}
