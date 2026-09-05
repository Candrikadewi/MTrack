"use client";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface MonthBarDatum {
  month: string; // YYYY-MM
  label: string; // short display label e.g. "Jul"
  value: number;
  isCurrent: boolean;
}

const COLOR_MUTED_LIGHT = "#8b8a83";
const COLOR_MUTED_DARK = "#8a8983";
const COLOR_ACCENT_LIGHT = "#2a78d6";
const COLOR_ACCENT_DARK = "#3987e5";
const COLOR_CURRENT_LIGHT = "#f0a93b";
const COLOR_CURRENT_DARK = "#d18a1f";

export function MonthBarChart({
  data,
  onSelect,
  selectedMonth,
  showValueLabels = false,
}: {
  data: MonthBarDatum[];
  onSelect: (month: string) => void;
  selectedMonth: string;
  showValueLabels?: boolean;
}) {
  const isDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const muted = isDark ? COLOR_MUTED_DARK : COLOR_MUTED_LIGHT;
  const accent = isDark ? COLOR_ACCENT_DARK : COLOR_ACCENT_LIGHT;
  const current = isDark ? COLOR_CURRENT_DARK : COLOR_CURRENT_LIGHT;

  return (
    <div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 8, left: -20, bottom: 0 }} barCategoryGap="15%">
            <XAxis
              dataKey="label"
              axisLine={{ stroke: isDark ? "#383835" : "#c3c2b7" }}
              tickLine={false}
              tick={{ fontSize: 12, fill: isDark ? "#a8a7a1" : "#6b6a64" }}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: isDark ? "#a8a7a1" : "#6b6a64" }}
            />
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.15)" }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e1e0d9",
                fontSize: 12,
                background: isDark ? "#1a1a19" : "#fcfcfb",
                color: isDark ? "#ffffff" : "#0b0b0b",
              }}
              formatter={(value) => [`${value} orang`, "Jumlah"]}
            />
            {/* Selection state is the fill (accent vs. muted); "this is the
                real current month" is a separate stroke ring — the two used
                to compete for the same fill color, so a bar could only ever
                show one of the two facts at a time. */}
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44} cursor="pointer" isAnimationActive={false}>
              {showValueLabels && (
                <LabelList
                  dataKey="value"
                  position="top"
                  style={{ fontSize: 11, fill: isDark ? "#c3c2b7" : "#57564f" }}
                />
              )}
              {data.map((d) => (
                <Cell
                  key={d.month}
                  fill={d.month === selectedMonth ? accent : muted}
                  fillOpacity={d.month === selectedMonth ? 1 : 0.8}
                  stroke={d.isCurrent ? current : "transparent"}
                  strokeWidth={2}
                  onClick={() => onSelect(d.month)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Keyboard-reachable fallback for the bar-click selection above — a
          pointer is not the only way to pick a month, matching the chip-row
          pattern used elsewhere on the dashboard (Age Movement, Labor Type
          Movement). */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {data.map((d) => (
          <button
            key={d.month}
            type="button"
            onClick={() => onSelect(d.month)}
            aria-current={d.isCurrent ? "date" : undefined}
            aria-pressed={d.month === selectedMonth}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
              d.month === selectedMonth
                ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-300"
                : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
            }`}
          >
            {d.isCurrent && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />}
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}
