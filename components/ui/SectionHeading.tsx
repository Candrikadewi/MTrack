import type { ReactNode } from "react";

/** Small numbered circle used to key a page section to its number in the
 * design spec (1. Ringkasan, 2. ..., etc.) — same badge used standalone in
 * SectionHeading and inline inside a CollapsibleSection/Card title. */
export function NumberBadge({ n }: { n: number | string }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-xs font-bold text-white shadow-sm shadow-indigo-500/30">
      {n}
    </span>
  );
}

export function SectionHeading({
  n,
  title,
  subtitle,
  action,
}: {
  n: number | string;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <NumberBadge n={n} />
        <div>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
