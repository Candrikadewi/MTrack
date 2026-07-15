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

  const totalLabel = (props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
    const x = Number(props.x);
    const y = Number(props.y);
    const width = Number(props.width);
    const { index } = props;
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(width) || index === undefined) return null;
    const row = data[index];
    if (!row) return null;
    const total = row.permanen + row.kontrak + row.vokasi;
    return (
      <g>
        <text
          x={x + width / 2}
          y={y - 18}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          fill={isDark ? "#f5f5f4" : "#1c1c1a"}
        >
          {total}
        </text>
        <text x={x + width / 2} y={y - 5} textAnchor="middle" fontSize={9.5} fill={isDark ? "#a3a29c" : "#6b6a63"}>
          {`P:${row.permanen} C:${row.kontrak} V:${row.vokasi}`}
        </text>
      </g>
    );
  };

  return (
    <div className={`${heightClass} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 30, right: 8, left: -20, bottom: 0 }} barCategoryGap="24%">
          <CartesianGrid strokeDasharray="0" vertical={false} stroke={isDark ? "#2c2c2a" : "#e1e0d9"} />
          <XAxis
            dataKey="key"
            axisLine={{ stroke: isDark ? "#383835" : "#c3c2b7" }}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#898781" }}
            interval={0}
            angle={data.length > 5 ? -20 : 0}
            textAnchor={data.length > 5 ? "end" : "middle"}
            height={data.length > 5 ? 50 : 30}
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
            />
          ))}
          {/* Zero-height anchor bar stacked on top, purely to place the total/breakdown label above each bar */}
          <Bar dataKey={() => 0} name="" stackId="composition" fill="transparent" isAnimationActive={false} legendType="none">
            <LabelList content={totalLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
