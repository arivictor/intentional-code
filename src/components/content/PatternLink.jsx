import React from "react";
import { Link } from "react-router-dom";
import { getPattern } from "@/lib/content/patterns";
import { ArrowRight } from "lucide-react";

export default function PatternLink({ slug, description }) {
  const pattern = getPattern(slug);
  if (!pattern) return null;

  return (
    <Link
      to={`/patterns/${pattern.category}/${pattern.slug}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-primary/10 transition-colors border border-border"
    >
      {pattern.title}
      {description && (
        <span className="text-muted-foreground font-normal"> — {description}</span>
      )}
    </Link>
  );
}