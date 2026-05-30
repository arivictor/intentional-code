import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import MarkdownCode from "@/components/content/MarkdownCode";
import DetailPageShell, { AUTOLINK_OPTIONS } from "./DetailPageShell";

function readingTime(md) {
  if (!md) return null;
  return `${Math.max(1, Math.round(md.split(/\s+/).filter(Boolean).length / 200))} min read`;
}

const mdProps = {
  rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, AUTOLINK_OPTIONS]],
  components: { code: MarkdownCode, h1: () => null },
};

export default function StepPage({ step, markdown, navOrder, pathname, basePath = "/go" }) {
  return (
    <DetailPageShell
      title={step.title}
      subtitle={step.description ?? ""}
      slug={step.storageKey}
      storageKey={step.storageKey}
      navOrder={navOrder}
      pathname={pathname}
      readingTimeText={readingTime(markdown)}
      markdown={markdown}
    >
      <div className="prose-pattern">
        <ReactMarkdown {...mdProps}>{markdown}</ReactMarkdown>
      </div>
    </DetailPageShell>
  );
}
