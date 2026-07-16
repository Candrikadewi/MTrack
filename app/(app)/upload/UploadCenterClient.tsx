"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { useStoreList } from "@/lib/useStore";
import { zparStore, vokasiStore, activateSnapshot, clearAllData } from "@/lib/repo";
import { genId } from "@/lib/storage";
import { parseVokasiFile, parseZparFile } from "@/lib/parseFile";
import { autoMatchVokasiBatch, ensureVokasiEndedDemands, generatePkwtReviews } from "@/lib/engine/actions";
import { seedSampleData } from "@/lib/sampleData";
import { fmtDate } from "@/lib/engine/compute";
import type { VokasiRecord } from "@/lib/types";

export function UploadCenterClient() {
  const snapshots = useStoreList(zparStore).sort((a, b) => b.upload_date.localeCompare(a.upload_date));
  const vokasiRecords = useStoreList(vokasiStore);

  const [zparPeriod, setZparPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [zparFile, setZparFile] = useState<File | null>(null);
  const [zparBusy, setZparBusy] = useState(false);
  const [zparMsg, setZparMsg] = useState("");

  const [vokasiBatch, setVokasiBatch] = useState("");
  const [vokasiTglMasuk, setVokasiTglMasuk] = useState(new Date().toISOString().slice(0, 10));
  const [vokasiFile, setVokasiFile] = useState<File | null>(null);
  const [vokasiBusy, setVokasiBusy] = useState(false);
  const [vokasiMsg, setVokasiMsg] = useState("");

  function activateAndRefresh(id: string) {
    activateSnapshot(id);
    generatePkwtReviews();
  }

  const batches = Array.from(new Set(vokasiRecords.map((v) => v.batch))).map((batch) => {
    const rows = vokasiRecords.filter((v) => v.batch === batch);
    return { batch, count: rows.length, upload_date: rows[0]?.upload_date ?? "" };
  });

  async function handleZparUpload() {
    if (!zparFile || !zparPeriod) return;
    setZparBusy(true);
    setZparMsg("");
    try {
      const { employees, totalRows, skipped } = await parseZparFile(zparFile);
      const snapshot = {
        id: genId("zpar"),
        period: zparPeriod,
        filename: zparFile.name,
        upload_date: new Date().toISOString(),
        is_active: false,
        employees,
      };
      zparStore.insert(snapshot);
      if (!snapshots.some((s) => s.is_active)) activateAndRefresh(snapshot.id);
      setZparMsg(
        `Berhasil upload ${employees.length} employee aktif dari ${totalRows} baris (${skipped} baris dilewati / tidak match filter).`
      );
      setZparFile(null);
    } catch (e) {
      setZparMsg(`Gagal parsing file: ${(e as Error).message}`);
    } finally {
      setZparBusy(false);
    }
  }

  async function handleVokasiUpload() {
    if (!vokasiFile || !vokasiBatch || !vokasiTglMasuk) return;
    setVokasiBusy(true);
    setVokasiMsg("");
    try {
      const { records, totalRows } = await parseVokasiFile(vokasiFile, vokasiTglMasuk);
      const upload_date = new Date().toISOString();
      const full: VokasiRecord[] = records.map((r) => ({
        ...r,
        id: genId("vokasi"),
        batch: vokasiBatch,
        upload_date,
      }));
      vokasiStore.insertMany(full);
      ensureVokasiEndedDemands();
      const matched = autoMatchVokasiBatch(full);
      setVokasiMsg(`Berhasil upload ${full.length} record dari ${totalRows} baris. Auto-matched ke ${matched} demand Vokasi.`);
      setVokasiFile(null);
      setVokasiBatch("");
    } catch (e) {
      setVokasiMsg(`Gagal parsing file: ${(e as Error).message}`);
    } finally {
      setVokasiBusy(false);
    }
  }

  function loadSample() {
    if (!confirm("Ini akan mengganti SELURUH data di database (untuk semua user) dengan data contoh. Lanjutkan?")) return;
    seedSampleData();
  }

  function resetAll() {
    if (!confirm("Hapus SEMUA data M-TRACK dari database (untuk semua user)? Tindakan ini tidak bisa dibatalkan.")) return;
    clearAllData();
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
          <Button variant="secondary" onClick={loadSample}>
            Load Sample Data
          </Button>
          <Button variant="danger" onClick={resetAll}>
            Reset All Data
          </Button>
        </div>
      </div>

      <Card title="Upload ZPAR (Snapshot Bulanan)" subtitle="Filter EG = Active, status Permanen/Kontrak/AKTI">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Bulan & Tahun (period)">
            <Input type="month" value={zparPeriod} onChange={(e) => setZparPeriod(e.target.value)} />
          </Field>
          <Field label="File ZPAR (.xlsx / .csv)">
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setZparFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <div className="flex items-end">
            <Button variant="primary" disabled={!zparFile || zparBusy} onClick={handleZparUpload} className="w-full">
              {zparBusy ? "Mengupload..." : "Upload Snapshot"}
            </Button>
          </div>
        </div>
        {zparMsg && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{zparMsg}</p>}

        <div className="mt-5">
          <h4 className="mb-2 text-xs font-semibold text-slate-500">History Snapshot</h4>
          {snapshots.length === 0 ? (
            <EmptyState text="Belum ada snapshot ZPAR yang diupload." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Periode</Th>
                  <Th>Nama File</Th>
                  <Th>Tanggal Upload</Th>
                  <Th>Total Active</Th>
                  <Th>Permanen</Th>
                  <Th>Kontrak+AKTI</Th>
                  <Th>Status</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => {
                  const perm = s.employees.filter((e) => e.status_kontrak === "Permanen").length;
                  const kontrak = s.employees.length - perm;
                  return (
                    <tr key={s.id}>
                      <Td>{s.period}</Td>
                      <Td>{s.filename}</Td>
                      <Td>{fmtDate(s.upload_date.slice(0, 10))}</Td>
                      <Td>{s.employees.length}</Td>
                      <Td>{perm}</Td>
                      <Td>{kontrak}</Td>
                      <Td>{s.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                      <Td>
                        {!s.is_active && (
                          <Button size="sm" onClick={() => activateAndRefresh(s.id)}>
                            Use This Data
                          </Button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </div>
      </Card>

      <Card title="Upload Vokasi (Database Kumulatif)" subtitle="Compiling: setiap upload menambah, tidak menimpa">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Batch (nama/nomor)">
            <Input value={vokasiBatch} onChange={(e) => setVokasiBatch(e.target.value)} placeholder="Batch 2026-A" />
          </Field>
          <Field label="Tanggal Masuk Batch">
            <Input type="date" value={vokasiTglMasuk} onChange={(e) => setVokasiTglMasuk(e.target.value)} />
          </Field>
          <Field label="File Vokasi (.xlsx / .csv)">
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setVokasiFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <div className="flex items-end">
            <Button
              variant="primary"
              disabled={!vokasiFile || !vokasiBatch || vokasiBusy}
              onClick={handleVokasiUpload}
              className="w-full"
            >
              {vokasiBusy ? "Mengupload..." : "Upload Batch"}
            </Button>
          </div>
        </div>
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
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batch}>
                    <Td>{b.batch}</Td>
                    <Td>{b.count}</Td>
                    <Td>{fmtDate(b.upload_date.slice(0, 10))}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      </Card>
    </div>
  );
}
