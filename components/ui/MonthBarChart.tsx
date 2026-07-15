"use client";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface MonthBarDatum {
  month: string; // YYYY-MM
  label: string; // short display label e.g. "Jul"
  value: number;
  isCurrent: boolean;
}

const COLOR_MUTED_LIGHT = "#c3c2b7";
const COLOR_MUTED_DARK = "#52514e";
const COLOR_ACCENT_LIGHT = "#2a78d6";
const COLOR_ACCENT_DARK = "#3987e5";

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

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="15%">
          <XAxis
            dataKey="label"
            axisLine={{ stroke: "#e1e0d9" }}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#898781" }}
          />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#898781" }} />
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
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44} cursor="pointer">
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
                fill={d.month === selectedMonth ? accent : d.isCurrent ? accent : muted}
                fillOpacity={d.month === selectedMonth || d.isCurrent ? 1 : 0.75}
                onClick={() => onSelect(d.month)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
