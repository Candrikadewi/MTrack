"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addMonths, format } from "date-fns";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { FullWidthTabs } from "@/components/ui/Tabs";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, FilteredEmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { Skeleton } from "@/components/ui/Skeleton";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { BatchTileRow } from "@/components/ui/BatchTileRow";
import { DEMAND_JENIS_LABEL as JENIS_LABEL, buildDemandBatchCategories } from "@/lib/engine/batches";
import { RatioWidget, RatioScenarioCompare } from "@/components/ui/RatioWidget";
import { CollapsibleSection } from "@/components/ui/Collapsible";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SegmentedSwitch } from "@/components/ui/SegmentedSwitch";
import { NoregInput, DateInput } from "@/components/enrollment/NoregInput";
import { ReviewSection, VokasiEndedSection } from "@/components/enrollment/ReviewSections";
import { ManualDemandModal } from "@/components/enrollment/ManualDemandModal";
import { NewProjectModal } from "@/components/projects/NewProjectModal";
import { TaktUpModal } from "@/components/takt/TaktUpModal";
import { Check, Circle } from "lucide-react";
import { useStoreList, useStoreReady } from "@/lib/useStore";
import { demandStore, pkwtReviewStore, projectStore, taktStore, utilPoolStore, valueMappingStore, vokasiStore, zparStore } from "@/lib/repo";
import { fmtDate, sisaHari, fulfillmentDeadline, supplyDemandStatus, computeVokasiStatus } from "@/lib/engine/compute";
import {
  demandGranularStatus,
  demandStatusLabel,
  demandTargetDate,
  deptsOfRows,
  divisionsOfRows,
  effectiveDemandCategory,
  eligiblePoolEntriesForDemand,
  filterByDivDept,
  isDemandDue,
} from "@/lib/engine/enrollment";
import {
  confirmDemandFulfillment,
  confirmShopReceipt,
  proposePoolCandidate,
  setDemandFulfillDate,
  setDemandNoReplace,
  setDemandReplacementByNoreg,
  findRehiredEmployee,
  isRehiredAlumnus,
  linkedZparNoreg,
  linkRehiredNoreg,
  rehireCandidates,
  syncProjectSeatDemands,
  autoProjectFinishCheck,
  ensureVokasiEndedDemands,
  repairMissingPlanDemands,
} from "@/lib/engine/actions";
import { pushToast } from "@/lib/toast";
import { useRole } from "@/lib/RoleContext";
import { useSessionState } from "@/lib/useSessionState";
import type {
  Demand,
  DemandCategory,
  DemandOriginType,
  EmployeeRecord,
  EmploymentStatus,
  ReplacementStatus,
  UtilPoolEntry,
  VokasiRecord,
} from "@/lib/types";
import { isPermanenForRatio } from "@/lib/types";

const POOL_SOURCES: ReplacementStatus[] = ["MP Excess", "MP Back Up"];
const PKWT_SOURCE_OPTIONS: ReplacementStatus[] = ["PKWT New Hire", "Vokasi New Hire", "MP Excess", "MP Back Up", "No Replace"];
const VOKASI_SOURCE_OPTIONS: ReplacementStatus[] = ["Vokasi New Hire", "MP Excess", "MP Back Up", "No Replace"];


const EMPLOYMENT_STATUS_LABEL: Record<EmploymentStatus, string> = {
  "": "Belum diisi",
  Kontrak: "Kontrak",
  Permanen: "Permanen",
  Vokasi: "Vokasi",
};

function currentMonthKey(): string {
  return format(new Date(), "yyyy-MM");
}

function monthOptions(): string[] {
  const base = new Date(`${currentMonthKey()}-01T00:00:00`);
  return Array.from({ length: 13 }, (_, i) => format(addMonths(base, 6 - i), "yyyy-MM"));
}

/** Default scope for every ratio widget on this page when no Divisi/Dept
 * filter is active: Labor Type A within Vehicle Plant (Pers Area Karawang 1
 * & 2) — not the whole plant. Once a Divisi/Dept filter is picked, that
 * filter takes over as the scope instead (no Labor A/Vehicle Plant
 * restriction) — this default only exists to give the unfiltered view a
 * meaningful baseline. Dashboard's own ratio widget is unrelated and keeps
 * scoping to the whole plant regardless. */
