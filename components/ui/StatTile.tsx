import type { LucideIcon } from "lucide-react";

type Tone = "blue" | "emerald" | "amber" | "violet" | "rose" | "slate";

const TONE_STYLES: Record<Tone, { card: string; iconBg: string; text: string }> = {
  blue: {
    card: "border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 dark:border-blue-500/20 dark:from-blue-500/10 dark:to-indigo-500/10",
    iconBg: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    text: "bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent",
  },
  emerald: {
    card: "border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-teal-500/10",
    iconBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    text: "bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent",
  },
  amber: {
    card: "border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 dark:border-amber-500/20 dark:from-amber-500/10 dark:to-orange-500/10",
    iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    text: "bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent",
  },
  violet: {
    card: "border-violet-100 bg-gradient-to-br from-violet-50 to-purple-50 dark:border-violet-500/20 dark:from-violet-500/10 dark:to-purple-500/10",
    iconBg: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
    text: "bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent",
  },
  rose: {
    card: "border-rose-100 bg-gradient-to-br from-rose-50 to-pink-50 dark:border-rose-500/20 dark:from-rose-500/10 dark:to-pink-500/10",
    iconBg: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
    text: "bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent",
  },
  slate: {
    card: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950",
    iconBg: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
    text: "text-slate-800 dark:text-slate-100",
  },
};

export function StatTile({
  label,
  value,
  sub,
  emphasize = false,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  emphasize?: boolean;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  const resolvedTone: Tone = tone ?? (emphasize ? "blue" : "slate");
  const s = TONE_STYLES[resolvedTone];
  const big = resolvedTone !== "slate";

  return (
    <div className={`rounded-2xl border px-4 py-3.5 transition-transform duration-200 hover:-translate-y-0.5 ${s.card}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
        {Icon && (
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${s.iconBg}`}>
            <Icon size={14} strokeWidth={2.25} />
          </span>
        )}
      </div>
      <div className={big ? `mt-1 text-3xl font-bold tabular-nums ${s.text}` : `mt-1 text-xl font-semibold tabular-nums ${s.text}`}>
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
