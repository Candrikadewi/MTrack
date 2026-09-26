// Status of the PKWT review run after a ZPAR upload.
import { Button } from "@/components/ui/Button";
import { type PkwtReviewRun } from "@/lib/engine/actions";

/** Why the PKWT review chart is (or isn't) filled, in one line: what the
 * active snapshot offers, what's stored, and any insert error — plus a
 * manual re-run. */
export function ReviewStatus({
  run,
  reviewCount,
  busy,
  onRun,
}: {
  run: PkwtReviewRun | null;
  reviewCount: number;
  busy: boolean;
  onRun: () => void;
}) {
  return (
    <div
      className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${
        run?.error
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
          : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"
      }`}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="font-semibold text-slate-800 dark:text-slate-100">Review PKWT</div>
        {!run ? (
          <div>{busy ? "Mengecek…" : "Belum dicek."}</div>
        ) : run.period === null ? (
          <div>Belum ada snapshot ZPAR yang Active — review dibuat dari snapshot Active.</div>
        ) : (
          <div>
            Snapshot Active {run.period}: <b>{run.eligible}</b> karyawan Kontrak 1.1/1.2/2
            {run.noTglMasuk > 0 && (
              <>
                {" "}
                · <b>{run.noTglMasuk}</b> tanpa Tgl Masuk (tidak bisa dijadwalkan)
              </>
            )}{" "}
            · <b>{reviewCount}</b> review tersimpan{run.created > 0 && <> · {run.created} baru dibuat</>}
            {run.error && <div className="mt-1 font-semibold">Gagal menyimpan review: {run.error}</div>}
          </div>
        )}
      </div>
      <Button size="sm" variant="secondary" disabled={busy} onClick={onRun}>
        {busy ? "Memproses…" : "Buat ulang review"}
      </Button>
    </div>
  );
}
