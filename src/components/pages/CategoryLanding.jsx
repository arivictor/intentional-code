import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";
import MarkdownCode from "@/components/content/MarkdownCode";

export default function CategoryLanding({
  category,
  introMarkdown,
  navOrder,
  pathname,
  basePath = "/go",
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

      <PrevNextNav navOrder={navOrder} pathname={pathname} />
    </div>
  );
}
