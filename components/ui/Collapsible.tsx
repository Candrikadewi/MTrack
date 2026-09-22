"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** A section that starts folded — used for the less-frequently-needed
 * pieces folded into a consolidated page (e.g. Demand's Enrollment Review)
 * so the page doesn't force everyone to scroll past it every visit. */
export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  badge,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge}
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && <div className="space-y-4 border-t border-slate-100 px-5 py-4 dark:border-slate-800">{children}</div>}
    </div>
  );
}
