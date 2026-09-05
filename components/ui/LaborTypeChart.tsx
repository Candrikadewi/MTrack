"use client";
import { Bar, BarChart, CartesianGrid, Legend, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LaborTypeRow } from "@/lib/engine/dashboard";

// Adjacent same-family sub-codes (B1-4, C1-2, E1-2) previously stepped
// through one hue at close, easily-confused lightness (e.g. B3 vs B4 was
// 1.32:1). Widened the lightness/hue spread within each family — C1-2 and
// E1-2 now clear 3:1 pairwise in both themes; the four-way B family is
// meaningfully more distinct than before but still imperfect (4 mutually
// distinguishable shades in one family is a genuinely hard constraint).
const SERIES = [
  { key: "A", label: "A", light: "#2a78d6", dark: "#3987e5" },
  { key: "B1", label: "B1", light: "#0b5d3a", dark: "#0f8a5f" },
  { key: "B2", label: "B2", light: "#1f9c63", dark: "#22c37f" },
  { key: "B3", label: "B3", light: "#5fbfa0", dark: "#6fdba8" },
  { key: "B4", label: "B4", light: "#c8e6d5", dark: "#c8f0d8" },
  { key: "C1", label: "C1", light: "#4a2f8f", dark: "#7c5cd6" },
  { key: "C2", label: "C2", light: "#c3b3ee", dark: "#c7bbf0" },
  { key: "D", label: "D", light: "#f0a93b", dark: "#d18a1f" },
  { key: "E1", label: "E1", light: "#075c6e", dark: "#0e93ae" },
  { key: "E2", label: "E2", light: "#a3e0ee", dark: "#a8e4f0" },
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
    // A month with no ZPAR snapshot uploaded yet isn't "zero people" — label
    // it as missing data instead of a number, so an empty fiscal-year window
    // reads as "not uploaded" rather than "we lost the headcount".
    if (!row.hasData) {
      return (
        <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={12} fill={isDark ? "#a8a7a1" : "#6b6a64"}>
          –
        </text>
      );
    }
    const total = Object.entries(row)
      .filter(([k]) => k !== "key" && k !== "_labelAnchor" && k !== "hasData")
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
            tick={{ fontSize: 12, fill: isDark ? "#898781" : "#6b6a64" }}
          />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: isDark ? "#898781" : "#6b6a64" }} />
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
