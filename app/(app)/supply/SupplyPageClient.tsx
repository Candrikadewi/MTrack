"use client";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FullWidthTabs } from "@/components/ui/Tabs";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Select } from "@/components/ui/Form";
import { EmptyState, FilteredEmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/Modal";
import { BatchTileRow } from "@/components/ui/BatchTileRow";
import { buildSupplyBatchCategories, jenisOf } from "@/lib/engine/batches";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SegmentedSwitch } from "@/components/ui/SegmentedSwitch";
import { KaizenModal } from "@/components/util-pool/KaizenModal";
import { TaktDownModal } from "@/components/takt/TaktDownModal";
import { useStoreList, useStoreReady } from "@/lib/useStore";
import { pushToast } from "@/lib/toast";
import { demandStore, projectStore, taktStore, utilPoolStore, vokasiStore, zparStore } from "@/lib/repo";
import { contractRemainingLabel, contractUrgency, fmtDate, poolLeadTimeDays } from "@/lib/engine/compute";
import { autoProjectFinishCheck, naturalRelease } from "@/lib/engine/actions";
import { useRole } from "@/lib/RoleContext";
import { useSessionState } from "@/lib/useSessionState";
import type { UtilPoolEntry } from "@/lib/types";

const urgencyClass: Record<string, string> = {
  red: "font-semibold text-red-700 dark:text-red-300",
  orange: "font-semibold text-amber-700 dark:text-amber-300",
  green: "text-emerald-700 dark:text-emerald-300",
  none: "text-slate-600 dark:text-slate-400",
};


