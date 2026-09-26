// Total Manpower: headcount, gender split and position breakdown.
import { Users2 } from "lucide-react";
import { positionBreakdown } from "@/lib/engine/dashboard";
import type { EmployeeRecord } from "@/lib/types";

export function TotalManpowerCard({
  total,
  gender,
  employees,
}: {
  total: number;
  gender: { L: number; P: number };
  employees: EmployeeRecord[];
}) {
  const rows = positionBreakdown(employees);
  return (
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 dark:border-blue-500/20 dark:from-blue-500/10 dark:to-indigo-500/10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center gap-3 sm:border-r sm:border-blue-200/60 sm:pr-5 dark:sm:border-blue-500/20">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm shadow-blue-500/30">
            <Users2 size={18} strokeWidth={2.25} />
          </span>
          <div>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Total Manpower</div>
            <div className="mt-0.5 text-3xl font-bold tabular-nums text-blue-600 dark:text-blue-400">{total}</div>
            <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              L: {gender.L} · P: {gender.P}
            </div>
          </div>
        </div>
        <div className="flex-1 sm:pl-1">
          <div className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400">Breakdown Posisi (Struktural)</div>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">Tidak ada data posisi struktural.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    {r.label}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
