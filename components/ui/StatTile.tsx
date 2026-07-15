export function StatTile({
  label,
  value,
  sub,
  emphasize = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={
        emphasize
          ? "rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 px-4 py-3.5 transition-transform duration-200 hover:-translate-y-0.5 dark:border-blue-500/20 dark:from-blue-500/10 dark:to-indigo-500/10"
          : "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 transition-transform duration-200 hover:-translate-y-0.5 dark:border-slate-800 dark:bg-slate-950"
      }
    >
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div
        className={
          emphasize
            ? "mt-1 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-3xl font-bold text-transparent"
            : "mt-1 text-xl font-semibold text-slate-800 dark:text-slate-100"
        }
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div className="w-full">
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">{pct.toFixed(0)}%</div>
    </div>
  );
}
