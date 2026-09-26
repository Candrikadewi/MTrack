// Vokasi batches uploaded without Tanggal Masuk: fill it in per batch.
import { Input } from "@/components/ui/Form";
import { type VokasiParseResult } from "@/lib/parseFile";
import { computeVokasiEndedDate, fmtDate } from "@/lib/engine/compute";

/** Rows whose Tgl Masuk cell is blank get one date per batch, filled here:
 * pre-set to the date the rest of that batch carries, editable, and
 * required before upload when the batch has no date at all. */
export function BlankTglPanel({
  batches,
  values,
  onChange,
}: {
  batches: VokasiParseResult["blankTglBatches"];
  values: Record<string, string>;
  onChange: (batch: string, date: string) => void;
}) {
  if (batches.length === 0) return null;
  const pending = batches.filter((b) => !values[b.batch]).length;
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Tgl Masuk kosong ({batches.length} batch)</h4>
        {pending > 0 ? (
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{pending} batch perlu diisi sebelum upload</span>
        ) : (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">Semua sudah terisi</span>
        )}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Tgl Masuk berlaku satu tanggal per batch dan menentukan tanggal berakhir (6 bulan − 1 hari). Cek tanggal yang disarankan, ubah
        bila perlu.
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {batches.map((b) => {
          const value = values[b.batch] ?? "";
          return (
            <li key={b.batch} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  Batch {b.batch}{" "}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    · {b.blank} dari {b.total} baris kosong
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {b.suggested
                    ? value === b.suggested
                      ? `Disarankan dari baris lain di batch ini: ${fmtDate(b.suggested)}`
                      : `Diubah (saran: ${fmtDate(b.suggested)})`
                    : "Tidak ada tanggal di batch ini — isi manual"}
                  {value && <> · berakhir {fmtDate(computeVokasiEndedDate(value))}</>}
                </div>
              </div>
              <Input
                type="date"
                value={value}
                aria-label={`Tgl Masuk batch ${b.batch}`}
                aria-invalid={!value || undefined}
                onChange={(e) => onChange(b.batch, e.target.value)}
                className={`w-44 ${value ? "" : "border-amber-400 dark:border-amber-500"}`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
