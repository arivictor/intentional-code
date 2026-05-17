import React from "react";
import { Badge } from "@/components/ui/badge";

const CATEGORY_STYLES = {
  creational: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  structural: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  behavioral: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
};

export default function CategoryBadge({ category }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${CATEGORY_STYLES[category] || ""}`}>
      {category.charAt(0).toUpperCase() + category.slice(1)}
    </span>
  );
}