function scopeEmployeesForRatio(employees: EmployeeRecord[], divs: string[], depts: string[]): EmployeeRecord[] {
  if (divs.length === 0 && depts.length === 0) {
    return employees.filter((e) => e.labor_type === "A" && e.plant === "Vehicle Plant");
  }
  const byDiv = divs.length ? employees.filter((e) => divs.includes(e.division)) : employees;
  return depts.length ? byDiv.filter((e) => depts.includes(e.dept)) : byDiv;
}

function scopeVokasiForRatio(vokasi: VokasiRecord[], divs: string[], depts: string[]): VokasiRecord[] {
  if (divs.length === 0 && depts.length === 0) {
    return vokasi.filter((v) => v.labor_type === "A" && v.plant === "Vehicle Plant");
  }
  const byDiv = divs.length ? vokasi.filter((v) => divs.includes(v.div)) : vokasi;
  return depts.length ? byDiv.filter((v) => depts.includes(v.dept)) : byDiv;
}

type RatioDelta = { permanen: number; kontrak: number; vokasi: number };

/** Which bucket the outgoing person is actually leaving from. Project/Takt
 * Up demands don't have an outgoing person at all (they're pure additions,
 * not a replacement of someone departing) — origin_ref there is a
 * project/case id, not a person, so this deliberately doesn't try to
 * resolve one for them. */
function outgoingBucket(
  d: Demand,
  empByNoreg: Map<string, EmployeeRecord>,
  vokasiNoregs: Set<string>
): keyof RatioDelta | null {
  if (d.origin_type === "Project" || d.origin_type === "TaktUp") return null;
  if (d.origin_type === "PkwtTerminate") return "kontrak";
  if (d.origin_type === "VokasiEnded") return "vokasi";
  const emp = empByNoreg.get(d.outgoing_noreg);
  if (emp) return isPermanenForRatio(emp.status_kontrak) ? "permanen" : "kontrak";
  if (vokasiNoregs.has(d.outgoing_noreg)) return "vokasi";
  return null;
}

/** Projection delta for one demand, following what its actual mapping
 * decides — a Permanen replaced by a new Kontrak hire nets permanen -1,
 * kontrak +1. MP Excess/MP Back Up are transfers of someone already
 * counted in the current headcount, so they net zero. Undecided demands
 * (no Source picked yet) contribute nothing — there's nothing to project
 * until a mapping choice is actually made. */
function demandRatioDelta(d: Demand, empByNoreg: Map<string, EmployeeRecord>, vokasiNoregs: Set<string>): RatioDelta {
  const delta: RatioDelta = { permanen: 0, kontrak: 0, vokasi: 0 };
  if (!d.replacement_status) return delta;
  const out = outgoingBucket(d, empByNoreg, vokasiNoregs);
  if (out) delta[out] -= 1;
  if (d.replacement_status === "PKWT New Hire") delta.kontrak += 1;
  else if (d.replacement_status === "Vokasi New Hire") delta.vokasi += 1;
  return delta;
}

// ---------------------------------------------------------------------------
// Section 1 — Ringkasan per Batch
// ---------------------------------------------------------------------------

const TILE_JENIS: Record<string, string[]> = {
  project: [JENIS_LABEL.Project],
  taktup: [JENIS_LABEL.TaktUp],
  pkwt: [JENIS_LABEL.PkwtTerminate],
  vokasi: [JENIS_LABEL.VokasiEnded],
  lainnya: (["Resign", "Pension", "PensionDini", "GST", "Unfit", "Others", "Manual"] as DemandOriginType[]).map((t) => JENIS_LABEL[t]),
};

const STATUS_OPTIONS = ["Open", "DELAY", "Need Replace ASAP", "Fulfilled Ontime", "Fulfilled but Delay"];

