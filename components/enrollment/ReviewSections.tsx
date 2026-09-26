"use client";
import { useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, Eraser } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Form";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ConfirmDialog } from "@/components/ui/Modal";
import { fmtDate, sisaHari } from "@/lib/engine/compute";
import { deptsOfRows, divisionsOfRows, filterByDivDept } from "@/lib/engine/enrollment";
import { setReviewResult, setReviewResults } from "@/lib/engine/actions";
import type { PkwtReview, ReviewResult, VokasiRecord, VokasiStatusSaatIni } from "@/lib/types";

/** PKWT Continue/Terminate review table, filtered by period + div/dept. Div/
 * dept filter state is owned by the caller (not internal useSessionState)
 * so a sibling widget — e.g. Demand's filter-aware ratio widget — can react
 * to the same filter live instead of only syncing on remount. */
export function ReviewSection({
  period,
  reviews,
  canEditReview,
  divs,
  depts,
  onDivsChange,
  onDeptsChange,
}: {
  period: string;
  reviews: PkwtReview[];
  canEditReview: boolean;
  divs: string[];
  depts: string[];
  onDivsChange: (v: string[]) => void;
  onDeptsChange: (v: string[]) => void;
}) {
  const monthReviews = reviews.filter((r) => r.tgl_review.slice(0, 7) === period);
  const reviewDivOptions = divisionsOfRows(monthReviews);
  const reviewDeptOptions = deptsOfRows(monthReviews, divs);
  const filteredReviews = filterByDivDept(monthReviews, divs, depts);

  const terminateCount = filteredReviews.filter((r) => r.review_result === "Terminate").length;
  const [pendingTerminate, setPendingTerminate] = useState<PkwtReview | null>(null);

  // Bulk review: tick rows (or "all" / "belum diisi" for the current
  // filter, e.g. one dept of 80) and set them in one go. Only rows still
  // on screen count, so a filter change never acts on hidden people.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTerminate, setBulkTerminate] = useState(false);
  const [busy, setBusy] = useState(false);
  const selectedRows = filteredReviews.filter((r) => selected.has(r.id));
  const unfilled = filteredReviews.filter((r) => !r.review_result);
  const allSelected = filteredReviews.length > 0 && selectedRows.length === filteredReviews.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulk(result: ReviewResult) {
    if (selectedRows.length === 0) return;
    setBusy(true);
    await setReviewResults(
      selectedRows.map((r) => r.id),
      result
    );
    setBusy(false);
    setSelected(new Set());
  }

  return (
    <Card
      title="Review PKWT"
      subtitle={`${filteredReviews.length} jatuh tempo review · ${terminateCount} terminate`}
      action={
        <div className="flex gap-2">
          <MultiSelect
            options={reviewDivOptions}
            selected={divs}
            onChange={(v) => {
              onDivsChange(v);
              onDeptsChange([]);
            }}
            placeholder="Semua Divisi"
            className="w-44"
          />
          <MultiSelect
            options={reviewDeptOptions}
            selected={depts}
            onChange={onDeptsChange}
            placeholder="Semua Department"
            className="w-44"
          />
        </div>
      }
    >
      {filteredReviews.length === 0 ? (
        <EmptyState text="Tidak ada PKWT jatuh tempo review pada periode/filter ini." />
      ) : (
        <>
          {canEditReview && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
              {selectedRows.length === 0 ? (
                <>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    Isi sekaligus: centang beberapa orang, lalu pilih hasilnya.
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <BulkButton onClick={() => setSelected(new Set(filteredReviews.map((r) => r.id)))}>
                      Pilih semua ({filteredReviews.length})
                    </BulkButton>
                    {unfilled.length > 0 && unfilled.length < filteredReviews.length && (
                      <BulkButton onClick={() => setSelected(new Set(unfilled.map((r) => r.id)))}>
                        Pilih yang belum diisi ({unfilled.length})
                      </BulkButton>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100" aria-live="polite">
                    {selectedRows.length} orang dipilih
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      className="ml-2 font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
                    >
                      Batal pilih
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <BulkButton tone="green" disabled={busy} onClick={() => applyBulk("Continue")}>
                      <CheckCircle2 size={13} aria-hidden /> Continue
                    </BulkButton>
                    <BulkButton tone="red" disabled={busy} onClick={() => setBulkTerminate(true)}>
                      <XCircle size={13} aria-hidden /> Terminate
                    </BulkButton>
                    <BulkButton disabled={busy} onClick={() => applyBulk("")}>
                      <Eraser size={13} aria-hidden /> Kosongkan
                    </BulkButton>
                  </div>
                </>
              )}
            </div>
          )}
          <TableWrap maxHeightClass="max-h-[600px]">
            <thead>
              <tr>
                <Th freeze="noreg">
                  {canEditReview ? (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = selectedRows.length > 0 && !allSelected;
                        }}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(filteredReviews.map((r) => r.id)))}
                        aria-label="Pilih semua di tabel"
                        className="size-4 rounded border-slate-300 accent-blue-600"
                      />
                      Noreg
                    </label>
                  ) : (
                    "Noreg"
                  )}
                </Th>
                <Th freeze="nama">Nama Lengkap</Th>
                <Th>Status</Th>
                <Th>Divisi</Th>
                <Th>Department</Th>
                <Th>Tanggal Masuk</Th>
                <Th>Tanggal Review</Th>
                <Th>Sisa Hari</Th>
                <Th>Review Result</Th>
              </tr>
            </thead>
            <tbody>
              {filteredReviews.map((r) => {
                const days = sisaHari(r.tgl_review);
                return (
                  <tr key={r.id} className={selected.has(r.id) ? "bg-blue-50/70 dark:bg-blue-500/10" : undefined}>
                    <Td freeze="noreg">
                      {canEditReview ? (
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggle(r.id)}
                            aria-label={`Pilih ${r.nama} (${r.noreg})`}
                            className="size-4 rounded border-slate-300 accent-blue-600"
                          />
                          {r.noreg}
                        </label>
                      ) : (
                        r.noreg
                      )}
                    </Td>
                    <Td freeze="nama" className="font-medium text-slate-800 dark:text-slate-100">
                      {r.nama}
                    </Td>
                    <Td>
                      <Badge tone={r.status_kontrak === "Permanen" ? "green" : "amber"}>{r.status_kontrak}</Badge>
                    </Td>
                    <Td>{r.div}</Td>
                    <Td>{r.dept}</Td>
                    <Td>{fmtDate(r.tgl_masuk)}</Td>
                    <Td>{fmtDate(r.tgl_review)}</Td>
                    <Td className={days < 0 ? "text-red-600" : days <= 14 ? "text-amber-600" : ""}>{days}</Td>
                    <Td>
                      {canEditReview ? (
                        <Select
                          value={r.review_result}
                          aria-label={`Review result ${r.nama} (${r.noreg})`}
                          onChange={(e) => {
                            const next = e.target.value as ReviewResult;
                            if (next === "Terminate") setPendingTerminate(r);
                            else setReviewResult(r.id, next);
                          }}
                          className="min-w-[130px]"
                        >
                          <option value="">-</option>
                          <option value="Continue">Continue</option>
                          <option value="Terminate">Terminate</option>
                        </Select>
                      ) : r.review_result ? (
                        <Badge tone={statusTone(r.review_result)}>{r.review_result}</Badge>
                      ) : (
                        "-"
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </>
      )}
      <ConfirmDialog
        open={bulkTerminate}
        title={`Terminate ${selectedRows.length} kontrak?`}
        confirmLabel={`Ya, Terminate ${selectedRows.length}`}
        tone="danger"
        onCancel={() => setBulkTerminate(false)}
        onConfirm={() => {
          setBulkTerminate(false);
          void applyBulk("Terminate");
        }}
      >
        Kontrak {selectedRows.length} orang tidak dilanjutkan
        {selectedRows.length <= 5 ? ` (${selectedRows.map((r) => r.nama).join(", ")})` : ""}. Ini akan membuka{" "}
        <strong className="font-semibold text-slate-800 dark:text-slate-100">
          {selectedRows.filter((r) => r.review_result !== "Terminate").length} demand replacement
        </strong>{" "}
        di {Array.from(new Set(selectedRows.map((r) => r.dept || r.div))).join(", ")}.
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingTerminate !== null}
        title="Terminate kontrak?"
        confirmLabel="Ya, Terminate"
        tone="danger"
        onCancel={() => setPendingTerminate(null)}
        onConfirm={() => {
          if (pendingTerminate) setReviewResult(pendingTerminate.id, "Terminate");
          setPendingTerminate(null);
        }}
      >
        {pendingTerminate && (
          <>
            Kontrak <strong className="font-semibold text-slate-800 dark:text-slate-100">{pendingTerminate.nama}</strong> (
            {pendingTerminate.noreg}) tidak dilanjutkan. Ini akan membuka{" "}
            <strong className="font-semibold text-slate-800 dark:text-slate-100">1 demand replacement</strong> untuk{" "}
            {pendingTerminate.dept || pendingTerminate.div}.
          </>
        )}
      </ConfirmDialog>
    </Card>
  );
}

function BulkButton({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "green" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
      : tone === "red"
        ? "border-rose-600 bg-rose-600 text-white hover:bg-rose-700"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function vokasiEndedStatusTone(status: VokasiStatusSaatIni): "green" | "amber" | "blue" | "slate" {
  if (status === "Ended") return "green";
  if (status === "Need Replace") return "amber";
  if (status === "Overlapping") return "blue";
  return "slate";
}

export function VokasiEndedSection({
  period,
  vokasi,
  divs,
  depts,
  onDivsChange,
  onDeptsChange,
}: {
  period: string;
  vokasi: VokasiRecord[];
  divs: string[];
  depts: string[];
  onDivsChange: (v: string[]) => void;
  onDeptsChange: (v: string[]) => void;
}) {
  const monthVokasi = vokasi.filter((v) => v.tgl_ended?.slice(0, 7) === period);
  const divOptions = divisionsOfRows(monthVokasi.map((v) => ({ div: v.div })));
  const deptOptions = deptsOfRows(
    monthVokasi.map((v) => ({ div: v.div, dept: v.dept })),
    divs
  );
  const filtered = filterByDivDept(monthVokasi, divs, depts);

  return (
    <Card
      title="Vokasi Ended"
      subtitle={`${filtered.length} vokasi ended pada periode ini, perlu replace. Isi kandidat di menu Demand.`}
      action={
        <div className="flex gap-2">
          <MultiSelect
            options={divOptions}
            selected={divs}
            onChange={(v) => {
              onDivsChange(v);
              onDeptsChange([]);
            }}
            placeholder="Semua Divisi"
            className="w-44"
          />
          <MultiSelect
            options={deptOptions}
            selected={depts}
            onChange={onDeptsChange}
            placeholder="Semua Department"
            className="w-44"
          />
        </div>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState text="Tidak ada Vokasi ended pada periode/filter ini." />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th freeze="noreg">Noreg</Th>
              <Th freeze="nama">Nama Lengkap</Th>
              <Th>Divisi</Th>
              <Th>Department</Th>
              <Th>Tanggal Masuk</Th>
              <Th>Tanggal Ended</Th>
              <Th>Sisa Hari</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => {
              const days = sisaHari(v.tgl_ended);
              return (
                <tr key={v.id}>
                  <Td freeze="noreg">{v.noreg}</Td>
                  <Td freeze="nama" className="font-medium text-slate-800 dark:text-slate-100">
                    {v.nama}
                  </Td>
                  <Td>{v.div}</Td>
                  <Td>{v.dept}</Td>
                  <Td>{fmtDate(v.tgl_masuk)}</Td>
                  <Td>{fmtDate(v.tgl_ended)}</Td>
                  <Td className={days < 0 ? "text-red-600" : days <= 14 ? "text-amber-600" : ""}>{days}</Td>
                  <Td>
                    <Badge tone={vokasiEndedStatusTone(v.status_saat_ini)}>{v.status_saat_ini}</Badge>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </Card>
  );
}
