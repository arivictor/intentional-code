import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Filter } from "lucide-react";

function SidebarSection({ title, children, defaultOpen = false, forceOpen = false, depth = 0 }) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = forceOpen || open;

  // Depth-aware typography: a top-level section reads as an uppercase divider,
  // while nested sections (course title, then chapters) step down in weight and
  // drop the uppercase so the tree reads as a hierarchy, not a stack of headers.
  const titleClass =
    depth === 0
      ? "uppercase tracking-wide text-xs font-bold text-foreground"
      : depth === 1
        ? "text-[13px] font-semibold text-foreground"
        : "text-[13px] font-medium text-muted-foreground";

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setOpen(!open)}
        className="group flex items-center gap-1.5 w-full px-2 py-1.5 transition-colors"
        aria-expanded={isOpen}
      >
        <span className={`flex-1 text-left transition-colors group-hover:text-primary ${titleClass}`}>{title}</span>
        {isOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
      </button>
      {isOpen && (
        <div className={depth >= 1 ? "ml-2.5 border-l border-border pl-1.5" : ""}>{children}</div>
      )}
    </div>
  );
}

function SidebarLink({ href, children, active }) {
  return (
    <a
      href={href}
      className={`block px-2 py-1 text-[13px] leading-snug transition-colors border-l-2 -ml-px pl-3 ${
        active
          ? "border-primary text-primary font-medium bg-accent/60"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      {children}
    </a>
  );
}

export default function Sidebar({
  navData,
  pathname,
  basePath = "/go",
  homePath = basePath,
  sectionLabel = "Go",
  philosophyItems = [],
  courseNavData = [],
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const handler = () => setOpen((value) => !value);
    document.addEventListener("sidebar-toggle", handler);
    return () => document.removeEventListener("sidebar-toggle", handler);
  }, []);

  const filterLower = filter.toLowerCase();
  const matchesFilter = (text) => !filterLower || text.toLowerCase().includes(filterLower);

  const nav = (
    <nav className="overflow-y-auto h-full scrollbar-thin" aria-label="Site navigation">
      <div className="px-3 py-3 border-b border-border">
        <div className="relative">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-[13px] bg-muted border border-border rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="px-3 py-3 border-b border-border space-y-0.5">
        {matchesFilter("Home") && (
          <SidebarLink href={homePath} active={pathname === homePath}>Home</SidebarLink>
        )}
        {matchesFilter("Saved") && (
          <SidebarLink href={`${basePath}/saved`} active={pathname === `${basePath}/saved`}>Saved Content</SidebarLink>
        )}
      </div>

      <div className="px-3 py-3 border-b border-border">
        <SidebarSection
          title="Philosophy"
          defaultOpen={pathname.startsWith(`${basePath}/philosophy`)}
          forceOpen={!!filterLower}
        >
          {matchesFilter("Overview") && (
            <SidebarLink href={`${basePath}/philosophy`} active={pathname === `${basePath}/philosophy`}>Overview</SidebarLink>
          )}
          {philosophyItems.filter((item) => matchesFilter(item.title)).map((item) => (
            <SidebarLink
              key={item.slug}
              href={`${basePath}/philosophy/${item.slug}`}
              active={pathname === `${basePath}/philosophy/${item.slug}`}
            >
              {item.title}
            </SidebarLink>
          ))}
        </SidebarSection>
      </div>

      {courseNavData.length > 0 && (
        <div className="px-3 py-3 border-b border-border">
          <SidebarSection
            title="Courses"
            defaultOpen={pathname.startsWith(`${basePath}/courses`)}
            forceOpen={!!filterLower}
          >
            {matchesFilter("All Courses") && (
              <SidebarLink href={`${basePath}/courses`} active={pathname === `${basePath}/courses`}>All Courses</SidebarLink>
            )}
            {courseNavData.map((course) => {
              const courseBase = `${basePath}/courses/${course.slug}`;
              const isCourseActive = pathname.startsWith(courseBase);
              const visibleChapters = course.chapters.filter(
                (ch) => matchesFilter(course.title) || matchesFilter(ch.title) || ch.steps.some((s) => matchesFilter(s.title))
              );
              if (!matchesFilter(course.title) && visibleChapters.length === 0) return null;
              return (
                <SidebarSection
                  key={course.slug}
                  title={course.title}
                  defaultOpen={isCourseActive}
                  forceOpen={!!filterLower}
                  depth={1}
                >
                  {visibleChapters.map((chapter) => (
                    <SidebarSection
                      key={chapter.slug}
                      title={chapter.title}
                      defaultOpen={chapter.steps.some((s) => pathname === `${basePath}/courses/${s.slug}`)}
                      forceOpen={!!filterLower}
                      depth={2}
                    >
                      {chapter.steps.filter((s) => matchesFilter(s.title)).map((step) => (
                        <SidebarLink
                          key={step.slug}
                          href={`${basePath}/courses/${step.slug}`}
                          active={pathname === `${basePath}/courses/${step.slug}`}
                        >
                          {step.title}
                        </SidebarLink>
                      ))}
                    </SidebarSection>
                  ))}
                </SidebarSection>
              );
            })}
          </SidebarSection>
        </div>
      )}

      <div className="px-3 py-3 space-y-1">
        {(navData ?? []).map((category) => {
          const isActive = pathname.includes(`${basePath}/patterns/${category.slug}`);
          const visiblePatterns = category.patterns.filter((p) => matchesFilter(p.title));
          const showCategory = matchesFilter(category.title) || visiblePatterns.length > 0;
          if (!showCategory) return null;
          return (
            <SidebarSection
              key={category.slug}
              title={category.title}
              defaultOpen={isActive}
              forceOpen={!!filterLower}
            >
              {matchesFilter("Overview") && (
                <SidebarLink href={`${basePath}/patterns/${category.slug}`} active={pathname === `${basePath}/patterns/${category.slug}`}>
                  Overview
                </SidebarLink>
              )}
              {visiblePatterns.map((pattern) => (
                <SidebarLink
                  key={pattern.slug}
                  href={`${basePath}/patterns/${pattern.category}/${pattern.slug}`}
                  active={pathname === `${basePath}/patterns/${pattern.category}/${pattern.slug}`}
                >
                  {pattern.title}
                </SidebarLink>
              ))}
            </SidebarSection>
          );
        })}
      </div>
    </nav>
  );

  return (
    <>
      <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-border bg-sidebar h-[calc(100vh-3rem)] sticky top-12 overflow-hidden">
        {nav}
      </aside>

      {open && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />
          <aside className="fixed left-0 top-0 z-50 w-72 h-full bg-sidebar border-r border-border lg:hidden shadow-xl">
            <div className="h-12 flex items-center px-4 border-b border-border">
              <span className="font-bold text-sm text-foreground">Intentional Code</span>
              <span className="text-primary font-bold text-sm ml-1">_</span>
            </div>
            {nav}
          </aside>
        </>
      )}
    </>
  );
}
