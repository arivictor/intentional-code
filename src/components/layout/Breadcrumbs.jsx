import React from "react";
import { ChevronRight } from "lucide-react";

const STATIC_TITLES = {
  go: "Go",
  philosophy: "Philosophy",
  solid: "SOLID Principles",
  tdd: "Test-Driven Development",
  patterns: "Pattern Catalog",
  creational: "Creational",
  structural: "Structural",
  behavioral: "Behavioral",
  architectural: "Architectural",
  saved: "Saved",
};

export default function Breadcrumbs({ pathname = "", patternMap = {} }) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const crumbs = [{ label: "Home", path: "/" }];
  let currentPath = "";

  segments.forEach((seg) => {
    currentPath += `/${seg}`;
    const label = patternMap[seg]
      || STATIC_TITLES[seg]
      || seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({ label, path: currentPath });
  });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground mb-6 flex-wrap">
      {crumbs.map((crumb, i) => (
        <React.Fragment key={crumb.path}>
          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
          {i === crumbs.length - 1 ? (
            <span className="text-foreground font-medium" aria-current="page">{crumb.label}</span>
          ) : (
            <a href={crumb.path} className="hover:text-foreground transition-colors">{crumb.label}</a>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