export function SupplyPageClient() {
  const role = useRole();
  const [kaizenOpen, setKaizenOpen] = useState(false);
  const [taktDownOpen, setTaktDownOpen] = useState(false);
  const poolList = useStoreList(utilPoolStore);
  const poolReady = useStoreReady(utilPoolStore);
  // Admin only: project rows whose release date has come put their MP into
  // the pool as MP Excess (see autoProjectFinishCheck).
  const projectsReady = useStoreReady(projectStore);
  const demandsReady = useStoreReady(demandStore);
  const vokasiReady = useStoreReady(vokasiStore);
  const zparReady = useStoreReady(zparStore);
  const releaseInputsReady = poolReady && projectsReady && demandsReady && vokasiReady && zparReady;
  useEffect(() => {
    if (role === "admin" && releaseInputsReady) autoProjectFinishCheck();
  }, [role, releaseInputsReady]);
  // Copy before sorting: list() hands back the store's live cache, and an
  // in-place sort would reshuffle it for every other reader mid-render.
  const entries = useMemo(
    () => [...poolList].sort((a, b) => b.entered_pool_date.localeCompare(a.entered_pool_date)),
    [poolList]
  );
  const taktCases = useStoreList(taktStore);
  const snapshots = useStoreList(zparStore);
  // Live lookup, not snapshotted — Posisi (Struktural) only exists on the
  // active ZPAR snapshot's EmployeeRecord, not on UtilPoolEntry itself, so
  // this always reflects the latest upload rather than whatever was true
  // when the person entered the pool. Built once per snapshot change instead
  // of scanning the employee list per row/option.
  const posisiByNoreg = useMemo(() => {
    const employees = snapshots.find((s) => s.is_active)?.employees ?? [];
    return new Map(employees.map((e) => [e.noreg, e.posisi_struktural]));
  }, [snapshots]);
  const posisiFor = (noreg: string) => posisiByNoreg.get(noreg) || "-";

  const batchCategories = useMemo(() => buildSupplyBatchCategories(entries, taktCases), [entries, taktCases]);

  const [inputTab, setInputTab] = useSessionState<"taktdown" | "kaizen">("supply.input.tab", "taktdown");

  const [kontrapVokasi, setKontrapVokasi] = useSessionState<"kontrak" | "vokasi">("supply.detail.switch", "kontrak");
  const switchScoped = useMemo(
    () => entries.filter((e) => (kontrapVokasi === "vokasi" ? e.type === "Vokasi" : e.type !== "Vokasi")),
    [entries, kontrapVokasi]
  );

  const openAllEntries = useMemo(() => switchScoped.filter((e) => e.status === "Open"), [switchScoped]);

  const [selOpenSources, setSelOpenSources] = useSessionState<string[]>("utilpool.open.sources", []);
  const [selOpenDivs, setSelOpenDivs] = useSessionState<string[]>("utilpool.open.divs", []);
  const [selOpenDepts, setSelOpenDepts] = useSessionState<string[]>("utilpool.open.depts", []);
  const [selOpenStatus, setSelOpenStatus] = useSessionState<string[]>("utilpool.open.status", []);
  const [selOpenPosisi, setSelOpenPosisi] = useSessionState<string[]>("utilpool.open.posisi", []);
  const [selOpenMonth, setSelOpenMonth] = useSessionState<string>("utilpool.open.month", "");

  const openSourceOptions = useMemo(() => Array.from(new Set(openAllEntries.map(jenisOf))).sort(), [openAllEntries]);
  const openDivOptions = useMemo(() => Array.from(new Set(openAllEntries.map((e) => e.prev_div).filter(Boolean))).sort(), [openAllEntries]);
  const openDeptOptions = useMemo(
    () =>
      Array.from(
        new Set(openAllEntries.filter((e) => selOpenDivs.length === 0 || selOpenDivs.includes(e.prev_div)).map((e) => e.prev_dept).filter(Boolean))
      ).sort(),
    [openAllEntries, selOpenDivs]
  );
  const openStatusOptions = useMemo(() => Array.from(new Set(openAllEntries.map((e) => e.type))).sort(), [openAllEntries]);
  const openPosisiOptions = useMemo(
    () => Array.from(new Set(openAllEntries.map((e) => posisiByNoreg.get(e.noreg)).filter((p): p is string => Boolean(p)))).sort(),
    [openAllEntries, posisiByNoreg]
  );
  const openMonthOptions = useMemo(() => Array.from(new Set(openAllEntries.map((e) => e.entered_pool_date.slice(0, 7)))).sort().reverse(), [openAllEntries]);

  const openEntries = useMemo(
    () =>
      openAllEntries.filter(
        (e) =>
          (selOpenSources.length === 0 || selOpenSources.includes(jenisOf(e))) &&
          (selOpenDivs.length === 0 || selOpenDivs.includes(e.prev_div)) &&
          (selOpenDepts.length === 0 || selOpenDepts.includes(e.prev_dept)) &&
          (selOpenStatus.length === 0 || selOpenStatus.includes(e.type)) &&
          (selOpenPosisi.length === 0 || selOpenPosisi.includes(posisiByNoreg.get(e.noreg) || "-")) &&
          (selOpenMonth === "" || e.entered_pool_date.slice(0, 7) === selOpenMonth)
      ),
    [openAllEntries, selOpenSources, selOpenDivs, selOpenDepts, selOpenStatus, selOpenPosisi, selOpenMonth, posisiByNoreg]
  );

  const [pendingRelease, setPendingRelease] = useState<UtilPoolEntry | null>(null);

  function resetOpenFilters() {
    setSelOpenSources([]);
    setSelOpenDivs([]);
    setSelOpenDepts([]);
    setSelOpenStatus([]);
    setSelOpenPosisi([]);
    setSelOpenMonth("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Supply</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Personil sementara tidak bertugas (Takt Down/Project Selesai/Kaizen), siap diutilize sebagai MP Excess/Back Up.
        </p>
      </div>

      <SectionHeading n={1} title="Ringkasan per Batch" subtitle="Jumlah MP di Supply Pool yang belum diutilize, dari total yang masuk. Klik tile untuk rincian." divider={false} />
      <BatchTileRow categories={batchCategories} pendingLabel="belum diutilize" />

      {role === "admin" && (
        <div className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-800">
          <SectionHeading n={2} title="Input Supply Baru" divider={false} />
          <Card>
            <div className="space-y-4">
            <FullWidthTabs
              tabs={[
                { key: "taktdown", label: "Takt Down" },
                { key: "kaizen", label: "Kaizen" },
              ]}
              active={inputTab}
              onChange={(k) => setInputTab(k as typeof inputTab)}
            />
            {inputTab === "taktdown" ? (
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Lepas personil dari shop akibat takt time turun — rencana per shop dulu, baru mapping name-by-name.
                </p>
                <Button variant="primary" className="shrink-0" onClick={() => setTaktDownOpen(true)}>
                  + Takt Down
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Catat supply dari hasil improvement/Kaizen — personil yang jadi excess karena efisiensi proses.
                </p>
                <Button variant="primary" className="shrink-0" onClick={() => setKaizenOpen(true)}>
                  + Tambah Kaizen
                </Button>
              </div>
            )}
            </div>
          </Card>
          {kaizenOpen && <KaizenModal open onClose={() => setKaizenOpen(false)} />}
          {taktDownOpen && <TaktDownModal onClose={() => setTaktDownOpen(false)} poolEntries={entries} />}
        </div>
      )}

      <SectionHeading
        n={role === "admin" ? 3 : 2}
        title="Detail Supply"
        subtitle="Supply yang masih Open dan bisa diusulkan ke demand. Pilih Kontrak/Vokasi untuk menyaring."
        action={
          <SegmentedSwitch
            label="Kategori supply"
            options={[
              { value: "kontrak", label: "Kontrak" },
              { value: "vokasi", label: "Vokasi" },
            ]}
            value={kontrapVokasi}
            onChange={setKontrapVokasi}
          />
        }
      />
      {!poolReady ? (
        <div className="space-y-2" aria-busy="true" aria-label="Memuat Supply Pool">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState text="Supply Pool masih kosong. Supply baru masuk dari Takt Down, Project selesai, atau Kaizen." />
      ) : (
        <Card>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <MultiSelect label="Jenis" options={openSourceOptions} selected={selOpenSources} onChange={setSelOpenSources} />
            <MultiSelect
              label="Divisi"
              options={openDivOptions}
              selected={selOpenDivs}
              onChange={(v) => {
                setSelOpenDivs(v);
                setSelOpenDepts([]);
              }}
            />
            <MultiSelect label="Department" options={openDeptOptions} selected={selOpenDepts} onChange={setSelOpenDepts} />
            <MultiSelect label="Status MP" options={openStatusOptions} selected={selOpenStatus} onChange={setSelOpenStatus} />
            <MultiSelect label="Posisi" options={openPosisiOptions} selected={selOpenPosisi} onChange={setSelOpenPosisi} />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Bulan Masuk</span>
              <Select value={selOpenMonth} onChange={(e) => setSelOpenMonth(e.target.value)}>
                <option value="">Semua Bulan</option>
                {openMonthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          {openEntries.length === 0 ? (
            openAllEntries.length === 0 ? (
              <EmptyState text="Tidak ada supply yang masih Open." />
            ) : (
              <FilteredEmptyState onReset={resetOpenFilters} />
            )
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th freeze="noreg">Noreg</Th>
                  <Th freeze="nama">Nama</Th>
                  <Th>Status MP</Th>
                  <Th>Posisi</Th>
                  <Th>Sumber</Th>
                  <Th>Divisi</Th>
                  <Th>Prev Dept</Th>
                  <Th>Tanggal Masuk Pool</Th>
                  <Th>Lead Time in Pool</Th>
                  <Th>Sisa Kontrak</Th>
                  {role === "admin" && <Th>Aksi</Th>}
                </tr>
              </thead>
              <tbody>
                {openEntries.map((e) => {
                  const urgency = contractUrgency(e.contract_end);
                  return (
                    <tr key={e.id}>
                      <Td freeze="noreg">{e.noreg}</Td>
                      <Td freeze="nama" className="font-medium text-slate-800 dark:text-slate-100">
                        {e.nama}
                      </Td>
                      <Td>{e.type}</Td>
                      <Td>{posisiFor(e.noreg)}</Td>
                      <Td>{e.source_label}</Td>
                      <Td>{e.prev_div}</Td>
                      <Td>{e.prev_dept}</Td>
                      <Td>{fmtDate(e.entered_pool_date)}</Td>
                      <Td>{poolLeadTimeDays(e.entered_pool_date)} hari</Td>
                      <Td className={urgencyClass[urgency]}>{contractRemainingLabel(e.contract_end)}</Td>
                      {role === "admin" && (
                        <Td>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="text-red-700 dark:text-red-300"
                            aria-label={`Natural Release ${e.nama}`}
                            onClick={() => setPendingRelease(e)}
                          >
                            Natural Release
                          </Button>
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}
      <ConfirmDialog
        open={pendingRelease !== null}
        title="Natural Release?"
        confirmLabel="Ya, Release"
        tone="danger"
        onCancel={() => setPendingRelease(null)}
        onConfirm={() => {
          if (pendingRelease) {
            naturalRelease(pendingRelease.id);
            pushToast(`${pendingRelease.nama} dikeluarkan dari Supply Pool (Natural Release).`, "success");
          }
          setPendingRelease(null);
        }}
      >
        {pendingRelease && (
          <>
            <strong className="font-semibold text-slate-800 dark:text-slate-100">{pendingRelease.nama}</strong> ({pendingRelease.noreg}) keluar dari
            Supply Pool dan tidak bisa lagi diusulkan ke demand. Tindakan ini tidak bisa dibatalkan.
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
