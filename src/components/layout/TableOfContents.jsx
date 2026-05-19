import React, { useState, useEffect } from "react";

const SECTION_IDS = [
  { id: "problem", label: "Problem" },
  { id: "solution", label: "Solution" },
  { id: "when-to-use", label: "When to Use" },
  { id: "when-not-to-use", label: "When Not to Use" },
  { id: "advantages", label: "Advantages" },
  { id: "disadvantages", label: "Disadvantages" },
  { id: "related-patterns", label: "Related Patterns" },
];

export default function TableOfContents() {
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    SECTION_IDS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <aside className="hidden xl:block w-48 shrink-0 sticky top-20 h-fit" aria-label="Table of contents">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        On this page
      </div>
      <nav className="space-y-1 border-l border-border">
        {SECTION_IDS.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`block pl-3 py-0.5 text-[13px] transition-colors border-l-2 -ml-px ${
              activeId === id
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </a>
        ))}
      </nav>
    </aside>
  );
}