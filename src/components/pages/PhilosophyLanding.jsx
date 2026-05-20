import React from "react";
import ReactMarkdown from "react-markdown";
import { ArrowRight, Scale, FlaskConical } from "lucide-react";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";

const SLUG_ICONS = { solid: Scale, tdd: FlaskConical };

export default function PhilosophyLanding({ philosophyItems, navOrder, pathname, intro, introBody }) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Breadcrumbs pathname={pathname} patternMap={{}} />

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">Design Philosophy</h1>
      {intro && (
        <p className="text-xl text-foreground leading-relaxed mb-4 font-medium max-w-2xl">{intro}</p>
      )}
      {introBody && (
        <div className="mb-10 max-w-2xl">
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <p className="text-base text-muted-foreground leading-relaxed mb-3">{children}</p>
              ),
            }}
          >
            {introBody}
          </ReactMarkdown>
        </div>
      )}

      <div className="space-y-4">
        {philosophyItems.map((page) => {
          const Icon = SLUG_ICONS[page.slug] ?? Scale;
          return (
            <a
              key={page.slug}
              href={page.url}
              className="group block p-6 rounded-lg border border-border hover:border-primary/40 bg-card hover:bg-accent/30 transition-all"
            >
              <div className="flex items-start gap-4">
                <Icon className="h-6 w-6 text-primary shrink-0 mt-1" />
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
            </a>
          );
        })}
      </div>

      <PrevNextNav navOrder={navOrder} pathname={pathname} />
    </div>
  );
}
