"use client";
import { Bar, BarChart, CartesianGrid, Legend, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CompositionRow } from "@/lib/engine/dashboard";

const SERIES = [
  { key: "permanen", label: "Permanen", light: "#2a78d6", dark: "#3987e5" },
  { key: "kontrak", label: "Kontrak", light: "#1baf7a", dark: "#199e70" },
  { key: "vokasi", label: "Vokasi", light: "#eda100", dark: "#c98500" },
] as const;

export function CompositionChart({ data, heightClass = "h-72" }: { data: CompositionRow[]; heightClass?: string }) {
  const isDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

  if (data.length === 0) return null;

  // Any of permanen/kontrak/vokasi can legitimately be 0 for a given month,
  // and Recharts skips rendering (and labelling) a stacked segment whose
  // value is 0 — so the total label can't be pinned to any one real series.
  // Instead stack one extra, always-non-zero synthetic field on top and
  // label that; its height is negligible so it doesn't visibly affect the bar.
  const augmented = data.map((row) => ({ ...row, _labelAnchor: 0.0001 }));

  function totalLabel(props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) {
    // Recharts' `content` render prop filters entry props down to actual SVG
    // attributes before forwarding them (see svgPropertiesAndEvents) — a
    // `payload` prop is NOT one of those, so it never reaches here. `index`
    // does survive, and since every row always has this anchor field (unlike
    // sparse real series), index reliably maps back into our own `data`.
    const x = Number(props.x);
    const y = Number(props.y);
    const width = Number(props.width);
    const row = props.index !== undefined ? data[props.index] : undefined;
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(width) || !row) return null;
    // A month with no ZPAR snapshot uploaded yet isn't "zero people" — label
    // it as missing data instead of a number.
    if (!row.hasData) {
      return (
        <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={12} fill={isDark ? "#a8a7a1" : "#6b6a64"}>
          –
        </text>
      );
    }
    const total = row.permanen + row.kontrak + row.vokasi;
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill={isDark ? "#f5f5f4" : "#1c1c1a"}>
        {total}
      </text>
    );
  }

  return (
    <div className={`${heightClass} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={augmented} margin={{ top: 24, right: 8, left: -20, bottom: 0 }} barCategoryGap="24%">
          <CartesianGrid strokeDasharray="0" vertical={false} stroke={isDark ? "#2c2c2a" : "#e1e0d9"} />
          <XAxis
            dataKey="key"
            axisLine={{ stroke: isDark ? "#383835" : "#c3c2b7" }}
            tickLine={false}
            tick={{ fontSize: 11, fill: isDark ? "#898781" : "#6b6a64" }}
            interval={0}
            angle={data.length > 5 ? -20 : 0}
            textAnchor={data.length > 5 ? "end" : "middle"}
            height={data.length > 5 ? 50 : 30}
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
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          {SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="composition"
              fill={isDark ? s.dark : s.light}
              radius={s.key === "vokasi" ? [4, 4, 0, 0] : 0}
              maxBarSize={40}
              isAnimationActive={false}
            />
          ))}
          <Bar
            dataKey="_labelAnchor"
            name=""
            stackId="composition"
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
