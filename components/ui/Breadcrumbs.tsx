"use client";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
  onClick?: () => void;
}

/** Back to the Dashboard with its Monitoring tab open — where Project and
 * Takt Time Monitoring are summarised. */
export const DASHBOARD_MONITORING_CRUMB: Crumb = {
  label: "Dashboard",
  href: "/dashboard",
  onClick: () => {
    try {
      window.sessionStorage.setItem("dash.section", JSON.stringify("monitoring"));
    } catch {
      // storage unavailable — the dashboard just opens on its last tab
    }
  },
};

/** Trail back up from a page the sidebar doesn't list (Project / Takt
 * Monitoring and their detail pages): the first crumb, normally Dashboard,
 * carries the back arrow, and every crumb with an href is a link. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, i) => (
          <li key={item.label} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight size={14} aria-hidden className="shrink-0 text-slate-300 dark:text-slate-600" />}
            {item.href ? (
              <Link
                href={item.href}
                onClick={item.onClick}
                className={
                  i === 0
                    ? "inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    : "font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                }
              >
                {i === 0 && <ArrowLeft size={15} aria-hidden />}
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-slate-400 dark:text-slate-500">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