function todayKey(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** Nothing left to do: received by the shop, or not being replaced. */
function isDemandDone(d: Demand): boolean {
  return Boolean(d.shop_confirmed_date) || d.replacement_status === "No Replace";
}

function whoOf(d: Demand): string {
  if (d.origin_type === "Project" || d.origin_type === "TaktUp") return `${d.outgoing_label} (${d.dept})`;
  return d.outgoing_nama || d.outgoing_noreg || d.dept;
}

/** Waiting on step 2 of the mapping: a candidate is in, nobody has
 * verified it yet. */
function awaitingVerification(d: Demand): boolean {
  return Boolean(d.replacement_noreg) && !d.fulfillment_confirmed_date && d.replacement_status !== "No Replace";
}

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
      <BatchTileRow categories={batchCategories} pendingLabel="belum terpenuhi" onShowInTable={showCategoryInTable} />

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

function confirmStepLabel(d: Demand): string {
  if (d.replacement_status === "PKWT New Hire" || d.replacement_status === "Vokasi New Hire") return "Sign kontrak";
  if (d.replacement_status === "MP Excess" || d.replacement_status === "MP Back Up") return "Assigned";
  return "Verifikasi";
}

function DeadlineNote({ deadline, fulfilled }: { deadline: string; fulfilled: boolean }) {
  if (!deadline || fulfilled) return null;
  const days = sisaHari(deadline);
  const text = days < 0 ? `lewat ${-days} hari` : days === 0 ? "hari ini" : `${days} hari lagi`;
  const cls =
    days < 0
      ? "font-semibold text-red-700 dark:text-red-300"
      : days <= 5
        ? "font-semibold text-amber-700 dark:text-amber-300"
        : "text-slate-500 dark:text-slate-400";
  return (
    <div className={`mt-1 text-xs ${cls}`}>
      Batas sign/assign {fmtDate(deadline)} · {text}
    </div>
  );
}

type StepState = "done" | "current" | "todo";

function Step({ state, label, children }: { state: StepState; label: string; children?: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
          state === "done"
            ? "bg-emerald-600 text-white"
            : state === "current"
              ? "border-2 border-blue-600 dark:border-blue-400"
              : "border border-slate-300 dark:border-slate-600"
        }`}
      >
        {state === "done" ? <Check size={11} strokeWidth={3} /> : state === "current" ? <Circle size={5} className="fill-blue-600 text-blue-600 dark:fill-blue-400 dark:text-blue-400" /> : null}
      </span>
      <div className="min-w-0">
        <div
          className={`text-xs font-medium ${
            state === "todo" ? "text-slate-500 dark:text-slate-400" : "text-slate-800 dark:text-slate-100"
          }`}
        >
          {label}
          <span className="sr-only">{state === "done" ? " — selesai" : state === "current" ? " — langkah berikutnya" : " — belum"}</span>
        </div>
        {children}
      </div>
    </li>
  );
}

function DemandRow({
  demand: d,
  tab,
  canEditReplacement,
  canEditFulfillDate,
  canVerify,
  poolEntries,
}: {
  demand: Demand;
  tab: DemandCategory;
  canEditReplacement: boolean;
  canEditFulfillDate: boolean;
  canVerify: boolean;
  poolEntries: UtilPoolEntry[];
}) {
  const isLabelRow = d.origin_type === "Project" || d.origin_type === "TaktUp";
  const who = whoOf(d);
  const target = demandTargetDate(d);
  const deadline = fulfillmentDeadline(target, d.fs_status);
  const isNoReplace = d.replacement_status === "No Replace";
  const hasCandidate = Boolean(d.replacement_noreg);
  const verified = Boolean(d.fulfillment_confirmed_date);
  const isPoolSource = POOL_SOURCES.includes(d.replacement_status);
  const status = supplyDemandStatus(target, deadline, d.shop_confirmed_date);
  const recommendedEntries = !d.replacement_status ? eligiblePoolEntriesForDemand(poolEntries, d) : [];
  const isRecommended = recommendedEntries.length > 0;
  const crossSourced = d.category !== tab;
  const sourceOptions = tab === "PKWT" ? PKWT_SOURCE_OPTIONS : VOKASI_SOURCE_OPTIONS;
  const sourceLocked = verified && !isNoReplace;

  function verify() {
    confirmDemandFulfillment(d.id, todayKey());
    pushToast(`${who}: ${d.replacement_nama || d.replacement_noreg} diverifikasi.`, "success", {
      label: "Batalkan",
      onClick: () => confirmDemandFulfillment(d.id, ""),
    });
  }

  function unverify() {
    const previous = d.fulfillment_confirmed_date;
    confirmDemandFulfillment(d.id, "");
    pushToast(`Verifikasi ${who} dibatalkan.`, "success", {
      label: "Kembalikan",
      onClick: () => confirmDemandFulfillment(d.id, previous),
    });
  }

  return (
    <tr className="align-top">
      <Td freeze="only" className="min-w-[180px] max-w-[15rem] whitespace-normal">
        <div className="font-medium text-slate-800 dark:text-slate-100">
          {isLabelRow ? d.outgoing_label : d.outgoing_nama || d.outgoing_noreg}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {isLabelRow ? demandStatusLabel(d) : `${d.outgoing_noreg} · ${demandStatusLabel(d)}`}
          {crossSourced && " (dari Kontrak)"}
        </div>
      </Td>
      <Td>
        <Badge tone={statusTone(status)}>{status}</Badge>
        <DeadlineNote deadline={deadline} fulfilled={status.startsWith("Fulfilled") || verified} />
      </Td>
      <Td>
        <div>{d.dept}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{d.div}</div>
      </Td>
      <Td>
        {canEditFulfillDate ? (
          <DateInput value={d.fulfill_date || target} ariaLabel={`Tiba di shop, ${who}`} onCommit={(v) => setDemandFulfillDate(d.id, v)} />
        ) : (
          fmtDate(target)
        )}
      </Td>

      <Td>
        {canEditReplacement && !sourceLocked ? (
          <Select
            value={d.replacement_status}
            aria-label={`Source pengganti, ${who}`}
            onChange={(e) => {
              const replStatus = e.target.value as ReplacementStatus;
              if (replStatus === "No Replace") setDemandNoReplace(d.id, d.no_replace_reason);
              else setDemandReplacementByNoreg(d.id, d.replacement_noreg, replStatus);
            }}
            className={`min-w-[150px] ${isRecommended ? "border-blue-500 ring-1 ring-blue-400 dark:border-blue-500 dark:ring-blue-500/40" : ""}`}
          >
            <option value="">- pilih -</option>
            {sourceOptions.map((s) => (
              <option key={s} value={s}>
                {s}
                {isRecommended && s === "MP Excess" ? " (rekomendasi)" : ""}
              </option>
            ))}
          </Select>
        ) : (
          d.replacement_status || <span className="text-slate-500 dark:text-slate-400">-</span>
        )}
      </Td>

      <Td className="min-w-[220px] whitespace-normal">
        {isNoReplace ? (
          canEditReplacement ? (
            <NoregInput
              value={d.no_replace_reason}
              placeholder="Alasan tidak direplace..."
              ariaLabel={`Alasan tidak direplace, ${who}`}
              onCommit={(v) => setDemandNoReplace(d.id, v)}
            />
          ) : (
            <span className="text-slate-600 dark:text-slate-300">{d.no_replace_reason || "Tidak direplace"}</span>
          )
        ) : !d.replacement_status ? (
          isRecommended ? (
            <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 dark:border-blue-500/30 dark:bg-blue-500/10">
              <p className="text-xs text-blue-800 dark:text-blue-200">
                <span className="font-semibold">Rekomendasi:</span> {recommendedEntries.length} MP Excess tersedia di Supply Pool.
              </p>
              {canEditReplacement && <PoolProposal demand={d} who={who} poolEntries={poolEntries} />}
            </div>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">Pilih Source dulu</span>
          )
        ) : verified ? (
          <CandidateSummary demand={d} />
        ) : isPoolSource ? (
          canEditReplacement ? (
            <PoolProposal demand={d} who={who} poolEntries={poolEntries} />
          ) : (
            <CandidateSummary demand={d} />
          )
        ) : canEditReplacement ? (
          <div className="space-y-1">
            <NoregInput
              value={d.replacement_noreg}
              ariaLabel={`Noreg kandidat, ${who}`}
              onCommit={(v) => setDemandReplacementByNoreg(d.id, v, d.replacement_status)}
            />
            {(d.replacement_nama || d.fs_status) && <CandidateMeta demand={d} />}
          </div>
        ) : (
          <CandidateSummary demand={d} />
        )}
      </Td>

      <Td className="min-w-[200px] whitespace-normal">
        {isNoReplace || !d.replacement_status ? (
          <span className="text-slate-500 dark:text-slate-400">-</span>
        ) : (
          <ol className="space-y-2" aria-label={`Progres mapping, ${who}`}>
            <Step state={hasCandidate ? "done" : "current"} label="Diusulkan">
              {!hasCandidate && <div className="text-xs text-slate-500 dark:text-slate-400">Isi kandidat dulu</div>}
            </Step>
            <Step state={verified ? "done" : hasCandidate ? "current" : "todo"} label={confirmStepLabel(d)}>
              {verified ? (
                canVerify ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <DateInput
                      value={d.fulfillment_confirmed_date}
                      ariaLabel={`Tanggal ${confirmStepLabel(d).toLowerCase()}, ${who}`}
                      onCommit={(v) => (v ? confirmDemandFulfillment(d.id, v) : unverify())}
                    />
                    <button
                      type="button"
                      onClick={unverify}
                      className="min-h-9 rounded-lg px-2 text-xs font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-300 dark:hover:text-white"
                    >
                      Batalkan
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-slate-600 dark:text-slate-300">{fmtDate(d.fulfillment_confirmed_date)}</div>
                )
              ) : hasCandidate ? (
                canVerify ? (
                  <Button size="sm" variant="primary" className="mt-1" onClick={verify}>
                    Verifikasi
                  </Button>
                ) : (
                  <div className="text-xs text-amber-700 dark:text-amber-300">Menunggu verifikasi HR</div>
                )
              ) : null}
            </Step>
            <Step state={d.shop_confirmed_date ? "done" : verified ? "current" : "todo"} label="Diterima shop">
              {verified && (
                <ShopConfirmCell
                  value={d.shop_confirmed_date}
                  who={who}
                  canEdit={canEditReplacement}
                  onChange={(v) => confirmShopReceipt(d.id, v)}
                />
              )}
            </Step>
          </ol>
        )}
      </Td>
    </tr>
  );
}

function CandidateMeta({ demand: d }: { demand: Demand }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
      {d.replacement_nama && <span>{d.replacement_nama}</span>}
      {d.replacement_dept && <span>· {d.replacement_dept}</span>}
      {d.fs_status && <Badge tone={statusTone(d.fs_status)}>{d.fs_status}</Badge>}
    </div>
  );
}

function CandidateSummary({ demand: d }: { demand: Demand }) {
  if (!d.replacement_noreg) return <span className="text-slate-500 dark:text-slate-400">Belum ada kandidat</span>;
  return (
    <div>
      <div className="text-slate-800 dark:text-slate-100">
        {d.replacement_nama || d.replacement_noreg} <span className="text-xs text-slate-500 dark:text-slate-400">{d.replacement_noreg}</span>
      </div>
      <CandidateMeta demand={{ ...d, replacement_nama: "" }} />
      <RehiredNoreg demand={d} />
    </div>
  );
}

/** A Vokasi alumnus mapped as PKWT New Hire signs under a new noreg. After
 * sign kontrak it shows the confirmed ZPAR noreg, or — until one is
 * confirmed — the same-name ZPAR candidates with the checks behind each,
 * for an admin to pick (or type the noreg when the name differs). */
function RehiredNoreg({ demand: d }: { demand: Demand }) {
  const isAdmin = useRole() === "admin";
  const [editing, setEditing] = useState(false);
  const [manual, setManual] = useState("");
  if (!isRehiredAlumnus(d)) return null;
  const linked = linkedZparNoreg(d.replacement_noreg);
  if (!d.fulfillment_confirmed_date) {
    return <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Noreg ZPAR ditautkan setelah sign kontrak</div>;
  }
  if (linked && !editing) {
    const emp = findRehiredEmployee(d.replacement_noreg);
    return (
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        Noreg ZPAR: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{linked}</span>
        {!emp && <span>(belum di ZPAR aktif)</span>}
        {isAdmin && (
          <button type="button" onClick={() => setEditing(true)} className="font-medium text-blue-700 hover:underline dark:text-blue-400">
            Ubah
          </button>
        )}
      </div>
    );
  }
  const candidates = rehireCandidates(d);
  const confirm = (noreg: string) => {
    linkRehiredNoreg(d.replacement_noreg, noreg);
    setEditing(false);
    setManual("");
    pushToast(`${d.replacement_nama || d.replacement_noreg} ditautkan ke noreg ZPAR ${noreg}.`, "success");
  };
  return (
    <div className="mt-1.5 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="font-semibold text-amber-800 dark:text-amber-200">Noreg ZPAR belum dikonfirmasi</div>
      {candidates.length === 0 ? (
        <p className="text-amber-800/80 dark:text-amber-200/80">Belum ada nama yang sama di ZPAR aktif. Tunggu ZPAR berikutnya, atau isi noreg-nya.</p>
      ) : (
        <ul className="space-y-1.5">
          {candidates.map((c) => (
            <li key={c.employee.noreg} className="rounded-md bg-white/80 p-1.5 dark:bg-slate-900/60">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {c.employee.noreg} · {c.employee.dept || "-"} · masuk {fmtDate(c.employee.tgl_masuk)}
                </span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => confirm(c.employee.noreg)}
                    className="shrink-0 rounded-md bg-blue-600 px-2 py-0.5 font-semibold text-white hover:bg-blue-700"
                  >
                    Pakai
                  </button>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {c.checks.map((ch) => (
                  <span
                    key={ch.label}
                    className={`rounded-full px-1.5 py-0.5 ${
                      ch.ok
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300"
                    }`}
                  >
                    {ch.ok ? "✓" : "✕"} {ch.label}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {isAdmin && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) confirm(manual.trim());
          }}
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Noreg ZPAR lain"
            aria-label={`Noreg ZPAR untuk ${d.replacement_nama || d.replacement_noreg}`}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
          />
          <button type="submit" disabled={!manual.trim()} className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900">
            Simpan
          </button>
          {editing && (
            <button type="button" onClick={() => setEditing(false)} className="px-1 text-slate-500 hover:underline">
              Batal
            </button>
          )}
        </form>
      )}
    </div>
  );
}

function ShopConfirmCell({
  value,
  who,
  canEdit,
  onChange,
}: {
  value: string;
  who: string;
  canEdit: boolean;
  onChange: (date: string) => void;
}) {
  const checked = Boolean(value);
  if (!canEdit) {
    return (
      <div className="text-xs text-slate-600 dark:text-slate-300">{checked ? fmtDate(value) : "Menunggu konfirmasi shop"}</div>
    );
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked ? todayKey() : "")}
          className="h-4 w-4 shrink-0 rounded border-slate-400 text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-600 dark:bg-slate-900"
        />
        Sudah diterima
        <span className="sr-only">, {who}</span>
      </label>
      {checked && <DateInput value={value} ariaLabel={`Tanggal diterima shop, ${who}`} onCommit={onChange} />}
    </div>
  );
}

/** Step 1 of pool mapping. Picking a person only stages a draft; nothing is
 * saved until "Usulkan", which reserves them for this demand and leaves the
 * demand Open until HR/admin verifies. */
function PoolProposal({ demand, who, poolEntries }: { demand: Demand; who: string; poolEntries: UtilPoolEntry[] }) {
  const [changing, setChanging] = useState(false);
  const [draftId, setDraftId] = useState("");
  const eligible = eligiblePoolEntriesForDemand(poolEntries, demand);
  const current = demand.replacement_noreg ? eligible.find((e) => e.noreg === demand.replacement_noreg) : undefined;
  const choices = eligible.filter((e) => e.noreg !== demand.replacement_noreg);
  const draft = choices.find((e) => e.id === draftId);

  function propose() {
    if (!draft) return;
    const previousId = current?.id ?? null;
    proposePoolCandidate(draft.id, demand.id);
    pushToast(`${draft.nama} diusulkan untuk ${demand.dept}. Menunggu verifikasi HR.`, "success", {
      label: "Batalkan",
      onClick: () => proposePoolCandidate(previousId, demand.id),
    });
    setDraftId("");
    setChanging(false);
  }

  function withdraw() {
    if (!current) return;
    const previousId = current.id;
    proposePoolCandidate(null, demand.id);
    pushToast(`Usulan ${current.nama} ditarik, kembali ke Supply Pool.`, "success", {
      label: "Batalkan",
      onClick: () => proposePoolCandidate(previousId, demand.id),
    });
  }

  if (demand.replacement_noreg && !changing) {
    return (
      <div className="space-y-1.5">
        <CandidateSummary demand={demand} />
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setChanging(true)}
            className="min-h-8 rounded-lg px-2 text-xs font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300 dark:hover:bg-blue-500/10"
          >
            Ganti
          </button>
          {current && (
            <button
              type="button"
              onClick={withdraw}
              className="min-h-8 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Tarik usulan
            </button>
          )}
        </div>
      </div>
    );
  }

  if (choices.length === 0) {
    return <span className="text-xs text-slate-500 dark:text-slate-400">Tidak ada MP di Supply Pool yang bisa diusulkan.</span>;
  }

  return (
    <div className="space-y-1.5">
      <Select value={draftId} aria-label={`Pilih kandidat Supply Pool, ${who}`} onChange={(e) => setDraftId(e.target.value)} className="min-w-[200px]">
        <option value="">- pilih dari Supply Pool -</option>
        {choices.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nama} ({e.noreg}) — {e.prev_dept}
            {e.prev_dept !== demand.dept ? " · beda dept" : ""}
          </option>
        ))}
      </Select>
      {draft && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {draft.nama} → {demand.dept}
          {draft.prev_dept !== demand.dept && <> (pindah dari {draft.prev_dept})</>}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="primary" disabled={!draft} onClick={propose}>
          Usulkan
        </Button>
        {changing && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setChanging(false);
              setDraftId("");
            }}
          >
            Batal
          </Button>
        )}
      </div>
    </div>
  );
}
