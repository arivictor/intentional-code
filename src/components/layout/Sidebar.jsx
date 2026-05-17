import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ChevronRight, BookOpen, Lightbulb, Box, Puzzle, Workflow, BookText } from "lucide-react";
import { PATTERNS, CATEGORY_ORDER, CATEGORIES, getPatternsByCategory } from "@/lib/content/patterns";

const CATEGORY_ICONS = {
  creational: Box,
  structural: Puzzle,
  behavioral: Workflow,
};

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

function SidebarLink({ to, children, active }) {
  return (
    <Link
      to={to}
      className={`block px-3 py-1 text-[13px] rounded-md transition-colors truncate ${
        active
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      }`}
    >
      {children}
    </Link>
  );
}

export default function Sidebar({ open, onClose }) {
  const location = useLocation();
  const currentPath = location.pathname;

  const content = (
    <nav className="py-4 px-2 overflow-y-auto h-full scrollbar-thin" aria-label="Site navigation">
      <div className="mb-4">
        <SidebarLink to="/" active={currentPath === "/"}>
          <span className="flex items-center gap-2"><BookOpen className="h-3.5 w-3.5" /> Home</span>
        </SidebarLink>
      </div>

      <SidebarSection title="Philosophy" icon={Lightbulb} defaultOpen={currentPath.startsWith("/philosophy")}>
        <SidebarLink to="/philosophy" active={currentPath === "/philosophy"}>Overview</SidebarLink>
        <SidebarLink to="/philosophy/solid" active={currentPath === "/philosophy/solid"}>SOLID Principles</SidebarLink>
        <SidebarLink to="/philosophy/tdd" active={currentPath === "/philosophy/tdd"}>Test-Driven Development</SidebarLink>
      </SidebarSection>

      {CATEGORY_ORDER.map((catKey) => {
        const cat = CATEGORIES[catKey];
        const patterns = getPatternsByCategory(catKey);
        const Icon = CATEGORY_ICONS[catKey];
        const isActive = currentPath.includes(`/patterns/${catKey}`);
        return (
          <SidebarSection key={catKey} title={cat.title} icon={Icon} defaultOpen={isActive}>
            <SidebarLink to={`/patterns/${catKey}`} active={currentPath === `/patterns/${catKey}`}>
              Overview
            </SidebarLink>
            {patterns.map((p) => (
              <SidebarLink
                key={p.slug}
                to={`/patterns/${p.category}/${p.slug}`}
                active={currentPath === `/patterns/${p.category}/${p.slug}`}
              >
                {p.title}
              </SidebarLink>
            ))}
          </SidebarSection>
        );
      })}

      <div className="mt-3">
        <SidebarLink to="/glossary" active={currentPath === "/glossary"}>
          <span className="flex items-center gap-2"><BookText className="h-3.5 w-3.5" /> Glossary</span>
        </SidebarLink>
      </div>
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-border bg-sidebar h-[calc(100vh-3.5rem)] sticky top-14 overflow-hidden">
        {content}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={onClose} />
          <aside className="fixed left-0 top-0 z-50 w-72 h-full bg-sidebar border-r border-border lg:hidden shadow-xl">
            <div className="h-14 flex items-center px-4 border-b border-border">
              <span className="text-primary font-mono text-lg font-bold">Go</span>
              <span className="ml-2 text-sm font-semibold">Intentional Architecture</span>
            </div>
            {content}
          </aside>
        </>
      )}
    </>
  );
}