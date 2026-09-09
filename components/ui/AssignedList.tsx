import { Badge } from "@/components/ui/Badge";
import type { Demand } from "@/lib/types";

/** Name-by-name assignment list for a Project/Takt Up need-row. Each row's
 * qty expands 1:1 into Demand records (see expandRowToDemands) — so listing
 * each demand's replacement candidate here IS the assignment history for
 * that row, no separate tracking needed. Unfilled slots show as a muted
 * placeholder rather than being omitted, so the count always reads against
 * the row's qty. */
export function AssignedList({ demands }: { demands: Demand[] }) {
  if (demands.length === 0) return <span className="text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {demands.map((d) =>
        d.replacement_nama ? (
          <span
            key={d.id}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {d.replacement_nama} ({d.replacement_noreg})
            <Badge tone={d.status === "Fulfilled" ? "green" : "amber"}>{d.status}</Badge>
          </span>
        ) : (
          <span
            key={d.id}
            className="inline-flex items-center rounded-full border border-dashed border-slate-200 px-2 py-0.5 text-xs text-slate-400 dark:border-slate-700"
          >
            Belum diisi
          </span>
        )
      )}
    </div>
  );
}
