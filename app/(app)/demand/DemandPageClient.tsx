"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { FullWidthTabs } from "@/components/ui/Tabs";
import { EmptyState, FilteredEmptyState, TableWrap, Th } from "@/components/ui/Table";
import { Skeleton } from "@/components/ui/Skeleton";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { BatchTileRow } from "@/components/ui/BatchTileRow";
import { DEMAND_JENIS_LABEL as JENIS_LABEL, buildDemandBatchCategories } from "@/lib/engine/batches";
import { RatioWidget, RatioScenarioCompare } from "@/components/ui/RatioWidget";
import { CollapsibleSection } from "@/components/ui/Collapsible";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SegmentedSwitch } from "@/components/ui/SegmentedSwitch";
import { ReviewSection, VokasiEndedSection } from "@/components/enrollment/ReviewSections";
import { ManualDemandModal } from "@/components/enrollment/ManualDemandModal";
import { NewProjectModal } from "@/components/projects/NewProjectModal";
import { TaktUpModal } from "@/components/takt/TaktUpModal";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useStoreList, useStoreReady } from "@/lib/useStore";
import {
  demandStore,
  pkwtReviewStore,
  projectStore,
  taktStore,
  utilPoolStore,
  valueMappingStore,
  vokasiStore,
  zparStore,
} from "@/lib/repo";
import { fmtDate, computeVokasiStatus } from "@/lib/engine/compute";
import {
  demandGranularStatus,
  demandStatusLabel,
  demandTargetDate,
  deptsOfRows,
  divisionsOfRows,
  effectiveDemandCategory,
  filterByDivDept,
  isDemandDue,
} from "@/lib/engine/enrollment";
import {
  deleteManualDemand,
  deleteProject,
  deleteTaktUp,
  isEditableDemand,
  syncProjectSeatDemands,
  autoProjectFinishCheck,
  ensureVokasiEndedDemands,
  repairMissingPlanDemands,
} from "@/lib/engine/actions";
import { pushToast } from "@/lib/toast";
import { useRole } from "@/lib/RoleContext";
import { useSessionState } from "@/lib/useSessionState";
import { currentMonthKey } from "@/lib/dates";
import type { Demand, DemandCategory } from "@/lib/types";
import { isPermanenForRatio } from "@/lib/types";
import { DemandRow } from "./_components/DemandRow";
import {
  EMPLOYMENT_STATUS_LABEL,
  monthOptions,
  TILE_JENIS,
  STATUS_OPTIONS,
  MANUAL_ORIGINS,
  isDemandDone,
  whoOf,
  awaitingVerification,
} from "./_components/demandHelpers";
import { scopeEmployeesForRatio, scopeVokasiForRatio, demandRatioDelta } from "./_components/ratio";
import type { RatioDelta } from "./_components/ratio";

