import React from "react";
import { Link } from "react-router-dom";
import { getPattern, getPatternByTitle } from "@/lib/content/patterns";

export default function PatternLink({ slug, title, description }) {
  const pattern = slug ? getPattern(slug) : getPatternByTitle(title);
  if (!pattern) return null;

  return (
    <div className="flex items-start gap-2 flex-wrap">
      <Link
        to={`/go/patterns/${pattern.category}/${pattern.slug}`}
        className="inline-flex items-center px-2.5 py-1 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-primary/10 transition-colors border border-border shrink-0"
      >
        {pattern.title}
      </Link>
      {description && (
        <span className="text-sm text-muted-foreground mt-1">{description}</span>
      )}
    </div>
  );
}
