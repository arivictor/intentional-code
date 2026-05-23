import React, { createContext } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import MarkdownCode from "@/components/content/MarkdownCode";
import ComparisonTable from "@/components/content/ComparisonTable";
import PatternLink from "@/components/content/PatternLink";
import DetailPageShell, { AUTOLINK_OPTIONS } from "./DetailPageShell";
import { AlertTriangle } from "lucide-react";

export const PatternsContext = createContext({ allPatterns: [], basePath: "/go" });

function readingTime(md) {
  if (!md) return null;
  return `${Math.max(1, Math.round(md.split(/\s+/).filter(Boolean).length / 200))} min read`;
}

function parseList(block) {
  return block.trim().split("\n").filter((line) => line.startsWith("- ")).map((line) => line.slice(2).trim());
}

function parseRelated(block) {
  return block.trim().split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => {
      const inner = line.slice(2).trim();
      const match = inner.match(/^\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/);
      if (match) return { title: match[1], description: match[2] };
      return { title: inner.replace(/\*\*/g, ""), description: "" };
    });
}

function splitMarkdown(md) {
  const advMarker = "\n## Advantages\n";
  const disMarker = "\n## Disadvantages\n";
  const relMarker = "\n## Related Patterns\n";
  const advIdx = md.indexOf(advMarker);
  const disIdx = md.indexOf(disMarker);
  const relIdx = md.indexOf(relMarker);
  if (advIdx === -1 || disIdx === -1) return null;

  const before = md.slice(0, advIdx);
  const advContent = md.slice(advIdx + advMarker.length, disIdx);
  const disEnd = relIdx !== -1 ? relIdx : md.length;
  const disContent = md.slice(disIdx + disMarker.length, disEnd);
  const relatedPatterns = relIdx !== -1 ? parseRelated(md.slice(relIdx + relMarker.length)) : [];

  return { before, advantages: parseList(advContent), disadvantages: parseList(disContent), relatedPatterns };
}

const mdProps = {
  rehypePlugins: [
    rehypeSlug,
    [rehypeAutolinkHeadings, AUTOLINK_OPTIONS],
  ],
  components: {
    code: MarkdownCode,
    h1: () => null,
    h2: ({ children, ...props }) => {
      const text = Array.isArray(children) ? children.join("") : String(children ?? "");
      if (text === "When Not to Use") {
        return (
          <h2 {...props} className="flex items-center gap-2 text-xl font-semibold mt-10 mb-3 text-foreground border-l-[3px] border-amber-500 pl-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            {children}
          </h2>
        );
      }
      return <h2 {...props}>{children}</h2>;
    },
  },
};

export default function PatternPage({ pattern, markdown, allPatterns, navOrder, pathname, basePath = "/go" }) {
  const resolvedBasePath = pattern.basePath ?? basePath;
  const patternMap = Object.fromEntries((allPatterns ?? []).map((p) => [p.slug, p.title]));
  const sections = splitMarkdown(markdown);

  return (
    <PatternsContext.Provider value={{ allPatterns: allPatterns ?? [], basePath: resolvedBasePath }}>
      <DetailPageShell
        title={pattern.title}
        subtitle={pattern.intent}
        slug={pattern.storageKey}
        storageKey={pattern.storageKey}
        navOrder={navOrder}
        pathname={pathname}
        patternMap={patternMap}
        readingTimeText={readingTime(markdown)}
        markdown={markdown}
      >
        {sections ? (
          <>
            <div className="prose-pattern">
              <ReactMarkdown {...mdProps}>{sections.before}</ReactMarkdown>
            </div>
            <ComparisonTable advantages={sections.advantages} disadvantages={sections.disadvantages} />
            {sections.relatedPatterns.length > 0 && (
              <section id="related-patterns" className="mt-12">
                <h2 className="text-2xl font-semibold mb-4 text-foreground">Related Patterns</h2>
                <div className="space-y-3">
                  {sections.relatedPatterns.map((rp, i) => (
                    <PatternLink key={i} title={rp.title} description={rp.description} />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="prose-pattern">
            <ReactMarkdown {...mdProps}>{markdown}</ReactMarkdown>
          </div>
        )}
      </DetailPageShell>
    </PatternsContext.Provider>
  );
}
