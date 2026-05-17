import React from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getNavNeighbors } from "@/lib/content/patterns";

export default function PrevNextNav() {
  const location = useLocation();
  const { prev, next } = getNavNeighbors(location.pathname);

  if (!prev && !next) return null;

  return (
    <nav aria-label="Previous and next pages" className="flex items-stretch gap-4 mt-16 pt-8 border-t border-border">
      {prev ? (
        <Link
          to={prev.path}
          className="flex-1 group flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/50 transition-all"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
          <div className="text-right flex-1">
            <div className="text-xs text-muted-foreground">Previous</div>
            <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{prev.title}</div>
          </div>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
      {next ? (
        <Link
          to={next.path}
          className="flex-1 group flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/50 transition-all"
        >
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Next</div>
            <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{next.title}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </Link>
      ) : (
        <div className="flex-1" />
      )}
    </nav>
  );
}