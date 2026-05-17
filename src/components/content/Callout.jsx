import React from "react";
import { Info, AlertTriangle, CheckCircle, XCircle, Lightbulb } from "lucide-react";

const VARIANTS = {
  info: {
    icon: Info,
    bg: "bg-accent/60",
    border: "border-primary/20",
    iconColor: "text-primary",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-yellow-50 dark:bg-yellow-950/20",
    border: "border-yellow-300 dark:border-yellow-700",
    iconColor: "text-yellow-600 dark:text-yellow-400",
  },
  do: {
    icon: CheckCircle,
    bg: "bg-green-50 dark:bg-green-950/20",
    border: "border-green-300 dark:border-green-700",
    iconColor: "text-green-600 dark:text-green-400",
  },
  dont: {
    icon: XCircle,
    bg: "bg-red-50 dark:bg-red-950/20",
    border: "border-red-300 dark:border-red-700",
    iconColor: "text-red-600 dark:text-red-400",
  },
  tip: {
    icon: Lightbulb,
    bg: "bg-accent/40",
    border: "border-primary/15",
    iconColor: "text-primary",
  },
};

export default function Callout({ variant = "info", title, children }) {
  const v = VARIANTS[variant] || VARIANTS.info;
  const Icon = v.icon;

  return (
    <div className={`my-6 rounded-lg border ${v.border} ${v.bg} p-4`} role="note">
      <div className="flex gap-3">
        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${v.iconColor}`} />
        <div className="flex-1 min-w-0">
          {title && <div className="font-semibold text-sm mb-1 text-foreground">{title}</div>}
          <div className="text-sm text-foreground/85 leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  );
}