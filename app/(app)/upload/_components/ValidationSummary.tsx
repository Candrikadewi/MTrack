// What an uploaded file's check found: missing, unknown and ignored columns.
import { Badge } from "@/components/ui/Badge";
import { type ColumnCheck, type SkipBreakdown } from "@/lib/parseFile";

function ColumnChips({ items, tone }: { items: string[]; tone: "red" | "amber" | "slate" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <Badge key={c} tone={tone}>
          {c}
        </Badge>
      ))}
    </div>
  );
}

/** Pre-commit validation preview — how many rows will actually be used and
 * why the rest won't, before anything is written. Only EG not Active and an
 * unrecognised Status exclude a row; everything else here (area counts,
 * data-quality flags, column drift) is informational. */
export function ValidationSummary({
  totalRows,
  included,
  skipBreakdown,
  columns,
}: {
  totalRows: number;
  included: number;
  skipBreakdown: SkipBreakdown;
  columns?: ColumnCheck;
}) {
  const reasonEntries = Object.entries(skipBreakdown.reasons);
  const warningEntries = Object.entries(skipBreakdown.warnings);
  const plantEntries = Object.entries(skipBreakdown.plantCounts).sort((a, b) => b[1] - a[1]);
  const heading = "mb-1 text-xs font-semibold text-slate-600 dark:text-slate-400";
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-slate-600 dark:text-slate-300">
          Total baris: <b className="text-slate-800 dark:text-slate-100">{totalRows}</b>
        </span>
        <span className="text-emerald-700 dark:text-emerald-400">
          Akan diupload: <b>{included}</b>
        </span>
        {totalRows - included > 0 && (
          <span className="text-amber-700 dark:text-amber-400">
            Dilewati: <b>{totalRows - included}</b>
          </span>
        )}
      </div>

      {columns && columns.missingRequired.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
          <div className="mb-1 text-xs font-semibold text-red-800 dark:text-red-200">
            Kolom yang dipakai aplikasi tidak ada di file — datanya akan kosong. Cek lagi file export-nya:
          </div>
          <ColumnChips items={columns.missingRequired} tone="red" />
        </div>
      )}

      {reasonEntries.length > 0 && (
        <div>
          <div className={heading}>Alasan dilewati:</div>
          <ul className="space-y-0.5 text-xs text-slate-700 dark:text-slate-300">
            {reasonEntries.map(([reason, count]) => (
              <li key={reason}>
                {reason}: <b>{count}</b> baris
              </li>
            ))}
          </ul>
        </div>
      )}

      {plantEntries.length > 0 && (
        <div>
          <div className={heading}>Segregasi area (Pers Area) dari baris yang diupload:</div>
          <div className="flex flex-wrap gap-1.5">
            {plantEntries.map(([label, count]) => (
              <Badge key={label} tone={label.startsWith("(") ? "amber" : "slate"}>
                {label}: {count}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {warningEntries.length > 0 && (
        <div>
          <div className={heading}>Perlu dicek (baris tetap diupload):</div>
          <ul className="space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
            {warningEntries.map(([label, count]) => (
              <li key={label}>
                {label}: <b>{count}</b> baris
              </li>
            ))}
          </ul>
        </div>
      )}

      {columns && columns.missingBaseline.length > 0 && (
        <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
          <div className={heading}>Kolom baseline skema ZPAR yang tidak ada di file ini (cek export-nya):</div>
          <ColumnChips items={columns.missingBaseline} tone="slate" />
        </div>
      )}
    </div>
  );
}
