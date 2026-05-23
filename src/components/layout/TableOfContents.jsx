import React, { useState, useEffect } from "react";
import { Copy, ChevronDown, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TableOfContents({ markdown = null, title = "" }) {
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

  if (sections.length === 0 && !markdown) return null;

  const handleCopyMarkdown = () => {
    if (markdown) navigator.clipboard.writeText(markdown);
  };

  const handleOpenInClaude = () => {
    const prompt = encodeURIComponent(`Explain this concept to me: ${window.location.href}`);
    window.open(`claude://claude.ai/new?q=${prompt}`, "_self");
  };

  const handleOpenInChatGPT = () => {
    const prompt = encodeURIComponent(`Explain this concept to me: ${window.location.href}`);
    window.open(`https://chatgpt.com/?q=${prompt}`, "_blank", "noopener,noreferrer");
  };

  return (
    <aside className="hidden xl:block w-56 shrink-0 sticky top-16 h-fit" aria-label="In this article">
      {sections.length > 0 && (
        <>
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
        </>
      )}

      {markdown && (
        <>
          {sections.length > 0 && <div className="my-4 border-t border-border" />}
          <div className="flex flex-col gap-1">
            <button
              onClick={handleCopyMarkdown}
              className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors py-1 text-left"
            >
              <Copy className="h-3.5 w-3.5 shrink-0" />
              Copy Markdown
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors py-1 text-left w-full">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 text-left">Explain with AI</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="bottom">
                <DropdownMenuItem onSelect={handleOpenInClaude} className="cursor-pointer">
                  Open in Claude
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleOpenInChatGPT} className="cursor-pointer">
                  Open in ChatGPT
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}
    </aside>
  );
}
