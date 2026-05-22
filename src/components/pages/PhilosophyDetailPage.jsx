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

export default function PhilosophyDetailPage({ slug, title, description, markdown, navOrder, pathname, storageKey }) {
  return (
    <DetailPageShell
      title={title}
      subtitle={description}
      slug={slug}
      storageKey={storageKey}
      navOrder={navOrder}
      pathname={pathname}
      readingTimeText={readingTime(markdown)}
    >
      <div className="prose-pattern">
        <ReactMarkdown
          rehypePlugins={[rehypeSlug, [rehypeAutolinkHeadings, AUTOLINK_OPTIONS]]}
          components={{ code: MarkdownCode, h1: () => null }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </DetailPageShell>
  );
}
