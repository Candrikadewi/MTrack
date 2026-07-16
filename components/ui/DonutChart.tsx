"use client";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Proportion visual (composition splits, fulfilled-vs-open ratios) —
 * complements the existing bar charts, which are for trends over time, not
 * a single-moment share of a whole. */
export function DonutChart({
  data,
  centerLabel,
  centerValue,
  heightClass = "h-36",
}: {
  data: DonutSlice[];
  centerLabel?: string;
  centerValue?: string | number;
  heightClass?: string;
}) {
  const isDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const slices: DonutSlice[] =
    total > 0 ? data : [{ key: "empty", label: "", value: 1, color: isDark ? "#3f3f46" : "#e2e8f0" }];

  return (
    <div className={`relative ${heightClass} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius="64%"
            outerRadius="100%"
            paddingAngle={total > 0 ? 2 : 0}
            stroke="none"
            isAnimationActive={false}
          >
            {slices.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Pie>
          {total > 0 && (
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: `1px solid ${isDark ? "#2c2c2a" : "#e1e0d9"}`,
                fontSize: 12,
                background: isDark ? "#1a1a19" : "#fcfcfb",
                color: isDark ? "#ffffff" : "#0b0b0b",
              }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue !== undefined) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue !== undefined && (
            <div className="text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{centerValue}</div>
          )}
          {centerLabel && <div className="text-center text-[11px] leading-tight text-slate-500 dark:text-slate-400">{centerLabel}</div>}
        </div>
      )}
    </div>
  );
}

/** Legend row to pair with DonutChart — dot + label + value, matching the
 * app's existing tint system rather than Recharts' default legend styling. */
export function DonutLegend({ data }: { data: DonutSlice[] }) {
  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div key={d.key} className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            {d.label}
          </span>
          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{d.value}</span>
        </div>
      ))}
    </div>
  );
}
