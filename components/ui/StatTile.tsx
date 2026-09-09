import type { LucideIcon } from "lucide-react";

type Tone = "blue" | "emerald" | "amber" | "cyan" | "rose" | "slate";

// Icon badges use the -600 shade (not -500) with a white glyph: -500 tones
// measured under the 3:1 WCAG graphical-contrast minimum for a white icon
// (e.g. emerald-500 ≈ 2.5:1, amber-500 ≈ 2.2:1) — -600 clears it (≥3.2:1)
// while staying visibly the same hue as the card tint.
const TONE_STYLES: Record<Tone, { card: string; iconBg: string; text: string }> = {
  blue: {
    card: "border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 dark:border-blue-500/20 dark:from-blue-500/10 dark:to-indigo-500/10",
    iconBg: "bg-blue-600 text-white shadow-sm shadow-blue-500/30",
    text: "text-blue-600 dark:text-blue-400",
  },
  emerald: {
    card: "border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-teal-500/10",
    iconBg: "bg-emerald-600 text-white shadow-sm shadow-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    card: "border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 dark:border-amber-500/20 dark:from-amber-500/10 dark:to-orange-500/10",
    iconBg: "bg-amber-600 text-white shadow-sm shadow-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
  },
  cyan: {
    card: "border-cyan-100 bg-gradient-to-br from-cyan-50 to-sky-50 dark:border-cyan-500/20 dark:from-cyan-500/10 dark:to-sky-500/10",
    iconBg: "bg-cyan-600 text-white shadow-sm shadow-cyan-500/30",
    text: "text-cyan-600 dark:text-cyan-400",
  },
  rose: {
    card: "border-rose-100 bg-gradient-to-br from-rose-50 to-pink-50 dark:border-rose-500/20 dark:from-rose-500/10 dark:to-pink-500/10",
    iconBg: "bg-rose-600 text-white shadow-sm shadow-rose-500/30",
    text: "text-rose-600 dark:text-rose-400",
  },
  slate: {
    card: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950",
    iconBg: "bg-slate-500 text-white dark:bg-slate-600",
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
        <div className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</div>
        {Icon && (
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${s.iconBg}`}>
            <Icon size={14} strokeWidth={2.25} />
          </span>
        )}
      </div>
      <div className={big ? `mt-1 text-3xl font-bold tabular-nums ${s.text}` : `mt-1 text-xl font-semibold tabular-nums ${s.text}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{sub}</div>}
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
