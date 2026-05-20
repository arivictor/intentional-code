import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, BookOpen, Lightbulb, Box, Puzzle, Workflow, Building2, Bookmark } from "lucide-react";

const CATEGORY_ICONS = { creational: Box, structural: Puzzle, behavioral: Workflow, architectural: Building2 };

function SidebarSection({ title, icon: Icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent/50"
        aria-expanded={open}
      >
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && <div className="ml-2 mt-0.5">{children}</div>}
    </div>
  );
}

function SidebarLink({ href, children, active }) {
  return (
    <a
      href={href}
      className={`block px-3 py-1 text-[13px] rounded-md transition-colors truncate ${
        active
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      }`}
    >
      {children}
    </a>
  );
}

export default function Sidebar({ navData, pathname }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    document.addEventListener('sidebar-toggle', handler);
    return () => document.removeEventListener('sidebar-toggle', handler);
  }, []);

  const nav = (
    <nav className="py-4 px-2 overflow-y-auto h-full scrollbar-thin" aria-label="Site navigation">
      <div className="mb-4">
        <SidebarLink href="/go" active={pathname === "/go"}>
          <span className="flex items-center gap-2"><BookOpen className="h-3.5 w-3.5" /> Home</span>
        </SidebarLink>
      </div>

      <SidebarSection title="Philosophy" icon={Lightbulb} defaultOpen={pathname.startsWith("/go/philosophy")}>
        <SidebarLink href="/go/philosophy" active={pathname === "/go/philosophy"}>Overview</SidebarLink>
        <SidebarLink href="/go/philosophy/solid" active={pathname === "/go/philosophy/solid"}>SOLID Principles</SidebarLink>
        <SidebarLink href="/go/philosophy/tdd" active={pathname === "/go/philosophy/tdd"}>Test-Driven Development</SidebarLink>
      </SidebarSection>

      {(navData ?? []).map((cat) => {
        const Icon = CATEGORY_ICONS[cat.slug] ?? BookOpen;
        const isActive = pathname.includes(`/go/patterns/${cat.slug}`);
        return (
          <SidebarSection key={cat.slug} title={cat.title} icon={Icon} defaultOpen={isActive}>
            <SidebarLink href={`/go/patterns/${cat.slug}`} active={pathname === `/go/patterns/${cat.slug}`}>
              Overview
            </SidebarLink>
            {cat.patterns.map((p) => (
              <SidebarLink
                key={p.slug}
                href={`/go/patterns/${p.category}/${p.slug}`}
                active={pathname === `/go/patterns/${p.category}/${p.slug}`}
              >
                {p.title}
              </SidebarLink>
            ))}
          </SidebarSection>
        );
      })}

      <div className="mt-3 space-y-0.5">
        <SidebarLink href="/go/saved" active={pathname === "/go/saved"}>
          <span className="flex items-center gap-2"><Bookmark className="h-3.5 w-3.5" /> Saved Content</span>
        </SidebarLink>
      </div>
    </nav>
  );

  return (
    <>
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-border bg-sidebar h-[calc(100vh-3.5rem)] sticky top-14 overflow-hidden">
        {nav}
      </aside>

      {open && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />
          <aside className="fixed left-0 top-0 z-50 w-72 h-full bg-sidebar border-r border-border lg:hidden shadow-xl">
            <div className="h-14 flex items-center px-4 border-b border-border">
              <span className="text-primary font-mono text-lg font-bold">Go</span>
              <span className="ml-2 text-sm font-semibold">Intentional Code</span>
            </div>
            {nav}
          </aside>
        </>
      )}
    </>
  );
}
