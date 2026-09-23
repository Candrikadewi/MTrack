"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { NumberBadge } from "@/components/ui/SectionHeading";

/** A section that starts folded — used for the less-frequently-needed
 * pieces folded into a consolidated page (e.g. Demand's Enrollment Review)
 * so the page doesn't force everyone to scroll past it every visit. The
 * clickable header sits outside the bordered box — only the expanded
 * content gets the box — so an optional section number badge reads the
 * same as every other section heading on the page, not nested a level in. */
export function CollapsibleSection({
  n,
  title,
  subtitle,
  defaultOpen = false,
  badge,
  divider = true,
  children,
}: {
  n?: number | string;
  title: ReactNode;
  subtitle?: ReactNode;
  defaultOpen?: boolean;
  badge?: ReactNode;
  /** Thin rule above the header, separating this section from the one
   * before it — off for a page's first section. */
  divider?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={divider ? "border-t border-slate-200 pt-6 dark:border-slate-800" : ""}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="flex items-start gap-2.5">
          {n !== undefined && <NumberBadge n={n} />}
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge}
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="mt-3 space-y-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900">
          {children}
        </div>
      )}
    </div>
  );
}
