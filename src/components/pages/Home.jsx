import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowRight, Puzzle, CheckCircle, Scale, Star, BookOpen, Compass } from "lucide-react";
import { getReadPatterns } from "@/lib/readingProgress";
import PrevNextNav from "@/components/layout/PrevNextNav";

const LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
const LEVEL_COLOR = {
  beginner: "text-emerald-600 dark:text-emerald-400",
  intermediate: "text-amber-600 dark:text-amber-400",
  advanced: "text-red-600 dark:text-red-400",
};


export default function Home({
  allContent,
  navOrder,
  categories,
  patterns,
  courses = [],
  pathname,
  tagline,
  heroBody,
  basePath = "/go",
  languageLabel = "Go",
}) {
  const [readSlugs, setReadSlugs] = useState([]);

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

  const featuredCourses = courses.filter((course) => course.isFeatured);
  const featuredPatterns = patterns.filter((pattern) => pattern.isFeatured).slice(0, 3);

  // The spine of the guide: the four steps from reasoning to shipping. The home
  // page leads with this so a reader has a path, not just a catalog to browse.
  const PATH = [
    {
      kicker: "Why",
      title: "Principles",
      icon: Scale,
      href: `${basePath}/philosophy`,
      body: "Start with the reasoning. The principles — SOLID, KISS, YAGNI, Gall's Law and more — that decide whether a design holds up. Lenses, not rules.",
      cta: "Read the philosophy",
    },
    {
      kicker: "Which",
      title: "Find a pattern",
      icon: Compass,
      href: `${basePath}/finder`,
      body: "Have a real problem? Answer two or three questions and get pointed at the pattern that fits — along with the reason it fits.",
      cta: "Open the finder",
    },
    {
      kicker: "What",
      title: "Patterns",
      icon: Puzzle,
      href: `${basePath}/patterns/creational`,
      body: `${patterns.length} patterns in idiomatic ${languageLabel}. Each names the problem it solves, weighs the tradeoffs, and links to the patterns it works with.`,
      cta: "Browse the catalog",
    },
  ];

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
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl mb-8">
          A field guide to writing {languageLabel} that's easier to read, test, and change — built on one habit:
          always answer <em className="not-italic font-medium text-foreground">why</em> before
          {" "}<em className="not-italic font-medium text-foreground">how</em>. Follow the three steps below,
          or jump straight to the catalog.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href={`${basePath}/patterns/creational`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Browse the catalog <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href={`${basePath}/finder`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Find a pattern →
          </a>
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

      {/* ── The path: the spine that turns a catalog into a guide ── */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-1">How to use this guide</h2>
        <p className="text-sm text-muted-foreground mb-5 max-w-2xl">
          Three steps, from the reasoning behind a design to the patterns that express it. Read them in order, or jump to the one you need.
        </p>
        <ol className="grid gap-3 sm:grid-cols-2">
          {PATH.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={step.title}>
                <a
                  href={step.href}
                  className="group h-full flex flex-col p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/40 transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold tabular-nums">
                      {i + 1}
                    </span>
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                      {step.title}
                    </span>
                    <span className="ml-auto text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {step.kicker}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1">{step.body}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    {step.cta} <ArrowRight className="h-3 w-3" />
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </section>

      {heroBody && (
        <section className="mb-12 p-5 rounded-lg border border-border bg-card">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Why "intentional"?</h2>
          <div className="text-sm text-muted-foreground leading-relaxed space-y-3 max-w-2xl [&_em]:text-foreground [&_em]:not-italic [&_em]:font-medium">
            <ReactMarkdown>{heroBody}</ReactMarkdown>
          </div>
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

      <PrevNextNav navOrder={navOrder} pathname={pathname} />
    </div>
  );
}
