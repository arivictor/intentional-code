import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowRight, Box, Puzzle, Workflow, CheckCircle, Building2, Scale, Star, Database, GitBranch, Shuffle, Compass } from "lucide-react";
import { getReadPatterns } from "@/lib/readingProgress";
import PrevNextNav from "@/components/layout/PrevNextNav";

const CATEGORY_ICONS = {
  creational: Box,
  structural: Puzzle,
  behavioral: Workflow,
  architectural: Building2,
  concurrency: Shuffle,
  modules: Box,
  state: Database,
  delivery: GitBranch,
  architecture: Building2,
};

function TagFilter({ allTags, activeTags, filteredCount, totalCount, onToggle, onClear }) {
  if (!allTags || allTags.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2 items-center">
        {allTags.map((tag) => {
          const active = activeTags.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => onToggle(tag)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors font-medium ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {tag}
            </button>
          );
        })}
        {activeTags.length > 0 && (
          <button
            onClick={onClear}
            className="px-3 py-1 text-xs rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      {activeTags.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          {filteredCount} of {totalCount} patterns match
        </p>
      )}
    </div>
  );
}

export default function Home({
  allContent,
  navOrder,
  categories,
  categoryOrder,
  patterns,
  philosophy,
  pathname,
  tagline,
  heroBody,
  catalogHeading,
  allTags,
  basePath = "/go",
  languageLabel = "Go",
}) {
  const [readSlugs, setReadSlugs] = useState([]);
  const [activeTags, setActiveTags] = useState([]);

  useEffect(() => {
    setReadSlugs(getReadPatterns());
  }, []);

  const readCount = allContent.filter((content) => readSlugs.includes(content.storageKey)).length;
  const totalCount = allContent.length;
  const progressPct = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

  const recentlyRead = allContent.filter((content) => readSlugs.includes(content.storageKey)).slice(-3).reverse();
  const nextUnread = allContent.find((content) => !readSlugs.includes(content.storageKey));

  const categoryMap = Object.fromEntries(categories.map((category) => [category.slug, category]));
  const featuredPatterns = patterns.filter((pattern) => pattern.isFeatured).slice(0, 3);
  const filteredPatterns = activeTags.length === 0
    ? patterns
    : patterns.filter((pattern) => pattern.tags && pattern.tags.some((tag) => activeTags.includes(tag)));

  const toggleTag = (tag) => setActiveTags((current) => (
    current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]
  ));

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-12">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
          Intentional Code <span className="text-primary">with {languageLabel}</span>
        </h1>
        {tagline && <p className="text-xl text-foreground leading-relaxed mb-4 font-medium">{tagline}</p>}
        {heroBody && (
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="text-base text-muted-foreground leading-relaxed mb-3">{children}</p>,
              a: ({ href, children }) => (
                <a href={href} className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors">
                  {children}
                </a>
              ),
            }}
          >
            {heroBody}
          </ReactMarkdown>
        )}
      </div>

      <div className="mb-10 flex items-center gap-3 p-4 rounded-lg border border-border bg-muted/30">
        <Compass className="h-4 w-4 text-primary shrink-0" />
        <p className="text-sm text-muted-foreground">
          Not sure which pattern you need?{" "}
          <a href={`${basePath}/finder`} className="text-primary font-medium hover:underline underline-offset-2">
            Answer a few questions →
          </a>
        </p>
      </div>

      {readCount > 0 && (
        <section className="mb-12 p-5 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Your progress</h2>
            <span className="text-sm text-muted-foreground">{readCount} / {totalCount} pages read</span>
          </div>
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mb-5">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          {nextUnread && (
            <div className="mb-4">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Up next</div>
              <a
                href={nextUnread.url}
                className="group flex items-center gap-3 p-3 rounded-md border border-border hover:border-primary/40 hover:bg-accent/40 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">{nextUnread.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{nextUnread.description}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
              </a>
            </div>
          )}
          {recentlyRead.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Recently read</div>
              <div className="space-y-1">
                {recentlyRead.map((item) => (
                  <a
                    key={item.storageKey}
                    href={item.url}
                    className="group flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-accent/50 transition-colors"
                  >
                    <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{item.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {featuredPatterns.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <Star className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Featured</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {featuredPatterns.map((pattern) => (
              <a
                key={pattern.slug}
                href={`${basePath}/patterns/${pattern.category}/${pattern.slug}`}
                className="group flex flex-col p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/40 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                    {pattern.title}
                  </span>
                  {readSlugs.includes(pattern.storageKey) && (
                    <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed flex-1">{pattern.intent}</p>
                <div className="mt-3 flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Read <ArrowRight className="h-3 w-3" />
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <section id="patterns" className="mb-12">
        <h2 className="text-2xl font-semibold mb-4 text-foreground">{catalogHeading ?? "Pattern catalog"}</h2>

        <TagFilter
          allTags={allTags}
          activeTags={activeTags}
          filteredCount={filteredPatterns.length}
          totalCount={patterns.length}
          onToggle={toggleTag}
          onClear={() => setActiveTags([])}
        />

        {activeTags.length === 0 && (
          <div className="mb-8">
            <a
              href={`${basePath}/philosophy`}
              className="flex items-center gap-2 mb-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Scale className="h-4 w-4" />
              <h3 className="font-semibold text-sm uppercase tracking-wider">Design Philosophy</h3>
            </a>
            <div className="grid gap-2 sm:grid-cols-2">
              {philosophy.map((item) => (
                <a
                  key={item.storageKey ?? item.slug}
                  href={item.url}
                  className="group flex items-start gap-3 p-3 rounded-md hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                        {item.title}
                      </span>
                      {item.storageKey && readSlugs.includes(item.storageKey) && (
                        <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {categoryOrder.map((catKey) => {
          const category = categoryMap[catKey];
          const categoryPatterns = filteredPatterns.filter((pattern) => pattern.category === catKey);
          if (activeTags.length > 0 && categoryPatterns.length === 0) return null;
          const Icon = CATEGORY_ICONS[catKey];

          return (
            <div key={catKey} className="mb-8">
              <a
                href={`${basePath}/patterns/${catKey}`}
                className="flex items-center gap-2 mb-3 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon className="h-4 w-4" />
                <h3 className="font-semibold text-sm uppercase tracking-wider">{category.title}</h3>
              </a>
              <div className="grid gap-2 sm:grid-cols-2">
                {categoryPatterns.map((pattern) => (
                  <a
                    key={pattern.slug}
                    href={`${basePath}/patterns/${pattern.category}/${pattern.slug}`}
                    className="group flex items-start gap-3 p-3 rounded-md hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                          {pattern.title}
                        </span>
                        {readSlugs.includes(pattern.storageKey) && (
                          <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{pattern.intent}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <PrevNextNav navOrder={navOrder} pathname={pathname} />
    </div>
  );
}
