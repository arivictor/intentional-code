import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";
import MarkdownCode from "@/components/content/MarkdownCode";

export default function CategoryLanding({
  category,
  introMarkdown,
  patterns,
  navOrder,
  pathname,
  basePath = "/go",
  summaryLabel = "Go Idiom",
}) {
  if (!category) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold">Category not found</h1>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Breadcrumbs pathname={pathname} patternMap={{}} />

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">{category.title}</h1>
      <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-2xl">{category.lede}</p>

      {introMarkdown && (
        <div className="prose-pattern mb-8">
          <ReactMarkdown rehypePlugins={[rehypeSlug]} components={{ code: MarkdownCode, h1: () => null }}>
            {introMarkdown}
          </ReactMarkdown>
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Pattern</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Intent</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden md:table-cell">{summaryLabel}</th>
              </tr>
            </thead>
            <tbody>
              {patterns.map((p, i) => (
                <tr key={p.slug} className={i < patterns.length - 1 ? "border-b border-border" : ""}>
                  <td className="px-4 py-3">
                    <a
                      href={`${basePath}/patterns/${p.category}/${p.slug}`}
                      className="font-medium text-primary hover:underline whitespace-nowrap"
                    >
                      {p.title}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.intent}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs font-mono">{p.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        {patterns.map((p) => (
          <a
            key={p.slug}
            href={`${basePath}/patterns/${p.category}/${p.slug}`}
            className="group block p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/30 transition-all"
          >
            <div className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1">
              {p.title}
            </div>
            <div className="text-sm text-muted-foreground">{p.intent}</div>
          </a>
        ))}
      </div>

      <PrevNextNav navOrder={navOrder} pathname={pathname} />
    </div>
  );
}
