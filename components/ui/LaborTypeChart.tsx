"use client";
import { Bar, BarChart, CartesianGrid, Legend, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LaborTypeRow } from "@/lib/engine/dashboard";

const SERIES = [
  { key: "A", label: "A", light: "#2a78d6", dark: "#3987e5" },
  { key: "B1", label: "B1", light: "#0f8a5f", dark: "#16a06e" },
  { key: "B2", label: "B2", light: "#1baf7a", dark: "#199e70" },
  { key: "B3", label: "B3", light: "#4fc99a", dark: "#2fbd85" },
  { key: "B4", label: "B4", light: "#8adfc0", dark: "#59d1a8" },
  { key: "C1", label: "C1", light: "#7c5cd6", dark: "#8f74e0" },
  { key: "C2", label: "C2", light: "#a996ea", dark: "#b6a5ee" },
  { key: "D", label: "D", light: "#f0a93b", dark: "#d18a1f" },
  { key: "E1", label: "E1", light: "#0891b2", dark: "#0ea5c4" },
  { key: "E2", label: "E2", light: "#5fc9dd", dark: "#38b6cf" },
  { key: "T", label: "T", light: "#6b7280", dark: "#8a93a3" },
  { key: "F", label: "F", light: "#d6537c", dark: "#c23f68" },
  { key: "Vokasi", label: "Vokasi", light: "#8b5cf6", dark: "#a78bfa" },
] as const;

export function LaborTypeChart({ data }: { data: LaborTypeRow[] }) {
  const isDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

  if (data.length === 0) return null;
  const presentSeries = SERIES.filter((s) => data.some((row) => row[s.key] !== undefined));

  // A category's sub-codes vary in which ones are present (only B rows carry
  // B1-4, etc.), so there's no single real series to reliably pin a label
  // to — and any series can be legitimately 0/absent for a given bar, which
  // Recharts skips rendering (and labelling) entirely. Stack one extra,
  // always-non-zero synthetic field on top and label that instead.
  const augmented = data.map((row) => ({ ...row, _labelAnchor: 0.0001 }));

  function totalLabel(props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) {
    // See CompositionChart's totalLabel for why `index` (not `payload`) is
    // the reliable way to recover the full row here.
    const x = Number(props.x);
    const y = Number(props.y);
    const width = Number(props.width);
    const row = props.index !== undefined ? data[props.index] : undefined;
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(width) || !row) return null;
    const total = Object.entries(row)
      .filter(([k]) => k !== "key" && k !== "_labelAnchor")
      .reduce((sum, [, v]) => sum + (typeof v === "number" ? v : 0), 0);
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill={isDark ? "#f5f5f4" : "#1c1c1a"}>
        {total}
      </text>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={augmented} margin={{ top: 24, right: 8, left: -20, bottom: 0 }} barCategoryGap="24%">
          <CartesianGrid strokeDasharray="0" vertical={false} stroke={isDark ? "#2c2c2a" : "#e1e0d9"} />
          <XAxis
            dataKey="key"
            axisLine={{ stroke: isDark ? "#383835" : "#c3c2b7" }}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#898781" }}
          />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#898781" }} />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.12)" }}
            contentStyle={{
              borderRadius: 8,
              border: `1px solid ${isDark ? "#2c2c2a" : "#e1e0d9"}`,
              fontSize: 12,
              background: isDark ? "#1a1a19" : "#fcfcfb",
              color: isDark ? "#ffffff" : "#0b0b0b",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
          {presentSeries.map((s, i, arr) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="labor"
              fill={isDark ? s.dark : s.light}
              radius={i === arr.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={48}
              isAnimationActive={false}
            />
          ))}
          <Bar
            dataKey="_labelAnchor"
            name=""
            stackId="labor"
            fill="transparent"
            isAnimationActive={false}
            legendType="none"
            minPointSize={2}
          >
            <LabelList content={totalLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
