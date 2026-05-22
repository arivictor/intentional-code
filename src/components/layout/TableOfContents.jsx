import React, { useState, useEffect } from "react";

export default function TableOfContents() {
  const [activeId, setActiveId] = useState("");
  const [sections, setSections] = useState([]);

  useEffect(() => {
    const headings = Array.from(
      document.querySelectorAll(".prose-pattern h2, .prose-pattern h3")
    ).filter((el) => el.id);
    setSections(headings.map((el) => ({ id: el.id, label: el.textContent, depth: el.tagName })));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-64px 0px -60% 0px", threshold: 0 }
    );

    headings.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  if (sections.length === 0) return null;

  return (
    <aside className="hidden xl:block w-56 shrink-0 sticky top-16 h-fit" aria-label="In this article">
      <div className="text-xs font-bold uppercase tracking-wider text-foreground mb-3">
        In this article
      </div>
      <nav className="border-l border-border">
        {sections.map(({ id, label, depth }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`block py-1 text-[13px] leading-snug transition-colors border-l-2 -ml-px ${
              depth === "H3" ? "pl-5" : "pl-3"
            } ${
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