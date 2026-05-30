import React from "react";
import PrevNextNav from "@/components/layout/PrevNextNav";
import ReadingProgressBar from "@/components/layout/ReadingProgressBar";
import { BookOpen } from "lucide-react";

const LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
const LEVEL_COLOR = {
  beginner: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  intermediate: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  advanced: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function CourseCatalog({ courses = [], navOrder = [], pathname = "", basePath = "/go" }) {
  return (
    <>
      <ReadingProgressBar />
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">Courses</h1>
          <p className="text-base text-muted-foreground leading-relaxed max-w-2xl">
            End-to-end project courses. Each course walks you through building something real — designed to ship.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {courses.map((course) => (
            <a
              key={course.slug}
              href={`${basePath}/courses/${course.slug}`}
              className="group block border border-border rounded-lg p-5 bg-card hover:border-primary/50 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 text-primary shrink-0">
                  <BookOpen className="h-4 w-4" />
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${LEVEL_COLOR[course.level] ?? LEVEL_COLOR.intermediate}`}>
                  {LEVEL_LABEL[course.level] ?? course.level}
                </span>
              </div>
              <h2 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors mb-1.5">
                {course.title}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{course.description}</p>
              {course.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {course.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{tag}</span>
                  ))}
                </div>
              )}
            </a>
          ))}
        </div>

        <div className="mt-12">
          <PrevNextNav navOrder={navOrder} pathname={pathname} />
        </div>
      </div>
    </>
  );
}
