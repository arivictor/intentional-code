import React from "react";

export default function Diagram({ title, children, caption }) {
  return (
    <figure className="my-8" role="img" aria-label={title || caption || "Diagram"}>
      <div className="rounded-lg border border-border bg-card p-6 overflow-x-auto">
        {title && (
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">{title}</div>
        )}
        <div className="flex justify-center">
          {children}
        </div>
      </div>
      {caption && (
        <figcaption className="text-xs text-muted-foreground mt-2 text-center italic">{caption}</figcaption>
      )}
    </figure>
  );
}