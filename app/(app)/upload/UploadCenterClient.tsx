"use client";
import { useCallback, useEffect, useState } from "react";
import { addMonths, format } from "date-fns";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { SegmentedSwitch } from "@/components/ui/SegmentedSwitch";
import { useStoreList, useStoreReady } from "@/lib/useStore";
import {
  zparStore,
  vokasiStore,
  columnDecisionStore,
  valueMappingStore,
  demandStore,
  pkwtReviewStore,
  utilPoolStore,
  activateSnapshot,
  clearAllData,
} from "@/lib/repo";
import { genId } from "@/lib/storage";
import {
  VOKASI_SHOPS,
  finalizeVokasiRecord,
  keepUsedExtra,
  parseVokasiFile,
  parseZparFile,
  type ColumnCheck,
  type ExtraColumn,
  type SkipBreakdown,
  type VokasiParseResult,
  type VokasiShopValue,
} from "@/lib/parseFile";
import {
  autoMatchVokasiBatch,
  deleteVokasiBatch,
  deleteZparSnapshot,
  ensureVokasiEndedDemands,
  generatePkwtReviews,
  pruneStaleVokasiDemands,
  type PkwtReviewRun,
} from "@/lib/engine/actions";
import { computeVokasiEndedDate, fmtDate } from "@/lib/engine/compute";
import { createClient } from "@/lib/supabase/client";
import { pushToast } from "@/lib/toast";
import { useSessionState } from "@/lib/useSessionState";
import type { ColumnDecision, ValueMapping, VokasiRecord } from "@/lib/types";

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
function ValidationSummary({
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

type Decision = ColumnDecision["decision"];

/** Standing decision for an extra column: what the admin chose before, or
 * "ignore" for columns docs/data-schema.md already lists as non-standard. */
function decisionFor(dataset: ColumnDecision["dataset"], col: ExtraColumn, decisions: ColumnDecision[]): Decision | undefined {
  return decisions.find((d) => d.dataset === dataset && d.normalized === col.normalized)?.decision ?? (col.knownNonStandard ? "ignore" : undefined);
}

function usedColumns(dataset: ColumnDecision["dataset"], cols: ExtraColumn[], decisions: ColumnDecision[]): Set<string> {
  return new Set(cols.filter((c) => decisionFor(dataset, c, decisions) === "use").map((c) => c.normalized));
}

function saveDecision(dataset: ColumnDecision["dataset"], col: ExtraColumn, decision: Decision, decisions: ColumnDecision[]) {
  const existing = decisions.find((d) => d.dataset === dataset && d.normalized === col.normalized);
  const decided_at = new Date().toISOString();
  if (existing) columnDecisionStore.update(existing.id, { decision, decided_at, column_name: col.name });
  else columnDecisionStore.insert({ id: genId("coldec"), dataset, column_name: col.name, normalized: col.normalized, decision, decided_at });
}

/** Every column outside the known schema gets a Pakai/Abaikan decision,
 * stored once so next month's file doesn't ask again. Upload waits until
 * each one is decided. */
function ColumnDecisionPanel({
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
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{pending} kolom perlu keputusan sebelum upload</span>
        ) : (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">Semua kolom sudah diputuskan</span>
        )}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        <b>Pakai</b>: nilainya disimpan bersama data setiap upload. <b>Abaikan</b>: kolom dilewati. Keputusan disimpan dan berlaku untuk
        upload berikutnya, bisa diubah kapan saja di sini.
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

/** Standard shop for a raw value: itself when already standard, else the
 * confirmed mapping ("" = skip those rows), else undefined (unconfirmed). */
function resolveShop(v: VokasiShopValue, mappings: ValueMapping[]): string | undefined {
  if (v.standard) return v.standard;
  return mappings.find((m) => m.dataset === "vokasi" && m.field === "shop" && m.normalized_raw === v.key)?.mapped_value;
}

function saveShopMapping(v: VokasiShopValue, mapped: string, mappings: ValueMapping[]) {
  const existing = mappings.find((m) => m.dataset === "vokasi" && m.field === "shop" && m.normalized_raw === v.key);
  const decided_at = new Date().toISOString();
  if (existing) valueMappingStore.update(existing.id, { mapped_value: mapped, decided_at });
  else
    valueMappingStore.insert({
      id: genId("valmap"),
      dataset: "vokasi",
      field: "shop",
      raw_value: v.raw,
      normalized_raw: v.key,
      mapped_value: mapped,
      decided_at,
    });
}

/** Non-standard SHOP spellings (e.g. "ASSEMMBLY") are never corrected
 * silently: each is shown with the closest standard shop and saved only
 * once confirmed, then reused on every later upload. */
function ShopMappingPanel({ values, mappings }: { values: VokasiShopValue[]; mappings: ValueMapping[] }) {
  const nonStandard = values.filter((v) => !v.standard);
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (nonStandard.length === 0) return null;
  const pending = nonStandard.filter((v) => resolveShop(v, mappings) === undefined).length;
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Shop tidak standar ({nonStandard.length})</h4>
        {pending > 0 ? (
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{pending} perlu dikonfirmasi sebelum upload</span>
        ) : (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">Semua sudah dikonfirmasi</span>
        )}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Kemungkinan typo. Pilih Shop standar yang benar lalu konfirmasi — dipakai untuk menentukan Div/Dept dan disimpan untuk upload berikutnya.
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {nonStandard.map((v) => {
          const confirmed = resolveShop(v, mappings);
          const value = draft[v.key] ?? confirmed ?? v.suggestion;
          return (
            <li key={v.key} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  &ldquo;{v.raw}&rdquo; <span className="text-xs font-normal text-slate-500 dark:text-slate-400">· {v.count} baris</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {confirmed === undefined
                    ? `Dugaan: ${v.suggestion}`
                    : confirmed === ""
                      ? "Dikonfirmasi: bukan shop valid, baris dilewati"
                      : `Dikonfirmasi: ${confirmed}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={value}
                  aria-label={`Shop standar untuk ${v.raw}`}
                  onChange={(e) => setDraft((d) => ({ ...d, [v.key]: e.target.value }))}
                  className="w-48"
                >
                  {VOKASI_SHOPS.map((sh) => (
                    <option key={sh} value={sh}>
                      {sh}
                    </option>
                  ))}
                  <option value="">— bukan shop, lewati baris —</option>
                </Select>
                <Button
                  size="sm"
                  variant={confirmed === undefined ? "primary" : "secondary"}
                  disabled={confirmed === value}
                  onClick={() => saveShopMapping(v, value, mappings)}
                >
                  {confirmed === undefined ? "Konfirmasi" : "Simpan"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Rows whose Tgl Masuk cell is blank get one date per batch, filled here:
 * pre-set to the date the rest of that batch carries, editable, and
 * required before upload when the batch has no date at all. */
function BlankTglPanel({
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

/** Why the PKWT review chart is (or isn't) filled, in one line: what the
 * active snapshot offers, what's stored, and any insert error — plus a
 * manual re-run. */
function ReviewStatus({
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

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/** ZPAR cadence (docs/data-schema.md): 2019–2025 history exists only as
 * March snapshots; from 2026 onward ZPAR arrives every month. Options run
 * from 2 months ahead back through the monthly era, then the March history. */
const ZPAR_MONTHLY_FROM = "2026-01";
const ZPAR_HISTORY_FIRST_YEAR = 2019;

function zparPeriodOptions(): string[] {
  const base = new Date(`${currentMonthKey()}-01T00:00:00`);
  const out: string[] = [];
  for (let i = 0; ; i++) {
    const m = format(addMonths(base, 2 - i), "yyyy-MM");
    if (m < ZPAR_MONTHLY_FROM) break;
    out.push(m);
  }
  const lastHistoryYear = Number(ZPAR_MONTHLY_FROM.slice(0, 4)) - 1;
  for (let y = lastHistoryYear; y >= ZPAR_HISTORY_FIRST_YEAR; y--) out.push(`${y}-03`);
  return out;
}

export function UploadCenterClient() {
  // Copy before sort — list() returns the store's live cache array, and
  // sorting it in place would mutate that shared reference during render.
  // Newest period first — a starting file lands many periods with the same
  // upload time, so upload_date alone leaves them in arbitrary order.
  const snapshots = [...useStoreList(zparStore)].sort(
    (a, b) => b.period.localeCompare(a.period) || b.upload_date.localeCompare(a.upload_date)
  );
  const vokasiRecords = useStoreList(vokasiStore);
  const decisions = useStoreList(columnDecisionStore);
  const valueMappings = useStoreList(valueMappingStore);

  const takenPeriods = new Set(snapshots.map((s) => s.period));

  const [zparPeriod, setZparPeriod] = useState(() => {
    const options = zparPeriodOptions();
    return options.find((m) => !takenPeriods.has(m)) ?? options[0];
  });
  const [zparFile, setZparFile] = useState<File | null>(null);
  const [zparBusy, setZparBusy] = useState(false);
  const [zparMsg, setZparMsg] = useState("");
  const [zparPreview, setZparPreview] = useState<Awaited<ReturnType<typeof parseZparFile>> | null>(null);

  const [selPeriods, setSelPeriods] = useSessionState<string[]>("upload.zpar.periods", []);
  const periodOptions = Array.from(takenPeriods).sort().reverse();
  const filteredSnapshots = selPeriods.length === 0 ? snapshots : snapshots.filter((s) => selPeriods.includes(s.period));

  const [vokasiBatch, setVokasiBatch] = useState("");
  const [vokasiTglMasuk, setVokasiTglMasuk] = useState(new Date().toISOString().slice(0, 10));
  const [vokasiFile, setVokasiFile] = useState<File | null>(null);
  const [vokasiBusy, setVokasiBusy] = useState(false);
  const [vokasiMsg, setVokasiMsg] = useState("");
  const [vokasiPreview, setVokasiPreview] = useState<Awaited<ReturnType<typeof parseVokasiFile>> | null>(null);
  const [vokasiTglFill, setVokasiTglFill] = useState<Record<string, string>>({});

  const [resetModalOpen, setResetModalOpen] = useState(false);

  // Self-healing on open, once every store it reads is hydrated (the
  // existing-row checks would otherwise duplicate): PKWT reviews for the
  // active snapshot are (re)generated — a single bad Tgl Masuk used to abort
  // the whole run — and stale history demands from an earlier Vokasi
  // starting upload are cleaned up. Both are idempotent.
  const storesReady = [
    useStoreReady(zparStore),
    useStoreReady(pkwtReviewStore),
    useStoreReady(demandStore),
    useStoreReady(vokasiStore),
    useStoreReady(utilPoolStore),
  ].every(Boolean);
  const reviews = useStoreList(pkwtReviewStore);
  const [reviewRun, setReviewRun] = useState<PkwtReviewRun | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const runReviews = useCallback(() => {
    setReviewBusy(true);
    generatePkwtReviews()
      .then(setReviewRun)
      .finally(() => setReviewBusy(false));
  }, []);
  useEffect(() => {
    if (!storesReady) return;
    generatePkwtReviews().then(setReviewRun);
    pruneStaleVokasiDemands();
    // Vokasi uploaded while new demands were still being rejected (blank
    // dates) never got theirs; idempotent, so safe on every open.
    void ensureVokasiEndedDemands();
  }, [storesReady]);

  function activateAndRefresh(id: string) {
    activateSnapshot(id);
    runReviews();
  }

  const batches = Array.from(new Set(vokasiRecords.map((v) => v.batch))).map((batch) => {
    const rows = vokasiRecords.filter((v) => v.batch === batch);
    return { batch, count: rows.length, upload_date: rows[0]?.upload_date ?? "" };
  });

  function handleZparFileChange(file: File | null) {
    setZparFile(file);
    setZparPreview(null);
    setZparMsg("");
  }

  async function handleCheckZpar() {
    if (!zparFile) return;
    setZparBusy(true);
    setZparMsg("");
    try {
      const result = await parseZparFile(zparFile);
      setZparPreview(result);
      // The file knows its own snapshot month — pick it instead of trusting
      // whatever the dropdown happened to be on.
      const valid = new Set(zparPeriodOptions());
      const usable = result.periods.filter((p) => valid.has(p.period));
      const filePeriod = usable.find((p) => !takenPeriods.has(p.period))?.period ?? usable[0]?.period;
      if (filePeriod) setZparPeriod(filePeriod);
    } catch (e) {
      setZparMsg(`Gagal parsing file: ${(e as Error).message}`);
    } finally {
      setZparBusy(false);
    }
  }

  const zparValidPeriods = new Set(zparPeriodOptions());
  const zparMultiPeriod = (zparPreview?.periods.length ?? 0) > 1;
  const zparFilePeriods = zparPreview?.periods.map((p) => p.period) ?? [];
  const zparPeriodMismatch = Boolean(zparPreview && !zparMultiPeriod && zparFilePeriods.length > 0 && !zparFilePeriods.includes(zparPeriod));
  const zparOffSchedule = zparFilePeriods.filter((p) => !zparValidPeriods.has(p));
  /** What one click would upload: every on-schedule, not-yet-uploaded
   * period of a multi-period (starting) file, or the selected period. */
  const zparPlan: { period: string; count: number }[] = zparPreview
    ? zparMultiPeriod
      ? zparPreview.periods.filter((p) => zparValidPeriods.has(p.period) && !takenPeriods.has(p.period))
      : takenPeriods.has(zparPeriod)
        ? []
        : [{ period: zparPeriod, count: zparPreview.employees.length }]
    : [];
  const zparPlanRows = zparPlan.reduce((sum, p) => sum + p.count, 0);
  const zparPendingColumns = zparPreview ? zparPreview.columns.extra.filter((c) => !decisionFor("zpar", c, decisions)).length : 0;

  function handleZparUpload() {
    if (!zparFile || !zparPreview || zparPlan.length === 0 || zparPendingColumns > 0) return;
    const used = usedColumns("zpar", zparPreview.columns.extra, decisions);
    const upload_date = new Date().toISOString();
    const created = zparPlan.map(({ period }) => {
      const source = zparMultiPeriod ? zparPreview.employeesByPeriod[period] ?? [] : zparPreview.employees;
      const snapshot = {
        id: genId("zpar"),
        period,
        filename: zparFile.name,
        upload_date,
        is_active: false,
        employees: source.map(({ extra, ...e }) => {
          const kept = keepUsedExtra(extra, used);
          return kept ? { ...e, extra: kept } : e;
        }),
      };
      zparStore.insert(snapshot);
      return snapshot;
    });
    // First data in: the latest period becomes the active one. After that
    // the admin chooses which snapshot is active.
    if (!snapshots.some((s) => s.is_active)) {
      const latest = created.reduce((a, b) => (b.period > a.period ? b : a));
      activateAndRefresh(latest.id);
    }
    const labels = created.map((c) => format(new Date(`${c.period}-01T00:00:00`), "MMM yyyy")).join(", ");
    const skippedTaken = zparMultiPeriod ? zparFilePeriods.filter((p) => takenPeriods.has(p)) : [];
    setZparMsg(
      `Berhasil upload ${created.length} periode (${labels}), total ${zparPlanRows} employee.` +
        (skippedTaken.length ? ` Dilewati karena sudah ada: ${skippedTaken.join(", ")}.` : "")
    );
    setZparFile(null);
    setZparPreview(null);
  }

  function handleDeleteSnapshot(id: string, period: string) {
    if (!confirm(`Hapus snapshot ZPAR periode ${period}? Tindakan ini tidak bisa dibatalkan.`)) return;
    const result = deleteZparSnapshot(id);
    if (!result.ok) pushToast(result.error ?? "Gagal menghapus snapshot.");
  }

  function handleVokasiFileChange(file: File | null) {
    setVokasiFile(file);
    setVokasiPreview(null);
    setVokasiMsg("");
  }

  async function handleCheckVokasi() {
    if (!vokasiFile || !vokasiTglMasuk) return;
    setVokasiBusy(true);
    setVokasiMsg("");
    try {
      const result = await parseVokasiFile(vokasiFile, vokasiTglMasuk);
      setVokasiPreview(result);
      setVokasiTglFill(Object.fromEntries(result.blankTglBatches.map((b) => [b.batch, b.suggested])));
    } catch (e) {
      setVokasiMsg(`Gagal parsing file: ${(e as Error).message}`);
    } finally {
      setVokasiBusy(false);
    }
  }

  const vokasiExistingKeys = new Set(vokasiRecords.map((v) => `${v.noreg}|${v.batch}`));
  /** Vokasi is cumulative: resolve each row's batch (file column, else the
   * batch typed above), then drop anything already in the database or
   * repeated within the file. */
  const vokasiShopByKey = new Map((vokasiPreview?.shopValues ?? []).map((v) => [v.key, resolveShop(v, valueMappings)]));
  const vokasiPendingShops = Array.from(vokasiShopByKey.values()).filter((v) => v === undefined).length;
  const vokasiSkippedShop = vokasiPreview
    ? vokasiPreview.records.filter((r) => vokasiShopByKey.get(r.shop) === "").length
    : 0;
  const vokasiResolved = vokasiPreview
    ? vokasiPreview.records
        .map((r, i) => {
          if (!vokasiPreview.tglBlank[i]) return r;
          const tgl = vokasiTglFill[r.batch] ?? "";
          return { ...r, tgl_masuk: tgl, tgl_ended: computeVokasiEndedDate(tgl) };
        })
        .filter((r) => vokasiShopByKey.get(r.shop))
        .map((r) => finalizeVokasiRecord({ ...r, batch: r.batch || vokasiBatch.trim() }, vokasiShopByKey.get(r.shop) as string))
    : [];
  const vokasiNoDept = vokasiResolved.filter((r) => !r.dept).length;
  const vokasiMissingBatch = vokasiResolved.filter((r) => !r.batch).length;
  const vokasiNew: typeof vokasiResolved = [];
  let vokasiDuplicates = 0;
  {
    const seen = new Set<string>();
    for (const r of vokasiResolved) {
      if (!r.batch) continue;
      const key = `${r.noreg}|${r.batch}`;
      if (vokasiExistingKeys.has(key) || seen.has(key)) vokasiDuplicates++;
      else {
        seen.add(key);
        vokasiNew.push(r);
      }
    }
  }
  const vokasiPendingColumns = vokasiPreview ? vokasiPreview.columns.extra.filter((c) => !decisionFor("vokasi", c, decisions)).length : 0;
  const vokasiNewBatches = new Set(vokasiNew.map((r) => r.batch));

  const vokasiPendingTgl = vokasiPreview ? vokasiPreview.blankTglBatches.filter((b) => !vokasiTglFill[b.batch]).length : 0;

  const vokasiBlocked =
    vokasiNew.length === 0 || vokasiMissingBatch > 0 || vokasiPendingColumns > 0 || vokasiPendingShops > 0 || vokasiPendingTgl > 0;

  async function handleVokasiUpload() {
    if (!vokasiFile || !vokasiPreview || vokasiBlocked || vokasiBusy) return;
    const used = usedColumns("vokasi", vokasiPreview.columns.extra, decisions);
    const upload_date = new Date().toISOString();
    const full: VokasiRecord[] = vokasiNew.map(({ extra, ...r }) => {
      const kept = keepUsedExtra(extra, used);
      return { ...r, ...(kept ? { extra: kept } : {}), id: genId("vokasi"), upload_date };
    });
    const batchCount = vokasiNewBatches.size;
    const duplicates = vokasiDuplicates;
    setVokasiBusy(true);
    setVokasiMsg("Menyimpan data Vokasi…");
    try {
      // Each step waits for the previous one to land in the database: the
      // auto-match RPC looks the new demands up server-side, and firing it
      // before their insert finished is what produced "Demand not found".
      const error = await vokasiStore.insertManyPersisted(full);
      if (error) {
        vokasiStore.refetch();
        const missingColumn = /could not find the '([^']+)' column/i.exec(error)?.[1];
        setVokasiMsg(
          missingColumn
            ? `Gagal upload Vokasi: kolom "${missingColumn}" belum ada di database. Ada migration Supabase yang belum dijalankan — jalankan supabase/check_migrations.sql untuk melihat yang kurang, lalu jalankan file migration-nya.`
            : `Gagal upload Vokasi: ${error}`
        );
        return;
      }
      const created = await ensureVokasiEndedDemands();
      const matched = autoMatchVokasiBatch(full);
      setVokasiMsg(
        `Berhasil upload ${full.length} record baru dari ${batchCount} batch.` +
          (duplicates ? ` ${duplicates} baris dilewati karena sudah ada (noreg + batch sama).` : "") +
          ` ${created} demand Vokasi baru (yang berakhir bulan ini atau sesudahnya), ${matched} langsung dapat kandidat.`
      );
      setVokasiFile(null);
      setVokasiBatch("");
      setVokasiPreview(null);
    } finally {
      setVokasiBusy(false);
    }
  }

  function handleDeleteBatch(batch: string) {
    if (!confirm(`Hapus semua record Vokasi batch "${batch}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    const result = deleteVokasiBatch(batch);
    if (!result.ok) pushToast(result.error ?? "Gagal menghapus batch.");
  }

  function resetAll() {
    if (!confirm("Hapus SEMUA data CAMP dari database (untuk semua user)? Tindakan ini tidak bisa dibatalkan.")) return;
    setResetModalOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Upload Center</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sumber data mentah: ZPAR (snapshot bulanan) & Vokasi (database kumulatif).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="danger" onClick={resetAll}>
            Reset All Data
          </Button>
        </div>
      </div>

      <Card
        title="Upload ZPAR (Snapshot)"
        subtitle="Upload awal: satu file berisi Maret 2019–2025, semua periode masuk sekaligus. Mulai 2026: satu file per bulan. Hanya EG = Active; snapshot yang Active dipakai seluruh aplikasi."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={zparMultiPeriod ? "Periode (dari file)" : "Bulan & Tahun (period)"}>
            <Select value={zparPeriod} disabled={zparMultiPeriod} onChange={(e) => setZparPeriod(e.target.value)}>
              {zparPeriodOptions().map((m) => (
                <option key={m} value={m} disabled={takenPeriods.has(m)}>
                  {format(new Date(`${m}-01T00:00:00`), "MMMM yyyy")}
                  {takenPeriods.has(m) ? " (sudah diupload)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="File ZPAR (.xlsx / .csv)">
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => handleZparFileChange(e.target.files?.[0] ?? null)}
            />
          </Field>
          <div className="flex items-end">
            {zparPreview ? (
              <Button
                variant="primary"
                disabled={zparBusy || zparPlan.length === 0 || zparPendingColumns > 0}
                onClick={handleZparUpload}
                className="w-full"
              >
                {zparMultiPeriod ? `Upload ${zparPlan.length} periode (${zparPlanRows})` : `Konfirmasi & Upload (${zparPlanRows})`}
              </Button>
            ) : (
              <Button variant="secondary" disabled={!zparFile || zparBusy} onClick={handleCheckZpar} className="w-full">
                {zparBusy ? "Mengecek..." : "Cek Data"}
              </Button>
            )}
          </div>
        </div>
        {zparPreview && (
          <>
            {zparOffSchedule.length > 0 && (
              <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                Periode {zparOffSchedule.join(", ")} di file tidak sesuai jadwal ZPAR: 2019–2025 hanya Maret, mulai 2026 per bulan. Cek lagi
                kolom Period di file.
              </p>
            )}
            {zparMultiPeriod && (
              <div role="status" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
                <p className="mb-1.5 font-semibold">File berisi {zparPreview.periods.length} periode — semuanya diupload sekaligus sebagai snapshot terpisah:</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...zparPreview.periods]
                    .sort((a, b) => a.period.localeCompare(b.period))
                    .map((p) => {
                      const state = !zparValidPeriods.has(p.period) ? "di luar jadwal" : takenPeriods.has(p.period) ? "sudah ada" : "baru";
                      return (
                        <Badge key={p.period} tone={state === "baru" ? "blue" : state === "sudah ada" ? "slate" : "red"}>
                          {format(new Date(`${p.period}-01T00:00:00`), "MMM yyyy")} · {p.count} · {state}
                        </Badge>
                      );
                    })}
                </div>
              </div>
            )}
            {zparPeriodMismatch && (
              <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                Kolom Period di file berisi {zparFilePeriods.join(", ")}, tapi yang dipilih {zparPeriod}. Pastikan periodenya benar sebelum upload.
              </p>
            )}
            <ValidationSummary
              totalRows={zparPreview.totalRows}
              included={zparPreview.employees.length}
              skipBreakdown={zparPreview.skipBreakdown}
              columns={zparPreview.columns}
            />
            <ColumnDecisionPanel dataset="zpar" columns={zparPreview.columns.extra} decisions={decisions} />
          </>
        )}
        {zparMsg && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{zparMsg}</p>}

        <ReviewStatus run={reviewRun} reviewCount={reviews.length} busy={reviewBusy || !reviewRun} onRun={runReviews} />

        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-500">History Snapshot</h4>
            {snapshots.length > 0 && (
              <MultiSelect
                options={periodOptions}
                selected={selPeriods}
                onChange={setSelPeriods}
                placeholder="Semua Periode"
                className="w-48"
              />
            )}
          </div>
          {snapshots.length === 0 ? (
            <EmptyState text="Belum ada snapshot ZPAR yang diupload." />
          ) : filteredSnapshots.length === 0 ? (
            <EmptyState text="Tidak ada snapshot pada periode yang dipilih." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Periode</Th>
                  <Th>Nama File</Th>
                  <Th>Tanggal Upload</Th>
                  <Th>Total Active</Th>
                  <Th>Status</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {filteredSnapshots.map((s) => {
                  return (
                    <tr key={s.id}>
                      <Td>{s.period}</Td>
                      <Td>{s.filename}</Td>
                      <Td>{fmtDate(s.upload_date.slice(0, 10))}</Td>
                      <Td>{s.employees.length}</Td>
                      <Td>{s.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                      <Td>
                        <div className="flex gap-2">
                          {!s.is_active && (
                            <Button size="sm" onClick={() => activateAndRefresh(s.id)}>
                              Use This Data
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={s.is_active}
                            title={s.is_active ? "Tidak bisa menghapus snapshot yang sedang Active" : undefined}
                            onClick={() => handleDeleteSnapshot(s.id, s.period)}
                          >
                            Delete
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </div>
      </Card>

      <Card
        title="Upload Vokasi (Database Kumulatif)"
        subtitle="Vokasi Reguler, data kumulatif: setiap upload menambah, tidak menimpa. Upload awal: Voc_Starting_System (semua batch). Selanjutnya file bulanan mentah Voc_<Bulan>_System — batch & tanggal diambil dari judul file. Hanya Lokasi Karawang #1/#2; noreg + batch yang sudah ada dilewati."
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label={vokasiPreview?.batchFromFile ? "Batch (untuk baris tanpa Batch)" : "Batch (jika tidak ada di file)"}>
            <Input
              value={vokasiBatch}
              onChange={(e) => setVokasiBatch(e.target.value)}
              placeholder={vokasiPreview?.batchFromFile ? "Opsional — diambil dari file" : "mis. 126"}
            />
          </Field>
          <Field label="Tanggal Masuk (jika tidak ada di file)">
            <Input
              type="date"
              value={vokasiTglMasuk}
              onChange={(e) => {
                setVokasiTglMasuk(e.target.value);
                setVokasiPreview(null);
              }}
            />
          </Field>
          <Field label="File Vokasi (.xlsx / .csv)">
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => handleVokasiFileChange(e.target.files?.[0] ?? null)}
            />
          </Field>
          <div className="flex items-end">
            {vokasiPreview ? (
              <Button
                variant="primary"
                disabled={vokasiBusy || vokasiBlocked}
                onClick={handleVokasiUpload}
                className="w-full"
              >
                Konfirmasi &amp; Upload ({vokasiNew.length})
              </Button>
            ) : (
              <Button variant="secondary" disabled={!vokasiFile || vokasiBusy} onClick={handleCheckVokasi} className="w-full">
                {vokasiBusy ? "Mengecek..." : "Cek Data"}
              </Button>
            )}
          </div>
        </div>
        {vokasiPreview && (
          <>
            <div role="status" className="mt-3 space-y-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
              <p>
                Format:{" "}
                <b>
                  {vokasiPreview.format === "raw"
                    ? `File bulanan mentah${vokasiPreview.title?.start ? ` — mulai ${fmtDate(vokasiPreview.title.start)}` : ""}${vokasiPreview.title?.end ? ` s/d ${fmtDate(vokasiPreview.title.end)}` : ""}`
                    : "Starting (sudah bersih)"}
                </b>
                {vokasiPreview.format === "raw" && " · kolom data pribadi (NIK, NPWP, alamat, no. HP, rekening, BPJS, dll.) dibuang, tidak disimpan"}
              </p>
              {vokasiPreview.batchFromFile ? (
                <>
                  <p className="font-semibold">Batch diambil dari file ({vokasiPreview.batches.length} batch):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {vokasiPreview.batches.map((b) => (
                      <Badge key={b.batch} tone={batches.some((x) => x.batch === b.batch) ? "slate" : "blue"}>
                        {b.batch} · {b.count}
                        {batches.some((x) => x.batch === b.batch) ? " · batch sudah ada" : ""}
                      </Badge>
                    ))}
                  </div>
                </>
              ) : (
                <p>File tidak punya kolom Batch — semua baris masuk ke batch yang diisi di atas.</p>
              )}
              <p>
                <b>{vokasiNew.length}</b> record baru akan ditambahkan
                {vokasiDuplicates > 0 && <> · {vokasiDuplicates} dilewati karena sudah ada (noreg + batch sama)</>}
                {vokasiSkippedShop > 0 && <> · {vokasiSkippedShop} dilewati karena Shop bukan shop valid</>}
                {vokasiMissingBatch > 0 && (
                  <span className="font-semibold text-amber-800 dark:text-amber-200"> · {vokasiMissingBatch} baris belum punya batch — isi kolom Batch di atas</span>
                )}
                {vokasiNoDept > 0 && (
                  <span className="font-semibold text-amber-800 dark:text-amber-200">
                    {" "}
                    · {vokasiNoDept} baris Shop + Lokasi-nya tidak ada di tabel lookup Div/Dept (tetap diupload tanpa Div/Dept)
                  </span>
                )}
                .
              </p>
            </div>
            <ValidationSummary
              totalRows={vokasiPreview.totalRows}
              included={vokasiPreview.records.length}
              skipBreakdown={vokasiPreview.skipBreakdown}
              columns={vokasiPreview.columns}
            />
            <BlankTglPanel
              batches={vokasiPreview.blankTglBatches}
              values={vokasiTglFill}
              onChange={(batch, date) => setVokasiTglFill((v) => ({ ...v, [batch]: date }))}
            />
            <ShopMappingPanel values={vokasiPreview.shopValues} mappings={valueMappings} />
            <ColumnDecisionPanel dataset="vokasi" columns={vokasiPreview.columns.extra} decisions={decisions} />
          </>
        )}
        {vokasiMsg && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{vokasiMsg}</p>}

        <div className="mt-5">
          <h4 className="mb-2 text-xs font-semibold text-slate-500">History Batch</h4>
          {batches.length === 0 ? (
            <EmptyState text="Belum ada batch Vokasi yang diupload." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Batch</Th>
                  <Th>Jumlah Record</Th>
                  <Th>Tanggal Upload</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batch}>
                    <Td>{b.batch}</Td>
                    <Td>{b.count}</Td>
                    <Td>{fmtDate(b.upload_date.slice(0, 10))}</Td>
                    <Td>
                      <Button size="sm" variant="danger" onClick={() => handleDeleteBatch(b.batch)}>
                        Delete
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      </Card>

      <ResetAllModal open={resetModalOpen} onClose={() => setResetModalOpen(false)} />
    </div>
  );
}

/** Second confirmation tier for "Reset All Data" — re-verifies the admin's
 * own email + password against Supabase auth (same signInWithPassword the
 * login page uses) before wiping every table. A single confirm() dialog is
 * too cheap a gate for a whole-database delete with no undo. */
function ResetAllModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setEmail("");
    setPassword("");
    setError("");
    setBusy(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleConfirm() {
    if (!email || !password) return;
    setBusy(true);
    setError("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email || user.email.toLowerCase() !== email.trim().toLowerCase()) {
      setError("Email tidak sesuai dengan akun yang sedang login.");
      setBusy(false);
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("Password salah.");
      setBusy(false);
      return;
    }
    clearAllData();
    handleClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Konfirmasi Reset All Data">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Ini akan menghapus <b>seluruh data CAMP</b> secara permanen. Masukkan email dan password akun Anda untuk
          melanjutkan.
        </p>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            Batal
          </Button>
          <Button variant="danger" disabled={!email || !password || busy} onClick={handleConfirm}>
            {busy ? "Memverifikasi..." : "Hapus Semua Data"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
