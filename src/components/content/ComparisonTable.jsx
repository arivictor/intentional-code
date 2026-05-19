import React from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

export default function ComparisonTable({ advantages, disadvantages }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4 my-6">
      <div className="rounded-lg border border-green-500/30 bg-card p-5">
        <div id="advantages" className="flex items-center gap-2 mb-4 text-green-500">
          <ThumbsUp className="h-4 w-4" />
          <span className="font-semibold">Advantages</span>
        </div>
        <ul className="space-y-2.5">
          {advantages.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground/85 leading-relaxed">
              <span className="text-green-500 font-bold shrink-0 mt-px">+</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border border-red-500/30 bg-card p-5">
        <div id="disadvantages" className="flex items-center gap-2 mb-4 text-red-500">
          <ThumbsDown className="h-4 w-4" />
          <span className="font-semibold">Disadvantages</span>
        </div>
        <ul className="space-y-2.5">
          {disadvantages.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground/85 leading-relaxed">
              <span className="text-red-500 font-bold shrink-0 mt-px">–</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
