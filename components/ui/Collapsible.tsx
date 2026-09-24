"use client";
import { useId, useState, type ReactNode } from "react";
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
  const panelId = useId();
  return (
    <div className={divider ? "border-t border-slate-200 pt-6 dark:border-slate-800" : ""}>
      <h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500"
        >
          <span className="flex items-start gap-2.5">
            {n !== undefined && <NumberBadge n={n} />}
            <span>
              <span className="block text-base font-bold text-slate-800 dark:text-slate-100">{title}</span>
              {subtitle && <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">{subtitle}</span>}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {badge}
            <ChevronDown size={16} aria-hidden className={`text-slate-500 transition-transform dark:text-slate-400 ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
      </h2>
      {open && (
        <div id={panelId} className="animate-reveal mt-3 space-y-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900">
          {children}
        </div>
      )}
    </div>
  );
}
