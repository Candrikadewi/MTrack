import type { ReactNode } from "react";

export interface RatioCounts {
  permanen: number;
  kontrak: number;
  vokasi: number;
}

/** Permanen=green / Kontrak(PKWT+AKTI)=amber / Vokasi=violet — same
 * convention as MP_STATUS_TONE elsewhere in the app. */
const SEGMENT_COLOR = { permanen: "#10b981", kontrak: "#f59e0b", vokasi: "#8b5cf6" };

function ratioLabel(counts: RatioCounts): string {
  const { permanen, kontrak, vokasi } = counts;
  const g = [permanen, kontrak, vokasi].filter((n) => n > 0).reduce((a, b) => gcd(a, b), Math.max(permanen, kontrak, vokasi, 1));
  if (g <= 1) return `${permanen} : ${kontrak} : ${vokasi}`;
  return `${permanen / g} : ${kontrak / g} : ${vokasi / g}`;
}

function gcd(a: number, b: number): number {
  if (b === 0) return a || 1;
  return gcd(b, a % b);
}

function RatioBar({ counts }: { counts: RatioCounts }) {
  const total = counts.permanen + counts.kontrak + counts.vokasi;
  if (total === 0) {
    return <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800" />;
  }
  const pct = (n: number) => (n / total) * 100;
  return (
    <div
      role="img"
      aria-label={`Permanen ${counts.permanen}, Kontrak ${counts.kontrak}, Vokasi ${counts.vokasi}`}
      className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
    >
      {(["permanen", "kontrak", "vokasi"] as const).map(
        (k) =>
          counts[k] > 0 && (
            <div
              key={k}
              style={{ width: `${pct(counts[k])}%`, backgroundColor: SEGMENT_COLOR[k] }}
              title={`${k}: ${counts[k]}`}
            />
          )
      )}
    </div>
  );
}

function Legend({ counts }: { counts: RatioCounts }) {
  const total = counts.permanen + counts.kontrak + counts.vokasi;
  const items: { key: keyof RatioCounts; label: string }[] = [
    { key: "permanen", label: "Permanen" },
    { key: "kontrak", label: "Kontrak" },
    { key: "vokasi", label: "Vokasi" },
  ];
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
      {items.map(({ key, label }) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEGMENT_COLOR[key] }} />
          {label} <span className="font-medium text-slate-700 dark:text-slate-200">{counts[key]}</span>
          {total > 0 && <span className="text-slate-500 dark:text-slate-400">({Math.round((counts[key] / total) * 100)}%)</span>}
        </span>
      ))}
    </div>
  );
}

/** "Rasio Permanen:Kontrak:Vokasi — Saat Ini" — current-state only, no
 * projection/what-if math. Used on the Dashboard and on Demand's Enrollment
 * Review section; both pass in already filter-scoped counts (unfiltered =
 * whole plant), so this component itself has no filter awareness of its
 * own — it just renders whatever counts it's given. */
export function RatioWidget({
  title = "Rasio Permanen : Kontrak : Vokasi",
  subtitle,
  counts,
  scopeLabel,
}: {
  title?: string;
  subtitle?: string;
  counts: RatioCounts;
  scopeLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {scopeLabel && <span className="text-xs text-slate-500 dark:text-slate-400">{scopeLabel}</span>}
          <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">{ratioLabel(counts)}</span>
        </div>
      </div>
      <RatioBar counts={counts} />
      <div className="mt-2">
        <Legend counts={counts} />
      </div>
    </div>
  );
}

/** Stacked ratio bars, one per scenario (Demand uses Sekarang vs Proyeksi),
 * so the shift in composition reads bar against bar. Callers compute each
 * scenario's counts; this component only lays them out. */
export function RatioScenarioCompare({
  scenarios,
  scopeLabel,
}: {
  scenarios: { label: string; counts: RatioCounts; hint?: ReactNode }[];
  scopeLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Rasio Permanen : Kontrak : Vokasi — Sekarang vs Proyeksi
        </h3>
        {scopeLabel && <span className="text-xs text-slate-500 dark:text-slate-400">{scopeLabel}</span>}
      </div>
      <div className="space-y-3">
        {scenarios.map((s) => (
          <div key={s.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{s.label}</span>
              <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">{ratioLabel(s.counts)}</span>
            </div>
            <RatioBar counts={s.counts} />
            {s.hint && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{s.hint}</div>}
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
        <Legend counts={scenarios[0]?.counts ?? { permanen: 0, kontrak: 0, vokasi: 0 }} />
      </div>
    </div>
  );
}
