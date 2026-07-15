import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={`rounded-3xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none dark:hover:shadow-none dark:hover:translate-y-0 ${className}`}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
