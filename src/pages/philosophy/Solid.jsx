import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PrevNextNav from "@/components/layout/PrevNextNav";
import MarkdownCode from "@/components/content/MarkdownCode";
export default function Solid() {
  const [markdown, setMarkdown] = useState("");

  useEffect(() => {
    import("../../content/philosophy/solid.md?raw")
      .then((m) => setMarkdown(m.default))
      .catch(() => setMarkdown(""));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Breadcrumbs />
      <div className="prose-pattern">
        <ReactMarkdown rehypePlugins={[rehypeSlug]} components={{ code: MarkdownCode }}>
          {markdown}
        </ReactMarkdown>
      </div>
      <PrevNextNav />
    </div>
  );
}
