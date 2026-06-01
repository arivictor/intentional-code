import React, { useEffect, useState } from "react";
import PrevNextNav from "@/components/layout/PrevNextNav";
import ReadingProgressBar from "@/components/layout/ReadingProgressBar";
import { isPatternRead } from "@/lib/readingProgress";
import { CheckCircle, Circle, ChevronRight, BookOpen } from "lucide-react";

const LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
const LEVEL_COLOR = {
  beginner: "text-emerald-600 dark:text-emerald-400",
  intermediate: "text-amber-600 dark:text-amber-400",
  advanced: "text-red-600 dark:text-red-400",
};

export default function CourseLanding({ course, navOrder = [], pathname = "", basePath = "/go", homePath = basePath }) {
  const [stepsDone, setStepsDone] = useState({});

  useEffect(() => {
    const map = {};
    for (const chapter of course.chapters) {
      for (const step of chapter.steps) {
        const key = `${basePath}/courses/${step.slug}`;
        map[step.slug] = isPatternRead(key);
      }
    }
    setStepsDone(map);
  }, [basePath, course]);

  const allSteps = course.chapters.flatMap((ch) => ch.steps);
  const doneCount = allSteps.filter((s) => stepsDone[s.slug]).length;
  const pct = allSteps.length > 0 ? Math.round((doneCount / allSteps.length) * 100) : 0;

  return (
    <>
      <ReadingProgressBar />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground mb-6">
          <a href={homePath} className="hover:text-foreground transition-colors">Home</a>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <a href={`${basePath}/courses`} className="hover:text-foreground transition-colors">Practice</a>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="text-foreground font-medium">{course.title}</span>
        </nav>

        <div className="mb-2 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className={`text-sm font-medium ${LEVEL_COLOR[course.level] ?? ""}`}>
            {LEVEL_LABEL[course.level] ?? course.level}
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">{course.title}</h1>
        <p className="text-base text-muted-foreground leading-relaxed mb-8">{course.description}</p>

        {allSteps.length > 0 && (
          <div className="mb-8 p-4 rounded-lg border border-border bg-muted/40">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Your progress</span>
              <span className="font-medium text-foreground">{doneCount} / {allSteps.length} steps</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        <div className="space-y-8">
          {course.chapters.map((chapter, ci) => (
            <div key={chapter.slug}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                Chapter {ci + 1} — {chapter.title}
              </h2>
              {chapter.description && (
                <p className="text-sm text-muted-foreground mb-3">{chapter.description}</p>
              )}
              <div className="space-y-1.5">
                {chapter.steps.map((step, si) => {
                  const done = stepsDone[step.slug];
                  return (
                    <a
                      key={step.slug}
                      href={`${basePath}/courses/${step.slug}`}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-accent/30 transition-all group"
                    >
                      {done
                        ? <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                        : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                      <span className={`flex-1 text-sm ${done ? "text-muted-foreground line-through" : "text-foreground group-hover:text-primary transition-colors"}`}>
                        {si + 1}. {step.title}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12">
          <PrevNextNav navOrder={navOrder} pathname={pathname} />
        </div>
      </div>
    </>
  );
}
