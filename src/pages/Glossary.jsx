import React from "react";
import { GLOSSARY } from "@/lib/content/glossary";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";

export default function Glossary() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Breadcrumbs />

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">Glossary</h1>
      <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-2xl">
        Quick reference for Go-specific terms and concepts used throughout this site.
      </p>

      <div className="space-y-6">
        {GLOSSARY.map((entry) => (
          <div key={entry.term} className="border-b border-border pb-6 last:border-b-0">
            <dt className="font-semibold text-foreground text-lg mb-1 font-mono">{entry.term}</dt>
            <dd className="text-foreground/85 leading-relaxed text-sm">{entry.definition}</dd>
          </div>
        ))}
      </div>

      <PrevNextNav />
    </div>
  );
}