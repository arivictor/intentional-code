import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowRight, Box, Puzzle, Workflow, CheckCircle, Building2, Scale, Star, Database, GitBranch, Shuffle, BookOpen } from "lucide-react";
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

const LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
const LEVEL_COLOR = {
  beginner: "text-emerald-600 dark:text-emerald-400",
  intermediate: "text-amber-600 dark:text-amber-400",
  advanced: "text-red-600 dark:text-red-400",
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
  courses = [],
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

  // "Continue reading" = the single most recently read item. read_patterns is
  // append-ordered (re-marking moves an entry to the end), so we walk from the
  // newest entry back to the first one that still maps to live content.
  const contentByKey = Object.fromEntries(allContent.map((content) => [content.storageKey, content]));
  let continueReading = null;
  for (let i = readSlugs.length - 1; i >= 0; i--) {
    if (contentByKey[readSlugs[i]]) { continueReading = contentByKey[readSlugs[i]]; break; }
  }

  // Per-course progress for any course the reader has started (>= 1 step read).
  const trackedCourses = courses
    .map((course) => {
      const total = course.steps.length;
      const done = course.steps.filter((step) => readSlugs.includes(step.storageKey)).length;
      const firstUnread = course.steps.find((step) => !readSlugs.includes(step.storageKey)) ?? null;
      return { ...course, total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0, firstUnread };
    })
    .filter((course) => course.done > 0);

  const categoryMap = Object.fromEntries(categories.map((category) => [category.slug, category]));
  const featuredCourses = courses.filter((course) => course.isFeatured);
  const featuredPatterns = patterns.filter((pattern) => pattern.isFeatured).slice(0, 3);
  const filteredPatterns = activeTags.length === 0
    ? patterns
    : patterns.filter((pattern) => pattern.tags && pattern.tags.some((tag) => activeTags.includes(tag)));

  const toggleTag = (tag) => setActiveTags((current) => (
    current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]
  ));

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">

      {/* ── Hero ── */}
      <div className="mb-12">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium bg-accent text-accent-foreground border border-border mb-6 select-none">
          {languageLabel}
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-[1.15] mb-4">
          Intentional Code{" "}
          <span className="text-primary">with {languageLabel}</span>
        </h1>
        {tagline && (
          <p className="text-lg text-muted-foreground leading-relaxed max-w-xl mb-4">
            {tagline}
          </p>
        )}
        {heroBody && (
          <div className="text-sm text-muted-foreground leading-relaxed max-w-xl mb-8 space-y-3 [&_em]:text-foreground [&_em]:not-italic [&_em]:font-medium">
            <ReactMarkdown>{heroBody}</ReactMarkdown>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <a
            href="#patterns"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Browse patterns <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href={`${basePath}/finder`}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            Find a pattern
          </a>
          <a
            href={`${basePath}/philosophy`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Read the philosophy →
          </a>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 items-center text-sm text-muted-foreground border-t border-border mt-8 pt-5">
          <span><span className="font-semibold text-foreground tabular-nums">{patterns.length}</span> patterns</span>
          <span aria-hidden>·</span>
          <span><span className="font-semibold text-foreground tabular-nums">{categories.length}</span> categories</span>
          <span aria-hidden>·</span>
          <span>Gang of Four</span>
          <span aria-hidden>·</span>
          <span>SOLID</span>
          <span aria-hidden>·</span>
          <span>TDD</span>
        </div>
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

          {continueReading && (
            <div className="mb-5">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Continue reading</div>
              <a
                href={continueReading.url}
                className="group flex items-center gap-3 p-3 rounded-md border border-border hover:border-primary/40 hover:bg-accent/40 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">{continueReading.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{continueReading.description}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
              </a>
            </div>
          )}

          {trackedCourses.map((course) => (
            <div key={course.slug} className="mb-4 last:mb-0">
              <div className="flex items-center justify-between mb-2 gap-3">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-0 truncate">
                  Continue with {course.title}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">{course.done} / {course.total} steps</span>
              </div>
              <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mb-2.5">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${course.pct}%` }} />
              </div>
              <a
                href={course.firstUnread ? course.firstUnread.url : course.url}
                className="group flex items-center gap-3 p-3 rounded-md border border-border hover:border-primary/40 hover:bg-accent/40 transition-all"
              >
                <BookOpen className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground group-hover:text-primary transition-colors line-clamp-1">
                    {course.firstUnread ? course.firstUnread.title : "Review the course"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {course.firstUnread ? "Pick up where you left off" : "You've completed every step"}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
              </a>
            </div>
          ))}
        </section>
      )}

      {(featuredCourses.length > 0 || featuredPatterns.length > 0) && (
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <Star className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Featured</h2>
          </div>
          {featuredCourses.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 mb-3">
              {featuredCourses.map((course) => (
                <a
                  key={course.slug}
                  href={course.url}
                  className="group flex flex-col p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/40 transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                      <BookOpen className="h-3.5 w-3.5" /> Course
                    </span>
                    <span className={`text-xs font-medium ${LEVEL_COLOR[course.level] ?? ""}`}>
                      {LEVEL_LABEL[course.level] ?? course.level}
                    </span>
                  </div>
                  <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors mb-1">
                    {course.title}
                  </span>
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1 line-clamp-2">{course.description}</p>
                  <div className="mt-3 flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    Start course <ArrowRight className="h-3 w-3" />
                  </div>
                </a>
              ))}
            </div>
          )}
          {featuredPatterns.length > 0 && (
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
          )}
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
                      {pattern.recognitionHook && (
                        <div className="text-xs text-primary/70 mt-0.5 line-clamp-1 italic">{pattern.recognitionHook}</div>
                      )}
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
