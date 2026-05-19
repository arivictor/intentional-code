import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Scale, FlaskConical } from "lucide-react";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";
import PageMeta from "@/components/PageMeta";

const PHILOSOPHY_PAGES = [
  {
    icon: Scale,
    title: "SOLID Principles",
    description: "The five principles of object-oriented design, reinterpreted for Go's composition-first, implicit-interface model. What changes, what stays, and what becomes natural.",
    path: "/go/philosophy/solid",
  },
  {
    icon: FlaskConical,
    title: "Test-Driven Development",
    description: "The red/green/refactor loop in Go. How Go's tooling — go test, table-driven tests, subtests, fuzzing, and implicit interfaces as test seams — makes TDD practical and pleasant.",
    path: "/go/philosophy/tdd",
  },
];

export default function PhilosophyLanding() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <PageMeta title="Philosophy" description="The principles that make Go design patterns work: SOLID and Test-Driven Development." />
      <Breadcrumbs />

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">Design Philosophy</h1>
      <p className="text-lg text-muted-foreground leading-relaxed mb-10 max-w-2xl">
        Patterns are implementations. Principles are the reason implementations work.
        Before diving into the 22 GoF patterns, ground yourself in the design thinking that
        makes those patterns useful — and that tells you when they're not.
      </p>

      <div className="space-y-4">
        {PHILOSOPHY_PAGES.map((page) => (
          <Link
            key={page.path}
            to={page.path}
            className="group block p-6 rounded-lg border border-border hover:border-primary/40 bg-card hover:bg-accent/30 transition-all"
          >
            <div className="flex items-start gap-4">
              <page.icon className="h-6 w-6 text-primary shrink-0 mt-1" />
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors mb-2">
                  {page.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{page.description}</p>
                <div className="mt-3 flex items-center gap-1 text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Read more <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <PrevNextNav />
    </div>
  );
}