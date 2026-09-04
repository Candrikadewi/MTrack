"use client";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AGE_BUCKETS, type AgeMovementCheckpoint } from "@/lib/engine/dashboard";

const BUCKET_COLOR: Record<string, { light: string; dark: string }> = {
  "<20": { light: "#2a78d6", dark: "#3987e5" },
  "21-30": { light: "#0f8a5f", dark: "#16a06e" },
  "31-40": { light: "#1baf7a", dark: "#199e70" },
  "41-50": { light: "#eda100", dark: "#c98500" },
  "51-54": { light: "#d6813a", dark: "#c76e28" },
  "55": { light: "#d6537c", dark: "#c23f68" },
};

export function AgeMovementChart({ data }: { data: AgeMovementCheckpoint[] }) {
  const isDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

  if (data.length === 0) return null;
  const rows = data.map((c) => ({ key: c.key, ...c.buckets, pensiunKumulatif: c.pensiunKumulatif }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 24, right: 8, left: -20, bottom: 0 }} barCategoryGap="24%">
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
          {AGE_BUCKETS.map((b, i) => (
            <Bar
              key={b}
              dataKey={b}
              name={b}
              stackId="age"
              fill={isDark ? BUCKET_COLOR[b].dark : BUCKET_COLOR[b].light}
              radius={i === AGE_BUCKETS.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={56}
              isAnimationActive={false}
            />
          ))}
          <Line
            type="monotone"
            dataKey="pensiunKumulatif"
            name="Pensiun (kumulatif)"
            stroke={isDark ? "#a1a1aa" : "#71717a"}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
