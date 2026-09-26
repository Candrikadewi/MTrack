// Columns outside the schema: the admin decides once to use or ignore each, reused on later
// uploads.
import { Badge } from "@/components/ui/Badge";
import { SegmentedSwitch } from "@/components/ui/SegmentedSwitch";
import { columnDecisionStore } from "@/lib/repo";
import { genId } from "@/lib/storage";
import { type ExtraColumn } from "@/lib/parseFile";
import type { ColumnDecision } from "@/lib/types";

type Decision = ColumnDecision["decision"];

/** Standing decision for an extra column: what the admin chose before, or
 * "ignore" for columns docs/data-schema.md already lists as non-standard. */
export function decisionFor(
  dataset: ColumnDecision["dataset"],
  col: ExtraColumn,
  decisions: ColumnDecision[]
): Decision | undefined {
  return (
    decisions.find((d) => d.dataset === dataset && d.normalized === col.normalized)?.decision ??
    (col.knownNonStandard ? "ignore" : undefined)
  );
}

export function usedColumns(dataset: ColumnDecision["dataset"], cols: ExtraColumn[], decisions: ColumnDecision[]): Set<string> {
  return new Set(cols.filter((c) => decisionFor(dataset, c, decisions) === "use").map((c) => c.normalized));
}

function saveDecision(dataset: ColumnDecision["dataset"], col: ExtraColumn, decision: Decision, decisions: ColumnDecision[]) {
  const existing = decisions.find((d) => d.dataset === dataset && d.normalized === col.normalized);
  const decided_at = new Date().toISOString();
  if (existing) columnDecisionStore.update(existing.id, { decision, decided_at, column_name: col.name });
  else
    columnDecisionStore.insert({
      id: genId("coldec"),
      dataset,
      column_name: col.name,
      normalized: col.normalized,
      decision,
      decided_at,
    });
}

/** Every column outside the known schema gets a Pakai/Abaikan decision,
 * stored once so next month's file doesn't ask again. Upload waits until
 * each one is decided. */
export function ColumnDecisionPanel({
  dataset,
  columns,
  decisions,
}: {
  dataset: ColumnDecision["dataset"];
  columns: ExtraColumn[];
  decisions: ColumnDecision[];
}) {
  if (columns.length === 0) return null;
  const pending = columns.filter((c) => !decisionFor(dataset, c, decisions)).length;
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Kolom di luar skema ({columns.length})</h4>
        {pending > 0 ? (
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            {pending} kolom perlu keputusan sebelum upload
          </span>
        ) : (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">Semua kolom sudah diputuskan</span>
        )}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        <b>Pakai</b>: nilainya disimpan bersama data setiap upload. <b>Abaikan</b>: kolom dilewati. Keputusan disimpan dan berlaku
        untuk upload berikutnya, bisa diubah kapan saja di sini.
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {columns.map((col) => {
          const decision = decisionFor(dataset, col, decisions);
          return (
            <li key={col.normalized} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{col.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {!decision
                    ? "Kolom baru — belum pernah diputuskan"
                    : col.knownNonStandard && !decisions.some((d) => d.dataset === dataset && d.normalized === col.normalized)
                      ? "Non-standar (tercatat di data-schema), default diabaikan"
                      : decision === "use"
                        ? "Dipakai"
                        : "Diabaikan"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!decision && <Badge tone="amber">Perlu keputusan</Badge>}
                <SegmentedSwitch
                  label={`Keputusan kolom ${col.name}`}
                  options={[
                    { value: "use", label: "Pakai" },
                    { value: "ignore", label: "Abaikan" },
                  ]}
                  value={(decision ?? "") as Decision}
                  onChange={(v) => saveDecision(dataset, col, v, decisions)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
