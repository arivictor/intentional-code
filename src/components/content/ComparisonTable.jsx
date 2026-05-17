import React from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

export default function ComparisonTable({ advantages, disadvantages }) {
  return (
    <div className="my-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-green-200 dark:border-green-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-green-50 dark:bg-green-950/30 border-b border-green-200 dark:border-green-800 flex items-center gap-2">
          <ThumbsUp className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span className="font-semibold text-sm text-green-800 dark:text-green-300">Advantages</span>
        </div>
        <ul className="p-4 space-y-2">
          {advantages.map((a, i) => (
            <li key={i} className="text-sm text-foreground/85 flex gap-2">
              <span className="text-green-500 shrink-0">+</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border border-red-200 dark:border-red-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800 flex items-center gap-2">
          <ThumbsDown className="h-4 w-4 text-red-600 dark:text-red-400" />
          <span className="font-semibold text-sm text-red-800 dark:text-red-300">Disadvantages</span>
        </div>
        <ul className="p-4 space-y-2">
          {disadvantages.map((d, i) => (
            <li key={i} className="text-sm text-foreground/85 flex gap-2">
              <span className="text-red-500 shrink-0">−</span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}