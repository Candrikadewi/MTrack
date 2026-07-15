"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CompositionRow } from "@/lib/engine/dashboard";

const SERIES = [
  { key: "permanen", label: "Permanen", light: "#2a78d6", dark: "#3987e5" },
  { key: "kontrak", label: "Kontrak", light: "#1baf7a", dark: "#199e70" },
  { key: "vokasi", label: "Vokasi", light: "#eda100", dark: "#c98500" },
] as const;

export function CompositionChart({ data }: { data: CompositionRow[] }) {
  const isDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

  if (data.length === 0) return null;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="24%">
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
          {SERIES.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="composition"
              fill={isDark ? s.dark : s.light}
              radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={40}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
