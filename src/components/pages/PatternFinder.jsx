import React, { useState } from "react";
import { ArrowRight, RotateCcw, ChevronLeft } from "lucide-react";
import { FINDER_TREE } from "@/lib/finder-tree";
import Breadcrumbs from "@/components/layout/Breadcrumbs";

function ChoiceCrumb({ label }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <ChevronLeft className="h-3 w-3" />
      {label}
    </span>
  );
}

function WizardStep({ node, history, onSelect, onBack }) {
  return (
    <div>
      {/* Back + history trail */}
      {history.length > 0 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <span className="text-border select-none">·</span>
          <div className="flex items-center gap-1 flex-wrap">
            {history.map((step, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronLeft className="h-3 w-3 text-border rotate-180" />}
                <span className="text-xs text-muted-foreground">{step.choiceLabel}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Question */}
      <h2 className="text-xl font-semibold text-foreground mb-6">{node.question}</h2>

      {/* Options */}
      <div className="grid gap-3">
        {node.options.map((option, i) => (
          <button
            key={i}
            onClick={() => onSelect(option)}
            className="text-left w-full p-4 rounded-lg border border-border hover:border-primary/60 hover:bg-accent/20 transition-all group"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                  {option.label}
                </div>
                {option.hint && (
                  <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {option.hint}
                  </div>
                )}
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultCard({ slug, reason, patternIndex, basePath }) {
  const pattern = patternIndex.find((p) => p.slug === slug);
  if (!pattern) return null;

  return (
    <a
      href={pattern.path}
      className="block p-5 rounded-lg border border-border hover:border-primary/60 hover:bg-accent/10 transition-all group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground capitalize mb-1 font-medium tracking-wide uppercase">
            {pattern.category}
          </div>
          <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors mb-2">
            {pattern.title}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            {pattern.intent}
          </p>
          <p className="text-sm text-primary font-medium leading-relaxed">
            {reason}
          </p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 mt-1 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </a>
  );
}

function ResultView({ results, patternIndex, basePath, history, onReset }) {
  const count = results.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground">
          {count === 1 ? "Recommended pattern" : `${count} patterns to consider`}
        </h2>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Start over
        </button>
      </div>

      <div className="grid gap-4">
        {results.map(({ slug, reason }) => (
          <ResultCard
            key={slug}
            slug={slug}
            reason={reason}
            patternIndex={patternIndex}
            basePath={basePath}
          />
        ))}
      </div>

      {/* Path taken */}
      {history.length > 0 && (
        <div className="mt-8 p-4 rounded-lg bg-muted/40 border border-border/50">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Your path: </span>
            {history.map((s, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="mx-1 opacity-40">→</span>}
                {s.choiceLabel}
              </React.Fragment>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}

export default function PatternFinder({ patternIndex = [], basePath = "/go", pathname = "/go/finder" }) {
  const [currentNode, setCurrentNode] = useState(FINDER_TREE);
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);

  const handleSelect = (option) => {
    if (option.patterns) {
      // Terminal: show results
      setHistory((prev) => [...prev, { choiceLabel: option.label }]);
      setResult(option.patterns.patterns);
    } else if (option.next) {
      // Branch: go deeper
      setHistory((prev) => [...prev, { choiceLabel: option.label, node: currentNode }]);
      setCurrentNode(option.next);
    }
  };

  const handleBack = () => {
    if (result) {
      // Going back from results
      setResult(null);
      setHistory((prev) => prev.slice(0, -1));
    } else if (history.length > 0) {
      const prev = history[history.length - 1];
      setCurrentNode(prev.node ?? FINDER_TREE);
      setHistory((h) => h.slice(0, -1));
    }
  };

  const handleReset = () => {
    setCurrentNode(FINDER_TREE);
    setHistory([]);
    setResult(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
      <Breadcrumbs pathname={pathname} />

      {/* Page header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-foreground mb-3">Pattern Finder</h1>
        <p className="text-muted-foreground leading-relaxed">
          Describe your problem and get a pattern recommendation. Answer two or three questions to
          find the right tool for what you're building.
        </p>
      </div>

      {/* Step indicator */}
      {!result && (
        <div className="flex items-center gap-2 mb-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i < history.length
                  ? "bg-primary w-8"
                  : i === history.length
                  ? "bg-primary/40 w-5"
                  : "bg-border w-3"
              }`}
            />
          ))}
          <span className="text-xs text-muted-foreground ml-1">
            Step {Math.min(history.length + 1, 3)} of ~3
          </span>
        </div>
      )}

      {/* Content */}
      {result ? (
        <ResultView
          results={result}
          patternIndex={patternIndex}
          basePath={basePath}
          history={history}
          onReset={handleReset}
        />
      ) : (
        <WizardStep
          node={currentNode}
          history={history}
          onSelect={handleSelect}
          onBack={handleBack}
        />
      )}
    </div>
  );
}
