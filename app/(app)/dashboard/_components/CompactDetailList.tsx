// A short "label · count" list used under the Dashboard charts.

export function CompactDetailList({ items, unit }: { items: { key: string; count: number }[]; unit: string }) {
  if (items.length === 0) return <p className="text-sm text-slate-600 dark:text-slate-400">Tidak ada {unit} bulan ini.</p>;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {items.map((d) => (
        <span
          key={d.key}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          {d.key}
          <span className="inline-flex min-w-[1.4rem] items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[11px] font-bold text-white dark:bg-blue-500">
            {d.count}
          </span>
        </span>
      ))}
    </div>
  );
}
