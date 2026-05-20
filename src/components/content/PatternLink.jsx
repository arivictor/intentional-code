import React, { useContext } from "react";
import { PatternsContext } from "@/components/pages/PatternPage";

export default function PatternLink({ slug, title, description }) {
  const { allPatterns = [], basePath = '/go' } = useContext(PatternsContext) ?? {};
  const pattern = slug
    ? allPatterns.find((p) => p.slug === slug)
    : allPatterns.find((p) => p.title.toLowerCase() === title?.toLowerCase().trim());

  if (!pattern) return null;

  return (
    <div className="flex items-start gap-2 flex-wrap">
      <a
        href={`${basePath}/patterns/${pattern.category}/${pattern.slug}`}
        className="inline-flex items-center px-2.5 py-1 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-primary/10 transition-colors border border-border shrink-0"
      >
        {pattern.title}
      </a>
      {description && (
        <span className="text-sm text-muted-foreground mt-1">{description}</span>
      )}
    </div>
  );
}
