import React from "react";
import { ArrowRight, Scale, Compass, Puzzle, BookOpen, ChevronRight } from "lucide-react";

// The four steps of the path, in depth. The home page shows a compact version of
// this same model; here each step gets room to explain its role and when to reach
// for it, so the guide reads as a walkthrough rather than a menu.
const STEPS = [
  {
    kicker: "Why",
    title: "Principles",
    icon: Scale,
    path: "/philosophy",
    body:
      "Every good decision starts with the reasoning behind it. The principles are lenses — SOLID, KISS, YAGNI, Gall's Law, Separation of Concerns and more. They tell you what to look for in a design and when to stop adding to it. Ground yourself here first and the patterns become easier to understand and harder to misapply.",
    cta: "Read the philosophy",
  },
  {
    kicker: "Which",
    title: "Find a pattern",
    icon: Compass,
    path: "/finder",
    body:
      "When you have a concrete problem but don't know its name yet, describe it. Answer two or three questions and the finder points you at the pattern that fits — and, just as importantly, the reason it fits. It's the fastest way from a problem to a candidate solution.",
    cta: "Open the finder",
  },
  {
    kicker: "What",
    title: "Patterns",
    icon: Puzzle,
    path: "/patterns/creational",
    body:
      "The catalog is the reference. Every pattern names the problem it solves, shows an idiomatic Go implementation, weighs the tradeoffs, and links to the patterns it pairs with or competes against. Read a pattern when you want the how — but read it knowing the why.",
    cta: "Browse the catalog",
  },
  {
    kicker: "Apply",
    title: "Practice",
    icon: BookOpen,
    path: "/courses",
    body:
      "Principles and patterns only stick once you build with them. The courses are end-to-end projects where the ideas come together into something real and shippable. This is the apply step — the place the rest of the guide is pointing you toward.",
    cta: "Start a course",
  },
];

function ItineraryCard({ title, blurb, steps, basePath }) {
  return (
    <div className="p-5 rounded-lg border border-border bg-card">
      <h3 className="font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{blurb}</p>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={step.label}>
            <a
              href={`${basePath}${step.path}`}
              className="group flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold tabular-nums shrink-0">
                {i + 1}
              </span>
              <span className="flex-1">{step.label}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Guide({ basePath = "/go" }) {
  const itineraries = [
    {
      title: "New to design patterns",
      blurb: "Build the vocabulary and the judgement before the catalog. Start with the reasoning, then see it applied.",
      steps: [
        { label: "Read the philosophy overview", path: "/philosophy" },
        { label: "Start with Gall's Law and KISS", path: "/philosophy/galls-law" },
        { label: "Skim one pattern category end to end", path: "/patterns/creational" },
        { label: "Try the finder on a problem you have", path: "/finder" },
      ],
    },
    {
      title: "I have a specific problem",
      blurb: "You know what you're trying to build and just need the right tool. Go straight to the decision step.",
      steps: [
        { label: "Describe it in the finder", path: "/finder" },
        { label: "Read the recommended pattern", path: "/patterns/behavioral" },
        { label: "Check the principle behind it", path: "/philosophy" },
      ],
    },
    {
      title: "I want to build something",
      blurb: "Learn by shipping. Apply the patterns and principles in a real, end-to-end project.",
      steps: [
        { label: "Open the course catalog", path: "/courses" },
        { label: "Work through it step by step", path: "/courses" },
        { label: "Look up patterns as they come up", path: "/patterns/architectural" },
      ],
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground mb-6">
        <a href={basePath} className="hover:text-foreground transition-colors">Home</a>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="text-foreground font-medium">Start here</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">Start here</h1>
      <p className="text-xl text-foreground leading-relaxed mb-4 font-medium max-w-2xl">
        This is a field guide for writing intentional Go — not a course site, and not a pattern encyclopedia to
        read cover to cover.
      </p>
      <div className="text-base text-muted-foreground leading-relaxed mb-10 max-w-2xl space-y-3">
        <p>
          The difference between architecture and preference is a <em className="not-italic font-medium text-foreground">because</em>.
          Everything here exists to help you answer <em className="not-italic font-medium text-foreground">why</em> before
          you commit to <em className="not-italic font-medium text-foreground">how</em>. The patterns name the problems;
          the principles name the reasoning that makes the solutions work.
        </p>
        <p>
          You don't have to read it all. The four steps below are a path from the reasoning behind a design to
          shipping it — use as much of it as you need.
        </p>
      </div>

      {/* ── The path ── */}
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">The path</h2>
      <ol className="space-y-3 mb-14">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.title}>
              <a
                href={`${basePath}${step.path}`}
                className="group flex gap-4 p-5 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-accent/30 transition-all"
              >
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {step.title}
                    </h3>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {step.kicker}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{step.body}</p>
                  <span className="inline-flex items-center gap-1 text-sm text-primary font-medium">
                    {step.cta} <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </a>
            </li>
          );
        })}
      </ol>

      {/* ── Where to start ── */}
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Where to start</h2>
      <p className="text-sm text-muted-foreground leading-relaxed mb-5 max-w-2xl">
        Pick the route that matches where you are right now.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {itineraries.map((itinerary) => (
          <ItineraryCard key={itinerary.title} {...itinerary} basePath={basePath} />
        ))}
      </div>
    </div>
  );
}
