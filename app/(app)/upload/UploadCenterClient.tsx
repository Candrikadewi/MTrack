"use client";
import { useState } from "react";
import { addMonths, format } from "date-fns";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { useStoreList } from "@/lib/useStore";
import { zparStore, vokasiStore, activateSnapshot, clearAllData } from "@/lib/repo";
import { genId } from "@/lib/storage";
import { parseVokasiFile, parseZparFile, type SkipBreakdown } from "@/lib/parseFile";
import {
  autoMatchVokasiBatch,
  deleteVokasiBatch,
  deleteZparSnapshot,
  ensureVokasiEndedDemands,
  generatePkwtReviews,
} from "@/lib/engine/actions";
import { fmtDate } from "@/lib/engine/compute";
import { createClient } from "@/lib/supabase/client";
import { pushToast } from "@/lib/toast";
import { useSessionState } from "@/lib/useSessionState";
import type { VokasiRecord } from "@/lib/types";

/** Pre-commit validation preview — how many rows will actually be used and
 * why the rest won't, before anything gets written to the store. Shared
 * between ZPAR and Vokasi, which both now skip rows for the same two kinds
 * of reasons (a hard data-quality gate for ZPAR — EG/Status Kontrak — plus
 * Pers Area not resolving to Vehicle/Unit KRW/Unit STR Plant for both). */
function ValidationSummary({
  totalRows,
  included,
  skipBreakdown,
}: {
  totalRows: number;
  included: number;
  skipBreakdown: SkipBreakdown;
}) {
  const reasonEntries = Object.entries(skipBreakdown.reasons);
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
            Tidak match: <b>{totalRows - included}</b>
          </span>
        )}
      </div>
      {reasonEntries.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-500">Alasan tidak match:</div>
          <ul className="space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
            {reasonEntries.map(([reason, count]) => (
              <li key={reason}>
                {reason}: <b>{count}</b> baris
              </li>
            ))}
          </ul>
        </div>
      )}
      {skipBreakdown.unmatchedPersAreaValues.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-500">Nilai Pers Area yang tidak dikenali:</div>
          <div className="flex flex-wrap gap-1.5">
            {skipBreakdown.unmatchedPersAreaValues.map((v) => (
              <Badge key={v} tone="amber">
                {v}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/** +2 months ahead down to 36 months back — wide enough for retroactive
 * historical backfill while still nudging toward the current/near periods. */
function zparPeriodOptions(): string[] {
  const base = new Date(`${currentMonthKey()}-01T00:00:00`);
  return Array.from({ length: 39 }, (_, i) => format(addMonths(base, 2 - i), "yyyy-MM"));
}

export function UploadCenterClient() {
  // Copy before sort — list() returns the store's live cache array, and
  // sorting it in place would mutate that shared reference during render.
  const snapshots = [...useStoreList(zparStore)].sort((a, b) => b.upload_date.localeCompare(a.upload_date));
  const vokasiRecords = useStoreList(vokasiStore);

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

  const [resetModalOpen, setResetModalOpen] = useState(false);

  function activateAndRefresh(id: string) {
    activateSnapshot(id);
    generatePkwtReviews();
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
    } catch (e) {
      setZparMsg(`Gagal parsing file: ${(e as Error).message}`);
    } finally {
      setZparBusy(false);
    }
  }

  function handleZparUpload() {
    if (!zparFile || !zparPeriod || !zparPreview) return;
    if (takenPeriods.has(zparPeriod)) {
      setZparMsg("Periode ini sudah diupload — pilih periode lain atau hapus snapshot yang ada terlebih dahulu.");
      return;
    }
    const snapshot = {
      id: genId("zpar"),
      period: zparPeriod,
      filename: zparFile.name,
      upload_date: new Date().toISOString(),
      is_active: false,
      employees: zparPreview.employees,
    };
    zparStore.insert(snapshot);
    if (!snapshots.some((s) => s.is_active)) activateAndRefresh(snapshot.id);
    setZparMsg(`Berhasil upload ${zparPreview.employees.length} employee dari ${zparPreview.totalRows} baris.`);
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
    } catch (e) {
      setVokasiMsg(`Gagal parsing file: ${(e as Error).message}`);
    } finally {
      setVokasiBusy(false);
    }
  }

  function handleVokasiUpload() {
    if (!vokasiFile || !vokasiBatch || !vokasiPreview) return;
    const upload_date = new Date().toISOString();
    const full: VokasiRecord[] = vokasiPreview.records.map((r) => ({
      ...r,
      id: genId("vokasi"),
      batch: vokasiBatch,
      upload_date,
    }));
    vokasiStore.insertMany(full);
    ensureVokasiEndedDemands();
    const matched = autoMatchVokasiBatch(full);
    setVokasiMsg(`Berhasil upload ${full.length} record dari ${vokasiPreview.totalRows} baris. Auto-matched ke ${matched} demand Vokasi.`);
    setVokasiFile(null);
    setVokasiBatch("");
    setVokasiPreview(null);
  }

  function handleDeleteBatch(batch: string) {
    if (!confirm(`Hapus semua record Vokasi batch "${batch}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    const result = deleteVokasiBatch(batch);
    if (!result.ok) pushToast(result.error ?? "Gagal menghapus batch.");
  }

  function resetAll() {
    if (!confirm("Hapus SEMUA data CIRCLE dari database (untuk semua user)? Tindakan ini tidak bisa dibatalkan.")) return;
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
        title="Upload ZPAR (Snapshot Bulanan)"
        subtitle="Filter EG = Active, status Permanen/Kontrak/AKTI, Pers Area termasuk Vehicle/Unit KRW/Unit STR Plant"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Bulan & Tahun (period)">
            <Select value={zparPeriod} onChange={(e) => setZparPeriod(e.target.value)}>
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
                disabled={zparBusy || takenPeriods.has(zparPeriod)}
                onClick={handleZparUpload}
                className="w-full"
              >
                Konfirmasi &amp; Upload
              </Button>
            ) : (
              <Button variant="secondary" disabled={!zparFile || zparBusy} onClick={handleCheckZpar} className="w-full">
                {zparBusy ? "Mengecek..." : "Cek Data"}
              </Button>
            )}
          </div>
        </div>
        {zparPreview && (
          <ValidationSummary
            totalRows={zparPreview.totalRows}
            included={zparPreview.employees.length}
            skipBreakdown={zparPreview.skipBreakdown}
          />
        )}
        {zparMsg && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{zparMsg}</p>}

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
        subtitle="Compiling: setiap upload menambah, tidak menimpa. Pers Area termasuk Vehicle/Unit KRW/Unit STR Plant"
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Batch (nama/nomor)">
            <Input value={vokasiBatch} onChange={(e) => setVokasiBatch(e.target.value)} placeholder="Batch 2026-A" />
          </Field>
          <Field label="Tanggal Masuk Batch">
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
              <Button variant="primary" disabled={!vokasiBatch || vokasiBusy} onClick={handleVokasiUpload} className="w-full">
                Konfirmasi &amp; Upload
              </Button>
            ) : (
              <Button variant="secondary" disabled={!vokasiFile || vokasiBusy} onClick={handleCheckVokasi} className="w-full">
                {vokasiBusy ? "Mengecek..." : "Cek Data"}
              </Button>
            )}
          </div>
        </div>
        {vokasiPreview && (
          <ValidationSummary
            totalRows={vokasiPreview.totalRows}
            included={vokasiPreview.records.length}
            skipBreakdown={vokasiPreview.skipBreakdown}
          />
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
          Ini akan menghapus <b>seluruh data CIRCLE</b> secara permanen. Masukkan email dan password akun Anda untuk
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
