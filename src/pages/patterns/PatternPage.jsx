import React from "react";
import { useParams } from "react-router-dom";
import { getPattern } from "@/lib/content/patterns";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";
import TableOfContents from "@/components/layout/TableOfContents";
import CategoryBadge from "@/components/content/CategoryBadge";
import CodeBlock from "@/components/content/CodeBlock";
import ComparisonTable from "@/components/content/ComparisonTable";
import Callout from "@/components/content/Callout";
import Diagram from "@/components/content/Diagram";
import PatternLink from "@/components/content/PatternLink";
import { PATTERN_CONTENT } from "@/lib/content/patternContent";

export default function PatternPage() {
  const { slug } = useParams();
  const pattern = getPattern(slug);
  const content = PATTERN_CONTENT[slug];

  if (!pattern || !content) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Breadcrumbs />
        <h1 className="text-2xl font-bold mb-4">Pattern: {slug}</h1>
        <p className="text-muted-foreground">This pattern page is coming soon.</p>
        <PrevNextNav />
      </div>
    );
  }

  return (
    <div className="flex gap-8 max-w-5xl mx-auto px-6 py-12">
      <div className="flex-1 min-w-0">
        <Breadcrumbs />

        {/* Title + Badge */}
        <div className="flex items-start gap-3 mb-2 flex-wrap">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {pattern.title}
          </h1>
          <CategoryBadge category={pattern.category} />
        </div>
        <p className="text-lg text-muted-foreground leading-relaxed mb-8">{pattern.intent}</p>

        {/* Intent */}
        <section id="intent">
          <h2 className="text-2xl font-semibold mt-12 mb-4 text-foreground">Intent</h2>
          <div className="prose-pattern">
            {content.intentDetail.split("\n\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>

        {/* Problem */}
        <section id="problem">
          <h2 className="text-2xl font-semibold mt-12 mb-4 text-foreground">Problem</h2>
          <div className="prose-pattern">
            {content.problem.split("\n\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <CodeBlock code={content.problemCode} filename={content.problemCodeFile || "problem.go"} />
          <div className="prose-pattern">
            {content.problemExplain.split("\n\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>

        {/* Solution */}
        <section id="solution">
          <h2 className="text-2xl font-semibold mt-12 mb-4 text-foreground">Solution</h2>
          <div className="prose-pattern">
            {content.solutionIntro.split("\n\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          {/* Diagram */}
          {content.diagram && (
            <Diagram title="Structure" caption={content.diagramCaption}>
              <div className="font-mono text-sm whitespace-pre leading-relaxed text-foreground/80">
                {content.diagram}
              </div>
            </Diagram>
          )}

          {/* Solution code blocks */}
          {content.solutionSteps.map((step, i) => (
            <div key={i}>
              {step.prose && (
                <div className="prose-pattern">
                  {step.prose.split("\n\n").map((p, j) => (
                    <p key={j}>{p}</p>
                  ))}
                </div>
              )}
              {step.code && <CodeBlock code={step.code} filename={step.filename} />}
            </div>
          ))}

          {/* Example output */}
          {content.exampleOutput && (
            <>
              <h3 className="text-lg font-semibold mt-6 mb-3 text-foreground">Example output</h3>
              <div className="my-4 rounded-lg border border-code-border overflow-hidden bg-code-bg">
                <pre className="p-4 text-sm font-mono leading-relaxed text-code-text whitespace-pre">
                  {content.exampleOutput}
                </pre>
              </div>
            </>
          )}
        </section>

        {/* When to use */}
        <section id="when-to-use">
          <h2 className="text-2xl font-semibold mt-12 mb-4 text-foreground">When to use it</h2>
          <ul className="space-y-2 ml-6 list-disc">
            {content.whenToUse.map((item, i) => (
              <li key={i} className="text-foreground/85 leading-relaxed">{item}</li>
            ))}
          </ul>
        </section>

        {/* When NOT to use */}
        <section id="when-not-to-use">
          <h2 className="text-2xl font-semibold mt-12 mb-4 text-foreground">When not to use it</h2>
          <ul className="space-y-2 ml-6 list-disc">
            {content.whenNotToUse.map((item, i) => (
              <li key={i} className="text-foreground/85 leading-relaxed">{item}</li>
            ))}
          </ul>
          {content.alternativeNote && (
            <Callout variant="tip" title="Idiomatic Go alternative">
              {content.alternativeNote}
            </Callout>
          )}
        </section>

        {/* Advantages & Disadvantages */}
        <section id="advantages-disadvantages">
          <h2 className="text-2xl font-semibold mt-12 mb-4 text-foreground">Advantages & Disadvantages</h2>
          <ComparisonTable advantages={content.advantages} disadvantages={content.disadvantages} />
        </section>

        {/* Related Patterns */}
        <section id="related-patterns">
          <h2 className="text-2xl font-semibold mt-12 mb-4 text-foreground">Related Patterns</h2>
          <div className="space-y-3">
            {content.relatedPatterns.map((rp, i) => (
              <div key={i} className="flex items-start gap-2 flex-wrap">
                <PatternLink slug={rp.slug} />
                <span className="text-sm text-muted-foreground mt-1">{rp.relation}</span>
              </div>
            ))}
          </div>
        </section>

        <PrevNextNav />
      </div>

      <TableOfContents />
    </div>
  );
}