export function DemandPageClient() {
  const role = useRole();
  const isAdmin = role === "admin";
  const canReview = role === "admin" || role === "hr";
  const canVerify = role === "admin" || role === "hr";

  const demands = useStoreList(demandStore);
  const demandsReady = useStoreReady(demandStore);
  const poolEntries = useStoreList(utilPoolStore);
  const projects = useStoreList(projectStore);
  const taktCases = useStoreList(taktStore);
  const reviews = useStoreList(pkwtReviewStore);
  const vokasi = useStoreList(vokasiStore);
  const snapshots = useStoreList(zparStore);
  // Confirmed Vokasi → ZPAR noreg links for rehired alumni (RehiredNoreg).
  useStoreList(valueMappingStore);
  const employees = useMemo(() => snapshots.find((s) => s.is_active)?.employees ?? [], [snapshots]);
  const empByNoreg = useMemo(() => new Map(employees.map((e) => [e.noreg, e])), [employees]);
  const vokasiNoregs = useMemo(() => new Set(vokasi.map((v) => v.noreg)), [vokasi]);

  // Admin only (the fixes go through admin-scoped writes): process project
  // releases that are due and bring project seats' replacement demands in
  // line with each row's release date.
  const projectsReady = useStoreReady(projectStore);
  const poolReady = useStoreReady(utilPoolStore);
  const vokasiReady = useStoreReady(vokasiStore);
  const zparReady = useStoreReady(zparStore);
  const taktReady = useStoreReady(taktStore);
  const mappingsReady = useStoreReady(valueMappingStore);
  const releaseInputsReady = demandsReady && projectsReady && poolReady && vokasiReady && zparReady && taktReady && mappingsReady;
  useEffect(() => {
    if (!isAdmin || !releaseInputsReady) return;
    // Recreate demands whose insert was rejected before blank dates were
    // sent as null, then run the usual release/sync passes over them.
    Promise.all([repairMissingPlanDemands(), ensureVokasiEndedDemands()]).then(() => {
      autoProjectFinishCheck();
      syncProjectSeatDemands();
    });
  }, [isAdmin, releaseInputsReady]);

  const batchCategories = useMemo(() => buildDemandBatchCategories(demands, projects, taktCases), [demands, projects, taktCases]);

  // Section numbers follow what this role can actually see, so nobody reads
  // "1, 2, 4" and wonders what they're missing.
  const sectionNo = {
    enroll: canReview ? 2 : 0,
    input: isAdmin ? (canReview ? 3 : 2) : 0,
    detail: 2 + (canReview ? 1 : 0) + (isAdmin ? 1 : 0),
  };

  // ---- Enrollment Review ----
  const [enrollTab, setEnrollTab] = useSessionState<DemandCategory>("enrollment.tab", "PKWT");
  const [period, setPeriod] = useSessionState<string>("enrollment.period", currentMonthKey());
  const [reviewDivs, setReviewDivs] = useSessionState<string[]>("enrollment.pkwt.divs", []);
  const [reviewDepts, setReviewDepts] = useSessionState<string[]>("enrollment.pkwt.depts", []);
  const [vokasiDivs, setVokasiDivs] = useSessionState<string[]>("enrollment.vokasi.divs", []);
  const [vokasiDepts, setVokasiDepts] = useSessionState<string[]>("enrollment.vokasi.depts", []);

  const fulfilledVokasiIds = useMemo(
    () => new Set(demands.filter((d) => d.category === "Vokasi" && d.status === "Fulfilled").map((d) => d.origin_ref)),
    [demands]
  );
  const activeDivs = enrollTab === "PKWT" ? reviewDivs : vokasiDivs;
  const activeDepts = enrollTab === "PKWT" ? reviewDepts : vokasiDepts;
  const enrollmentRatioCounts = useMemo(() => {
    const emps = scopeEmployeesForRatio(employees, activeDivs, activeDepts);
    const vok = scopeVokasiForRatio(vokasi, activeDivs, activeDepts).filter(
      (v) => computeVokasiStatus(v.tgl_ended, fulfilledVokasiIds.has(v.id)) !== "Ended"
    );
    return {
      permanen: emps.filter((e) => isPermanenForRatio(e.status_kontrak)).length,
      kontrak: emps.filter((e) => !isPermanenForRatio(e.status_kontrak)).length,
      vokasi: vok.length,
    };
  }, [employees, vokasi, activeDivs, activeDepts, fulfilledVokasiIds]);

  // ---- Input Demand Baru ----
  const [inputTab, setInputTab] = useSessionState<"project" | "taktup" | "manual">("demand.input.tab", "project");
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [taktUpOpen, setTaktUpOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingTaktUpId, setEditingTaktUpId] = useState<string | null>(null);
  const [editingManualId, setEditingManualId] = useState<string | null>(null);
  const [deletingManual, setDeletingManual] = useState<Demand | null>(null);

  // ---- Detail dan Mapping Demand ----
  const [tab, setTab] = useSessionState<DemandCategory>("demand.detail.tab", "PKWT");
  const [showDone, setShowDone] = useSessionState<boolean>("demand.detail.showDone", false);
  const [jenis, setJenis] = useSessionState<string[]>("demand.detail.jenis", []);
  const [divs, setDivs] = useSessionState<string[]>("demand.detail.divs", []);
  const [depts, setDepts] = useSessionState<string[]>("demand.detail.depts", []);
  const [statusMp, setStatusMp] = useSessionState<string[]>("demand.detail.statusMp", []);
  const [statusFilter, setStatusFilter] = useSessionState<string[]>("demand.detail.status", []);
  const [onlyAwaiting, setOnlyAwaiting] = useSessionState<boolean>("demand.detail.awaiting", false);
  const detailRef = useRef<HTMLElement>(null);

  const tabDemands = useMemo(() => demands.filter((d) => effectiveDemandCategory(d) === tab), [demands, tab]);
  // Every active demand, whatever its month — a period filter could hide
  // one that's still open in another month. Done (received by the shop, or
  // No Replace) is hidden unless asked for; Vokasi counts from the month
  // its batch ends.
  const monthDemands = useMemo(
    () => tabDemands.filter((d) => isDemandDue(d) && (showDone || !isDemandDone(d))),
    [tabDemands, showDone]
  );
  const jenisOptions = useMemo(() => Array.from(new Set(monthDemands.map((d) => JENIS_LABEL[d.origin_type]))).sort(), [monthDemands]);
  const divOptions = useMemo(() => divisionsOfRows(monthDemands), [monthDemands]);
  const deptOptions = useMemo(() => deptsOfRows(monthDemands, divs), [monthDemands, divs]);
  const statusMpOptions = Object.values(EMPLOYMENT_STATUS_LABEL);

  const filteredDemands = useMemo(
    () =>
      filterByDivDept(monthDemands, divs, depts)
        .filter((d) => jenis.length === 0 || jenis.includes(JENIS_LABEL[d.origin_type]))
        .filter((d) => statusMp.length === 0 || statusMp.includes(EMPLOYMENT_STATUS_LABEL[d.replacement_employment_status]))
        .filter((d) => statusFilter.length === 0 || statusFilter.includes(demandGranularStatus(d)))
        .filter((d) => !onlyAwaiting || awaitingVerification(d))
        .slice()
        .sort((a, b) => demandTargetDate(a).localeCompare(demandTargetDate(b))),
    [monthDemands, divs, depts, jenis, statusMp, statusFilter, onlyAwaiting]
  );

  const canEditReplacement = isAdmin || (role === "shop" && tab === "PKWT");
  const canEditFulfillDate = isAdmin;

  const totalCount = monthDemands.length;
  const shopReceivedCount = monthDemands.filter((d) => demandGranularStatus(d).startsWith("Fulfilled")).length;
  const awaitingCount = monthDemands.filter(awaitingVerification).length;
  const activeFilterCount = jenis.length + divs.length + depts.length + statusMp.length + statusFilter.length + (onlyAwaiting ? 1 : 0);

  function resetDetailFilters() {
    setJenis([]);
    setDivs([]);
    setDepts([]);
    setStatusMp([]);
    setStatusFilter([]);
    setOnlyAwaiting(false);
  }

  function showCategoryInTable(key: string) {
    const labels = TILE_JENIS[key] ?? [];
    const open = demands.filter(
      (d) => d.status !== "Fulfilled" && d.replacement_status !== "No Replace" && isDemandDue(d) && labels.includes(JENIS_LABEL[d.origin_type])
    );
    const inTab = (c: DemandCategory) => open.filter((d) => effectiveDemandCategory(d) === c).length;
    const nextTab: DemandCategory =
      key === "pkwt" ? "PKWT" : key === "vokasi" ? "Vokasi" : inTab(tab) > 0 ? tab : inTab("PKWT") > 0 ? "PKWT" : "Vokasi";
    setTab(nextTab);
    resetDetailFilters();
    setJenis(labels);
    detailRef.current?.scrollIntoView({ block: "start" });
    detailRef.current?.focus({ preventScroll: true });
  }

  // Ratio scope follows the same Divisi/Dept filter as the table below —
  // unfiltered defaults to Labor A within Vehicle Plant, not the whole plant.
  const scenarioBase = useMemo(() => {
    const emps = scopeEmployeesForRatio(employees, divs, depts);
    const vok = scopeVokasiForRatio(vokasi, divs, depts).filter(
      (v) => computeVokasiStatus(v.tgl_ended, fulfilledVokasiIds.has(v.id)) !== "Ended"
    );
    return {
      permanen: emps.filter((e) => isPermanenForRatio(e.status_kontrak)).length,
      kontrak: emps.filter((e) => !isPermanenForRatio(e.status_kontrak)).length,
      vokasi: vok.length,
    };
  }, [employees, vokasi, divs, depts, fulfilledVokasiIds]);

  // Projection follows the actual mapping decided per demand (any category,
  // any month — not just what's currently visible in the table), scoped to
  // the same Divisi/Dept filter.
  const { decidedCount, projectionCounts } = useMemo(() => {
    const decided = filterByDivDept(demands, divs, depts).filter((d) => d.replacement_status !== "");
    const delta = decided.reduce<RatioDelta>(
      (acc, d) => {
        const x = demandRatioDelta(d, empByNoreg, vokasiNoregs);
        return { permanen: acc.permanen + x.permanen, kontrak: acc.kontrak + x.kontrak, vokasi: acc.vokasi + x.vokasi };
      },
      { permanen: 0, kontrak: 0, vokasi: 0 }
    );
    return {
      decidedCount: decided.length,
      projectionCounts: {
        permanen: Math.max(0, scenarioBase.permanen + delta.permanen),
        kontrak: Math.max(0, scenarioBase.kontrak + delta.kontrak),
        vokasi: Math.max(0, scenarioBase.vokasi + delta.vokasi),
      },
    };
  }, [demands, divs, depts, empByNoreg, vokasiNoregs, scenarioBase]);

  const monthLabel = showDone ? "Semua demand" : "Demand aktif";

  function exportReport() {
    import("xlsx").then((XLSX) => {
      const summarySheet = XLSX.utils.aoa_to_sheet([
        ["Demand Report", monthLabel, tab],
        [],
        ["Total Demand", totalCount],
        ["Menunggu verifikasi", awaitingCount],
        ["Diterima shop", shopReceivedCount],
        [],
        ["Rasio Sekarang", `${scenarioBase.permanen} : ${scenarioBase.kontrak} : ${scenarioBase.vokasi}`],
        ["Rasio Proyeksi", `${projectionCounts.permanen} : ${projectionCounts.kontrak} : ${projectionCounts.vokasi}`],
      ]);
      const detailRows = filteredDemands.map((d) => ({
        Kebutuhan: demandStatusLabel(d),
        Outgoing: d.outgoing_label || `${d.outgoing_nama} (${d.outgoing_noreg})`,
        Divisi: d.div,
        Department: d.dept,
        "Tiba di Shop": fmtDate(demandTargetDate(d)),
        Source: d.replacement_status,
        Kandidat: d.replacement_nama ? `${d.replacement_nama} (${d.replacement_noreg})` : "-",
        "FS Status": d.fs_status,
        Verifikasi: d.fulfillment_confirmed_date ? fmtDate(d.fulfillment_confirmed_date) : "-",
        "Diterima Shop": d.shop_confirmed_date ? fmtDate(d.shop_confirmed_date) : "-",
        "Status Demand": demandGranularStatus(d),
      }));
      const detailSheet = XLSX.utils.json_to_sheet(detailRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
      XLSX.utils.book_append_sheet(wb, detailSheet, "Detail");
      XLSX.writeFile(wb, `Demand-Report-${tab}-${showDone ? "semua" : "aktif"}.xlsx`);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Demand</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Kebutuhan MP pengganti — dari review kontrak, Vokasi berakhir, project, dan takt — sampai kandidatnya diterima shop.
        </p>
      </div>

      <SectionHeading n={1} title="Ringkasan per Batch" subtitle="Jumlah MP yang belum terpenuhi (belum diverifikasi) dari total demand sampai bulan ini. Vokasi dihitung mulai bulan berakhirnya. Klik tile untuk rincian." divider={false} />
      <BatchTileRow
        categories={batchCategories}
        pendingLabel="belum terpenuhi"
        onShowInTable={showCategoryInTable}
        batchActions={
          isAdmin
            ? (key, batch) => {
                if (key === "project" && projects.some((p) => p.id === batch.id)) {
                  return {
                    onEdit: () => setEditingProjectId(batch.id),
                    onDelete: () => {
                      deleteProject(batch.id);
                      pushToast(`Project ${batch.label} dihapus.`, "success");
                    },
                    deleteNote: "Demand yang belum berjalan ikut terhapus. Demand yang sudah punya kandidat atau pemenuhan tetap tersimpan.",
                  };
                }
                if (key === "taktup" && taktCases.some((t) => t.id === batch.id)) {
                  return {
                    onEdit: () => setEditingTaktUpId(batch.id),
                    onDelete: () => {
                      deleteTaktUp(batch.id);
                      pushToast("Takt Up dihapus.", "success");
                    },
                    deleteNote: "Demand yang belum berjalan ikut terhapus. Demand yang sudah punya kandidat atau pemenuhan tetap tersimpan.",
                  };
                }
                return null;
              }
            : undefined
        }
      />

      {canReview && (
        <CollapsibleSection
          n={sectionNo.enroll}
          title="Enrollment Review"
          subtitle="Keputusan Continue/Terminate PKWT dan Vokasi yang berakhir. Terminate membuka demand pengganti."
          defaultOpen={role === "hr"}
        >
          <RatioWidget
            title="Rasio Permanen : Kontrak : Vokasi — Saat Ini"
            counts={enrollmentRatioCounts}
            scopeLabel={activeDivs.length || activeDepts.length ? "Sesuai filter" : "Vehicle Plant · Labor A"}
          />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Periode review</span>
              <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40">
                {monthOptions().map((m) => (
                  <option key={m} value={m}>
                    {format(new Date(`${m}-01T00:00:00`), "MMM yyyy")}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <FullWidthTabs
            tabs={[
              { key: "PKWT", label: "Kontrak (PKWT)" },
              { key: "Vokasi", label: "Vokasi" },
            ]}
            active={enrollTab}
            onChange={(k) => setEnrollTab(k as DemandCategory)}
          />
          {enrollTab === "PKWT" ? (
            <ReviewSection
              period={period}
              reviews={reviews}
              canEditReview={canReview}
              divs={reviewDivs}
              depts={reviewDepts}
              onDivsChange={setReviewDivs}
              onDeptsChange={setReviewDepts}
            />
          ) : (
            <VokasiEndedSection
              period={period}
              vokasi={vokasi}
              divs={vokasiDivs}
              depts={vokasiDepts}
              onDivsChange={setVokasiDivs}
              onDeptsChange={setVokasiDepts}
            />
          )}
        </CollapsibleSection>
      )}

      {isAdmin && (
        <div className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-800">
          <SectionHeading n={sectionNo.input} title="Input Demand Baru" divider={false} />
          <Card>
            <div className="space-y-4">
              <FullWidthTabs
                tabs={[
                  { key: "project", label: "Project Baru" },
                  { key: "taktup", label: "Takt Up" },
                  { key: "manual", label: "Manual" },
                ]}
                active={inputTab}
                onChange={(k) => setInputTab(k as typeof inputTab)}
              />
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {inputTab === "project"
                    ? "Daftarkan project baru beserta rincian kebutuhan MP per divisi/department."
                    : inputTab === "taktup"
                      ? "Catat kebutuhan MP dari perubahan takt time (takt naik → butuh tambahan MP)."
                      : "Demand di luar review otomatis: GST, Unfit, Resign, Pensiun, Pensiun Dini, atau alasan lain."}
                </p>
                <Button
                  variant="primary"
                  className="shrink-0"
                  onClick={() =>
                    inputTab === "project" ? setProjectModalOpen(true) : inputTab === "taktup" ? setTaktUpOpen(true) : setManualOpen(true)
                  }
                >
                  {inputTab === "project" ? "+ Project Baru" : inputTab === "taktup" ? "+ Takt Up" : "+ Manual Demand"}
                </Button>
              </div>
            </div>
          </Card>
          {projectModalOpen && <NewProjectModal open onClose={() => setProjectModalOpen(false)} />}
          {taktUpOpen && <TaktUpModal open onClose={() => setTaktUpOpen(false)} />}
          {manualOpen && <ManualDemandModal open onClose={() => setManualOpen(false)} />}
          {editingProjectId && projects.find((p) => p.id === editingProjectId) && (
            <NewProjectModal open project={projects.find((p) => p.id === editingProjectId)} onClose={() => setEditingProjectId(null)} />
          )}
          {editingTaktUpId && taktCases.find((t) => t.id === editingTaktUpId) && (
            <TaktUpModal open editing={taktCases.find((t) => t.id === editingTaktUpId)} onClose={() => setEditingTaktUpId(null)} />
          )}
          <ConfirmDialog
            open={deletingManual !== null}
            title={`Hapus demand ${deletingManual ? whoOf(deletingManual) : ""}?`}
            confirmLabel="Hapus"
            tone="danger"
            onCancel={() => setDeletingManual(null)}
            onConfirm={() => {
              if (deletingManual) {
                const error = deleteManualDemand(deletingManual.id);
                pushToast(error ?? "Demand dihapus.", error ? "error" : "success");
              }
              setDeletingManual(null);
            }}
          >
            Demand ini belum punya kandidat, jadi bisa dihapus tanpa mengubah riwayat.
          </ConfirmDialog>
          {editingManualId && demands.find((d) => d.id === editingManualId) && (
            <ManualDemandModal open editing={demands.find((d) => d.id === editingManualId)} onClose={() => setEditingManualId(null)} />
          )}
        </div>
      )}

      <section ref={detailRef} tabIndex={-1} aria-labelledby="detail-demand-heading" className="scroll-mt-4 space-y-4 outline-none">
        <SectionHeading
          n={sectionNo.detail}
          title={<span id="detail-demand-heading">Detail dan Mapping Demand</span>}
          subtitle="Shop mengusulkan kandidat, HR memverifikasi, lalu shop konfirmasi kandidat sudah diterima."
          action={
            <SegmentedSwitch
              label="Kategori demand"
              options={[
                { value: "PKWT", label: "Kontrak" },
                { value: "Vokasi", label: "Vokasi" },
              ]}
              value={tab}
              onChange={setTab}
            />
          }
        />

        <RatioScenarioCompare
          scopeLabel={divs.length || depts.length ? "Sesuai filter" : "Vehicle Plant · Labor A"}
          scenarios={[
            { label: "Sekarang", counts: scenarioBase },
            { label: "Proyeksi", counts: projectionCounts, hint: `Mengikuti ${decidedCount} demand yang sudah punya Source dipilih` },
          ]}
        />

        <Card
          title={`Detail Demand — ${monthLabel}`}
          subtitle="Semua demand yang masih berjalan dari bulan mana pun, urut dari Tiba di Shop terdekat. Selesai = sudah diterima shop atau No Replace."
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={showDone}
                  onChange={(e) => setShowDone(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500"
                />
                Tampilkan yang sudah selesai
              </label>
              <Button variant="secondary" size="sm" onClick={exportReport} disabled={filteredDemands.length === 0}>
                Laporan Excel
              </Button>
              <Button variant="secondary" size="sm" onClick={() => window.print()} disabled={filteredDemands.length === 0}>
                Cetak
              </Button>
            </div>
          }
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MultiSelect label="Jenis" options={jenisOptions} selected={jenis} onChange={setJenis} />
            <MultiSelect
              label="Divisi"
              options={divOptions}
              selected={divs}
              onChange={(v) => {
                setDivs(v);
                setDepts([]);
              }}
            />
            <MultiSelect label="Department" options={deptOptions} selected={depts} onChange={setDepts} />
            <MultiSelect label="Status MP" options={statusMpOptions} selected={statusMp} onChange={setStatusMp} />
            <MultiSelect label="Status Demand" options={STATUS_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-400">
            <p>
              <span className="font-semibold text-slate-800 tabular-nums dark:text-slate-100">{shopReceivedCount}</span> dari{" "}
              <span className="font-semibold text-slate-800 tabular-nums dark:text-slate-100">{totalCount}</span> demand sudah diterima shop
              {awaitingCount > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-amber-700 tabular-nums dark:text-amber-300">{awaitingCount}</span> menunggu verifikasi
                </>
              )}
              .
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {(awaitingCount > 0 || onlyAwaiting) && (
                <button
                  type="button"
                  aria-pressed={onlyAwaiting}
                  onClick={() => setOnlyAwaiting((v) => !v)}
                  className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                    onlyAwaiting
                      ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  Hanya yang menunggu verifikasi
                </button>
              )}
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={resetDetailFilters}>
                  Reset filter ({activeFilterCount})
                </Button>
              )}
            </div>
          </div>

          {!demandsReady ? (
            <div className="space-y-2" aria-busy="true" aria-label="Memuat demand">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredDemands.length === 0 ? (
            monthDemands.length === 0 ? (
              <EmptyState text={`Tidak ada demand ${tab === "PKWT" ? "Kontrak" : "Vokasi"} yang ${showDone ? "tercatat" : "masih aktif"}.`} />
            ) : (
              <FilteredEmptyState onReset={resetDetailFilters} />
            )
          ) : (
            <TableWrap maxHeightClass="max-h-[70vh]">
              <thead>
                <tr>
                  <Th freeze="only">Kebutuhan</Th>
                  <Th>Status</Th>
                  <Th>Department</Th>
                  <Th>Tiba di Shop</Th>
                  <Th>Source</Th>
                  <Th>Kandidat</Th>
                  <Th>Progres</Th>
                </tr>
              </thead>
              <tbody>
                {filteredDemands.map((d) => (
                  <DemandRow
                    key={d.id}
                    demand={d}
                    tab={tab}
                    canEditReplacement={canEditReplacement}
                    canEditFulfillDate={canEditFulfillDate}
                    canVerify={canVerify}
                    poolEntries={poolEntries}
                    onEdit={isAdmin && MANUAL_ORIGINS.includes(d.origin_type) && isEditableDemand(d) ? () => setEditingManualId(d.id) : undefined}
                    onDelete={isAdmin && MANUAL_ORIGINS.includes(d.origin_type) && isEditableDemand(d) ? () => setDeletingManual(d) : undefined}
                  />
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </section>
    </div>
  );
}
