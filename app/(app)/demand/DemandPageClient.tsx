"use client";
import { useMemo, useState } from "react";
import { addMonths, format } from "date-fns";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { FullWidthTabs } from "@/components/ui/Tabs";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { DonutChart } from "@/components/ui/DonutChart";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { BatchTileRow, type BatchTileCategory } from "@/components/ui/BatchTileRow";
import { RatioWidget, RatioScenarioCompare } from "@/components/ui/RatioWidget";
import { CollapsibleSection } from "@/components/ui/Collapsible";
import { SectionHeading, NumberBadge } from "@/components/ui/SectionHeading";
import { SegmentedSwitch } from "@/components/ui/SegmentedSwitch";
import { NoregInput, DateInput } from "@/components/enrollment/NoregInput";
import { ReviewSection, VokasiEndedSection } from "@/components/enrollment/ReviewSections";
import { ManualDemandModal } from "@/components/enrollment/ManualDemandModal";
import { NewProjectModal } from "@/components/projects/NewProjectModal";
import { TaktUpModal } from "@/components/takt/TaktUpModal";
import { useStoreList } from "@/lib/useStore";
import { demandStore, pkwtReviewStore, projectStore, taktStore, utilPoolStore, vokasiStore, zparStore } from "@/lib/repo";
import { fmtDate, sisaHari, demandVisibleDate, fulfillmentDeadline, supplyDemandStatus, computeVokasiStatus } from "@/lib/engine/compute";
import {
  demandGranularStatus,
  demandStatusLabel,
  demandTargetDate,
  deptsOfRows,
  divisionsOfRows,
  effectiveDemandCategory,
  eligiblePoolEntriesForDemand,
  filterByDivDept,
} from "@/lib/engine/enrollment";
import {
  assignPoolEntryToDemand,
  confirmDemandFulfillment,
  confirmShopReceipt,
  setDemandFulfillDate,
  setDemandNoReplace,
  setDemandReplacementByNoreg,
} from "@/lib/engine/actions";
import { useRole } from "@/lib/RoleContext";
import { useSessionState } from "@/lib/useSessionState";
import type {
  Demand,
  DemandCategory,
  DemandOriginType,
  EmploymentStatus,
  Project,
  ReplacementStatus,
  TaktCase,
  UtilPoolEntry,
} from "@/lib/types";

const POOL_SOURCES: ReplacementStatus[] = ["MP Excess", "MP Back Up"];
const PKWT_SOURCE_OPTIONS: ReplacementStatus[] = ["PKWT New Hire", "Vokasi New Hire", "MP Excess", "MP Back Up", "No Replace"];
const VOKASI_SOURCE_OPTIONS: ReplacementStatus[] = ["Vokasi New Hire", "MP Excess", "MP Back Up", "No Replace"];

const JENIS_LABEL: Record<DemandOriginType, string> = {
  VokasiEnded: "Vokasi Ended",
  PkwtTerminate: "PKWT Terminate",
  Project: "Project",
  TaktUp: "Takt Up",
  Resign: "Resign",
  Pension: "Pensiun",
  PensionDini: "Pensiun Dini",
  GST: "GST",
  Unfit: "Unfit",
  Others: "Others",
  Manual: "Manual",
};

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

function confirmLabel(d: Demand): string {
  if (d.replacement_status === "PKWT New Hire" || d.replacement_status === "Vokasi New Hire") return "Tgl Sign Kontrak";
  if (d.replacement_status === "MP Excess" || d.replacement_status === "MP Back Up") return "Tgl Assigned";
  return "Tgl Konfirmasi";
}

// ---------------------------------------------------------------------------
// Section 1 — Ringkasan per Batch
// ---------------------------------------------------------------------------

function buildDemandBatchCategories(
  demands: Demand[],
  projects: Project[],
  taktCases: TaktCase[]
): BatchTileCategory[] {
  const open = demands.filter((d) => d.status !== "Fulfilled");

  function groupBy(items: Demand[], keyOf: (d: Demand) => string) {
    const map = new Map<string, Demand[]>();
    for (const d of items) {
      const key = keyOf(d);
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    return map;
  }

  const projectDemands = open.filter((d) => d.origin_type === "Project");
  const projectGroups = groupBy(projectDemands, (d) => d.origin_ref);
  const projectBatches = Array.from(projectGroups.entries()).map(([ref, items]) => {
    const p = projects.find((x) => x.id === ref);
    return {
      id: ref,
      label: p?.name ?? "Project",
      meta: p ? `${fmtDate(p.start_date)} — ${fmtDate(p.end_date)}` : undefined,
      count: items.length,
      href: "/projects",
    };
  });

  const taktUpDemands = open.filter((d) => d.origin_type === "TaktUp");
  const taktUpGroups = groupBy(taktUpDemands, (d) => d.origin_ref);
  const taktUpBatches = Array.from(taktUpGroups.entries()).map(([ref, items]) => {
    const t = taktCases.find((x) => x.id === ref);
    return { id: ref, label: t ? `Takt Up — ${t.plant}` : "Takt Up", meta: t ? fmtDate(t.date) : undefined, count: items.length };
  });

  const pkwtDemands = open.filter((d) => d.origin_type === "PkwtTerminate");
  const pkwtGroups = groupBy(pkwtDemands, (d) => demandTargetDate(d).slice(0, 7) || "-");
  const pkwtBatches = Array.from(pkwtGroups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, items]) => ({
      id: month,
      label: month === "-" ? "Review PKWT" : `Review PKWT — ${format(new Date(`${month}-01T00:00:00`), "MMM yyyy")}`,
      count: items.length,
    }));

  const vokasiDemands = open.filter((d) => d.origin_type === "VokasiEnded");
  const vokasiGroups = groupBy(vokasiDemands, (d) => demandTargetDate(d).slice(0, 7) || "-");
  const vokasiBatches = Array.from(vokasiGroups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, items]) => ({
      id: month,
      label: month === "-" ? "Vokasi Ended" : `Vokasi Ended — ${format(new Date(`${month}-01T00:00:00`), "MMM yyyy")}`,
      count: items.length,
    }));

  const lainnyaTypes: DemandOriginType[] = ["Resign", "Pension", "PensionDini", "GST", "Unfit", "Others", "Manual"];
  const lainnyaDemands = open.filter((d) => lainnyaTypes.includes(d.origin_type));
  const lainnyaGroups = groupBy(lainnyaDemands, (d) => d.origin_type);
  const lainnyaBatches = Array.from(lainnyaGroups.entries()).map(([type, items]) => ({
    id: type,
    label: JENIS_LABEL[type as DemandOriginType],
    count: items.length,
  }));

  return [
    { key: "project", label: "Project", count: projectDemands.length, tone: "blue", batches: projectBatches },
    { key: "taktup", label: "Takt Up", count: taktUpDemands.length, tone: "blue", batches: taktUpBatches },
    { key: "pkwt", label: "PKWT", count: pkwtDemands.length, tone: "amber", batches: pkwtBatches },
    { key: "vokasi", label: "Vokasi", count: vokasiDemands.length, tone: "violet", batches: vokasiBatches },
    { key: "lainnya", label: "Lainnya", count: lainnyaDemands.length, tone: "slate", batches: lainnyaBatches },
  ];
}

export function DemandPageClient() {
  const role = useRole();
  const demands = useStoreList(demandStore);
  const poolEntries = useStoreList(utilPoolStore);
  const projects = useStoreList(projectStore);
  const taktCases = useStoreList(taktStore);
  const reviews = useStoreList(pkwtReviewStore);
  const vokasi = useStoreList(vokasiStore);
  const snapshots = useStoreList(zparStore);
  const employees = useMemo(() => snapshots.find((s) => s.is_active)?.employees ?? [], [snapshots]);

  const batchCategories = useMemo(() => buildDemandBatchCategories(demands, projects, taktCases), [demands, projects, taktCases]);

  // ---- Section 2: Enrollment Review ----
  const [enrollTab, setEnrollTab] = useSessionState<DemandCategory>("enrollment.tab", "PKWT");
  const [period, setPeriod] = useSessionState<string>("enrollment.period", currentMonthKey());
  const [reviewDivs, setReviewDivs] = useSessionState<string[]>("enrollment.pkwt.divs", []);
  const [reviewDepts, setReviewDepts] = useSessionState<string[]>("enrollment.pkwt.depts", []);
  const [vokasiDivs, setVokasiDivs] = useSessionState<string[]>("enrollment.vokasi.divs", []);
  const [vokasiDepts, setVokasiDepts] = useSessionState<string[]>("enrollment.vokasi.depts", []);
  const [manualOpen, setManualOpen] = useState(false);

  const fulfilledVokasiIds = useMemo(
    () => new Set(demands.filter((d) => d.category === "Vokasi" && d.status === "Fulfilled").map((d) => d.origin_ref)),
    [demands]
  );
  const activeDivs = enrollTab === "PKWT" ? reviewDivs : vokasiDivs;
  const activeDepts = enrollTab === "PKWT" ? reviewDepts : vokasiDepts;
  const ratioScopedEmployees = activeDivs.length ? employees.filter((e) => activeDivs.includes(e.division)) : employees;
  const ratioScopedEmployeesFinal = activeDepts.length ? ratioScopedEmployees.filter((e) => activeDepts.includes(e.dept)) : ratioScopedEmployees;
  const ratioScopedVokasi = activeDivs.length ? vokasi.filter((v) => activeDivs.includes(v.div)) : vokasi;
  const ratioScopedVokasiFinal = activeDepts.length ? ratioScopedVokasi.filter((v) => activeDepts.includes(v.dept)) : ratioScopedVokasi;
  const ratioVokasiActive = ratioScopedVokasiFinal.filter((v) => computeVokasiStatus(v.tgl_ended, fulfilledVokasiIds.has(v.id)) !== "Ended");
  const enrollmentRatioCounts = {
    permanen: ratioScopedEmployeesFinal.filter((e) => e.status_kontrak === "Permanen").length,
    kontrak: ratioScopedEmployeesFinal.filter((e) => e.status_kontrak !== "Permanen").length,
    vokasi: ratioVokasiActive.length,
  };

  // ---- Section 3: Input Demand Baru ----
  const [inputTab, setInputTab] = useSessionState<"project" | "taktup" | "manual">("demand.input.tab", "project");
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [taktUpOpen, setTaktUpOpen] = useState(false);

  // ---- Section 4: Detail Demand ----
  const [tab, setTab] = useState<DemandCategory>("PKWT");
  const [month, setMonth] = useState(currentMonthKey());
  const [jenis, setJenis] = useState<string[]>([]);
  const [divs, setDivs] = useState<string[]>([]);
  const [depts, setDepts] = useState<string[]>([]);
  const [statusMp, setStatusMp] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const tabDemands = useMemo(() => demands.filter((d) => effectiveDemandCategory(d) === tab), [demands, tab]);
  const monthDemands = useMemo(
    () => tabDemands.filter((d) => demandVisibleDate(demandTargetDate(d)).slice(0, 7) === month),
    [tabDemands, month]
  );
  const jenisOptions = Array.from(new Set(monthDemands.map((d) => JENIS_LABEL[d.origin_type]))).sort();
  const divOptions = divisionsOfRows(monthDemands);
  const deptOptions = deptsOfRows(monthDemands, divs);
  const statusMpOptions = Object.values(EMPLOYMENT_STATUS_LABEL);
  const statusOptions = ["Open", "DELAY", "Need Replace ASAP", "Fulfilled Ontime", "Fulfilled but Delay"];

  const filteredDemands = filterByDivDept(monthDemands, divs, depts)
    .filter((d) => jenis.length === 0 || jenis.includes(JENIS_LABEL[d.origin_type]))
    .filter((d) => statusMp.length === 0 || statusMp.includes(EMPLOYMENT_STATUS_LABEL[d.replacement_employment_status]))
    .filter((d) => statusFilter.length === 0 || statusFilter.includes(demandGranularStatus(d)))
    .slice()
    .sort((a, b) => demandTargetDate(a).localeCompare(demandTargetDate(b)));

  const canEditReplacement = role === "admin" || (role === "shop" && tab === "PKWT");
  const canEditFulfillDate = role === "admin";

  const totalCount = monthDemands.length;
  const fulfilledCount = monthDemands.filter((d) => demandGranularStatus(d).startsWith("Fulfilled")).length;
  const openInView = filteredDemands.filter((d) => d.status !== "Fulfilled").length;

  const scenarioBase = {
    permanen: employees.filter((e) => e.status_kontrak === "Permanen").length,
    kontrak: employees.filter((e) => e.status_kontrak !== "Permanen").length,
    vokasi: vokasi.filter((v) => computeVokasiStatus(v.tgl_ended, fulfilledVokasiIds.has(v.id)) !== "Ended").length,
  };

  function exportReport() {
    import("xlsx").then((XLSX) => {
      const summarySheet = XLSX.utils.aoa_to_sheet([
        ["Demand Report", format(new Date(`${month}-01T00:00:00`), "MMMM yyyy"), tab],
        [],
        ["Total Demand", totalCount],
        ["Fulfilled", fulfilledCount],
        ["Open", totalCount - fulfilledCount],
        [],
        ["Rasio Sekarang", `${scenarioBase.permanen} : ${scenarioBase.kontrak} : ${scenarioBase.vokasi}`],
        [
          "Rasio bila diganti Kontrak baru",
          `${scenarioBase.permanen} : ${scenarioBase.kontrak + openInView} : ${scenarioBase.vokasi}`,
        ],
        [
          "Rasio bila diganti MP Excess Permanen",
          `${scenarioBase.permanen + openInView} : ${scenarioBase.kontrak} : ${scenarioBase.vokasi}`,
        ],
      ]);
      const detailRows = filteredDemands.map((d) => ({
        "Replacement Need": demandStatusLabel(d),
        Outgoing: d.outgoing_label || `${d.outgoing_nama} (${d.outgoing_noreg})`,
        Divisi: d.div,
        Department: d.dept,
        "Arrival to Shop": fmtDate(demandTargetDate(d)),
        Source: d.replacement_status,
        Kandidat: d.replacement_nama ? `${d.replacement_nama} (${d.replacement_noreg})` : "-",
        "FS Status": d.fs_status,
        "Demand Status": demandGranularStatus(d),
      }));
      const detailSheet = XLSX.utils.json_to_sheet(detailRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
      XLSX.utils.book_append_sheet(wb, detailSheet, "Detail");
      XLSX.writeFile(wb, `Demand-Report-${tab}-${month}.xlsx`);
    });
  }

  function exportReportPdf() {
    window.print();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Demand</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ringkasan kebutuhan MP, review enrollment, input demand baru, dan candidate mapping — satu tempat.
        </p>
      </div>

      {/* 1. Ringkasan per Batch */}
      <SectionHeading n={1} title="Ringkasan per Batch" subtitle="Klik tile untuk lihat rincian batch." />
      <BatchTileRow categories={batchCategories} />

      {/* 2. Enrollment Review — admin-only, folded by default */}
      {role === "admin" && (
        <CollapsibleSection
          title={
            <span className="flex items-center gap-2.5">
              <NumberBadge n={2} /> Enrollment Review
            </span>
          }
          subtitle="Review PKWT (Continue/Terminate) dan Vokasi auto-Ended. Candidate mapping ada di Detail Demand di bawah."
        >
          <RatioWidget
            title="Rasio Permanen : Kontrak : Vokasi — Saat Ini"
            counts={enrollmentRatioCounts}
            scopeLabel={activeDivs.length || activeDepts.length ? "Sesuai filter" : "Seluruh plant"}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40">
              {monthOptions().map((m) => (
                <option key={m} value={m}>
                  {format(new Date(`${m}-01T00:00:00`), "MMM yyyy")}
                </option>
              ))}
            </Select>
            <div>
              <Button variant="primary" onClick={() => setManualOpen(true)}>
                + Manual Demand
              </Button>
              <p className="mt-1 max-w-[160px] text-right text-[11px] leading-tight text-slate-400">
                Untuk demand tambahan: GST/Unfit/Resign/Pension
              </p>
            </div>
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
              canEditReview={role === "admin"}
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
          <ManualDemandModal open={manualOpen} onClose={() => setManualOpen(false)} />
        </CollapsibleSection>
      )}

      {/* 3. Input Demand Baru */}
      {role === "admin" && (
        <Card
          title={
            <span className="flex items-center gap-2.5">
              <NumberBadge n={3} /> Input Demand Baru
            </span>
          }
        >
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
            {inputTab === "project" && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 p-4 dark:border-slate-700">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Daftarkan project baru beserta rincian kebutuhan MP per divisi/department.
                </p>
                <Button variant="primary" onClick={() => setProjectModalOpen(true)}>
                  + Project Baru
                </Button>
              </div>
            )}
            {inputTab === "taktup" && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 p-4 dark:border-slate-700">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Catat kebutuhan MP dari perubahan takt time (takt naik → butuh tambahan MP).
                </p>
                <Button variant="primary" onClick={() => setTaktUpOpen(true)}>
                  + Takt Up
                </Button>
              </div>
            )}
            {inputTab === "manual" && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 p-4 dark:border-slate-700">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Demand tambahan di luar review otomatis: GST, Unfit, Resign, Pension, Pension Dini, atau alasan lain.
                </p>
                <Button variant="primary" onClick={() => setManualOpen(true)}>
                  + Manual Demand
                </Button>
              </div>
            )}
          </div>
          <NewProjectModal open={projectModalOpen} onClose={() => setProjectModalOpen(false)} />
          <TaktUpModal open={taktUpOpen} onClose={() => setTaktUpOpen(false)} />
        </Card>
      )}

      {/* 4. Detail dan Mapping Demand — bulan berjalan */}
      <SectionHeading
        n={4}
        title="Detail dan Mapping Demand"
        subtitle="Bulan berjalan — pilih Kontrak/Vokasi untuk mapping kandidat."
        action={
          <SegmentedSwitch
            options={[
              { value: "PKWT", label: "Kontrak" },
              { value: "Vokasi", label: "Vokasi" },
            ]}
            value={tab}
            onChange={(v) => {
              setTab(v);
              setDivs([]);
              setDepts([]);
            }}
          />
        }
      />

      <RatioScenarioCompare
        scopeLabel={`${openInView} demand open di tampilan ini`}
        scenarios={[
          { label: "Sekarang", counts: scenarioBase },
          { label: "Bila diganti Kontrak baru", counts: { ...scenarioBase, kontrak: scenarioBase.kontrak + openInView } },
          { label: "Bila diganti MP Excess Permanen", counts: { ...scenarioBase, permanen: scenarioBase.permanen + openInView } },
        ]}
      />

      <Card
        title={`Detail Demand: ${format(new Date(`${month}-01T00:00:00`), "MMMM yyyy")}`}
        subtitle="Demand muncul H-4 minggu (hari kerja) dari Arrival to Shop. Bulan yang dipilih adalah bulan demand ini actionable."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={exportReport}>
              Laporan Excel
            </Button>
            <Button variant="secondary" size="sm" onClick={exportReportPdf}>
              Laporan PDF
            </Button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <MultiSelect options={jenisOptions} selected={jenis} onChange={setJenis} placeholder="Semua Jenis" className="w-44" />
          <MultiSelect
            options={divOptions}
            selected={divs}
            onChange={(v) => {
              setDivs(v);
              setDepts([]);
            }}
            placeholder="Semua Divisi"
            className="w-44"
          />
          <MultiSelect options={deptOptions} selected={depts} onChange={setDepts} placeholder="Semua Department" className="w-44" />
          <MultiSelect options={statusMpOptions} selected={statusMp} onChange={setStatusMp} placeholder="Semua Status MP" className="w-44" />
          <MultiSelect options={statusOptions} selected={statusFilter} onChange={setStatusFilter} placeholder="Semua Status" className="w-48" />
          <Select bare value={month} onChange={(e) => { setMonth(e.target.value); setDivs([]); setDepts([]); }} className="w-40">
            {monthOptions().map((m) => (
              <option key={m} value={m}>
                {format(new Date(`${m}-01T00:00:00`), "MMM yyyy")}
              </option>
            ))}
          </Select>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <div className="h-14 w-14 shrink-0">
            <DonutChart
              heightClass="h-full"
              data={[
                { key: "fulfilled", label: "Fulfilled", value: fulfilledCount, color: "#2563eb" },
                { key: "open", label: "Open", value: Math.max(totalCount - fulfilledCount, 0), color: "#94a3b8" },
              ]}
            />
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {fulfilledCount}/{totalCount}
            </span>{" "}
            MP fulfilled bulan ini.
          </div>
        </div>
        {filteredDemands.length === 0 ? (
          <EmptyState text="Tidak ada demand pada bulan/filter ini." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Replacement Need</Th>
                <Th>Outgoing</Th>
                <Th>Divisi</Th>
                <Th>Department</Th>
                <Th>Arrival to Shop</Th>
                <Th>Due Date Sign Contract / Assigned</Th>
                <Th>Source</Th>
                <Th>Kandidat</Th>
                <Th>FS Status</Th>
                <Th>Planning Sign Contract / Assigned</Th>
                <Th>Shop Confirmation</Th>
                <Th>Demand Status</Th>
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
                  poolEntries={poolEntries}
                />
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

function DeadlineCell({ deadline, fulfilled }: { deadline: string; fulfilled: boolean }) {
  if (!deadline) return <Td className="text-slate-400">-</Td>;
  const days = sisaHari(deadline);
  const cls = fulfilled ? "" : days < 0 ? "text-red-600 font-semibold" : days <= 5 ? "text-amber-600 font-semibold" : "";
  return <Td className={cls}>{fmtDate(deadline)}</Td>;
}

function ShopConfirmCell({ value, canEdit, onChange }: { value: string; canEdit: boolean; onChange: (date: string) => void }) {
  const checked = Boolean(value);
  if (!canEdit) {
    return checked ? <span>{fmtDate(value)}</span> : <span className="text-slate-400">Belum</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked ? format(new Date(), "yyyy-MM-dd") : "")}
        className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
      />
      {checked && <DateInput value={value} onCommit={onChange} />}
    </div>
  );
}

function DemandRow({
  demand: d,
  tab,
  canEditReplacement,
  canEditFulfillDate,
  poolEntries,
}: {
  demand: Demand;
  tab: DemandCategory;
  canEditReplacement: boolean;
  canEditFulfillDate: boolean;
  poolEntries: UtilPoolEntry[];
}) {
  const isLabelRow = d.origin_type === "Project" || d.origin_type === "TaktUp";
  const target = demandTargetDate(d);
  const deadline = fulfillmentDeadline(target, d.fs_status);
  const isNoReplace = d.replacement_status === "No Replace";
  const hasCandidate = Boolean(d.replacement_noreg);
  const isPoolSource = POOL_SOURCES.includes(d.replacement_status);
  const status = supplyDemandStatus(target, deadline, d.shop_confirmed_date);
  const recommendedEntries = !d.replacement_status ? eligiblePoolEntriesForDemand(poolEntries, d) : [];
  const isRecommended = recommendedEntries.length > 0;
  const crossSourced = d.category !== tab;
  const sourceOptions = tab === "PKWT" ? PKWT_SOURCE_OPTIONS : VOKASI_SOURCE_OPTIONS;

  return (
    <tr>
      <Td>
        {demandStatusLabel(d)}
        {crossSourced && <span className="ml-1.5 text-[10px] font-normal text-slate-400">(dari Kontrak)</span>}
      </Td>
      {isLabelRow ? (
        <Td className="italic text-slate-500">{d.outgoing_label}</Td>
      ) : (
        <Td>
          {d.outgoing_nama} <span className="text-slate-400">({d.outgoing_noreg})</span>
        </Td>
      )}
      <Td>{d.div}</Td>
      <Td>{d.dept}</Td>
      <Td>
        {canEditFulfillDate ? (
          <DateInput value={d.fulfill_date || target} onCommit={(v) => setDemandFulfillDate(d.id, v)} />
        ) : (
          fmtDate(target)
        )}
      </Td>
      <DeadlineCell deadline={deadline} fulfilled={status.startsWith("Fulfilled")} />

      <Td>
        {canEditReplacement ? (
          <Select
            value={d.replacement_status}
            onChange={(e) => {
              const replStatus = e.target.value as ReplacementStatus;
              if (replStatus === "No Replace") setDemandNoReplace(d.id, d.no_replace_reason);
              else setDemandReplacementByNoreg(d.id, d.replacement_noreg, replStatus);
            }}
            className={`min-w-[140px] ${isRecommended ? "border-blue-400 ring-1 ring-blue-300 dark:border-blue-500 dark:ring-blue-500/40" : ""}`}
          >
            <option value="">- pilih -</option>
            {sourceOptions.map((s) => (
              <option key={s} value={s} className={isRecommended && s === "MP Excess" ? "font-semibold" : undefined}>
                {s}
                {isRecommended && s === "MP Excess" ? " ← rekomendasi" : ""}
              </option>
            ))}
          </Select>
        ) : (
          d.replacement_status || "-"
        )}
      </Td>

      {isNoReplace ? (
        <>
          <Td className="text-slate-400">
            {canEditReplacement ? (
              <NoregInput value={d.no_replace_reason} placeholder="Alasan tidak direplace..." onCommit={(v) => setDemandNoReplace(d.id, v)} />
            ) : (
              d.no_replace_reason || "-"
            )}
          </Td>
          <Td className="text-slate-400">-</Td>
          <Td className="text-slate-400">-</Td>
          <Td className="text-slate-400">-</Td>
        </>
      ) : !d.replacement_status ? (
        isRecommended ? (
          <Td colSpan={4} className="whitespace-normal">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 dark:border-blue-500/30 dark:bg-blue-500/10">
              <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">Rekomendasi</span>
              <span className="text-xs text-blue-700 dark:text-blue-300">{recommendedEntries.length} MP Excess tersedia untuk diutilize —</span>
              {canEditReplacement ? (
                <PoolReplacementSelect demand={d} poolEntries={poolEntries} />
              ) : (
                <span className="text-xs text-blue-700 dark:text-blue-300">lihat kolom Source.</span>
              )}
            </div>
          </Td>
        ) : (
          <Td colSpan={4} className="text-slate-400">
            Pilih Source terlebih dahulu
          </Td>
        )
      ) : (
        <>
          <Td className="whitespace-normal">
            {canEditReplacement ? (
              isPoolSource ? (
                <PoolReplacementSelect demand={d} poolEntries={poolEntries} />
              ) : (
                <NoregInput value={d.replacement_noreg} onCommit={(v) => setDemandReplacementByNoreg(d.id, v, d.replacement_status)} />
              )
            ) : (
              d.replacement_noreg || "-"
            )}
            {(d.replacement_nama || d.replacement_dept) && (
              <div className="mt-0.5 text-xs text-slate-400">
                {d.replacement_nama || "-"}
                {d.replacement_dept ? ` · ${d.replacement_dept}` : ""}
              </div>
            )}
          </Td>
          <Td>{d.fs_status ? <Badge tone={statusTone(d.fs_status)}>{d.fs_status}</Badge> : "-"}</Td>
          <Td>
            {!hasCandidate ? (
              <span className="text-slate-400">Isi kandidat dulu</span>
            ) : (
              <div>
                <div className="mb-0.5 text-[11px] text-slate-400">{confirmLabel(d)}</div>
                {canEditReplacement ? (
                  <DateInput value={d.fulfillment_confirmed_date} onCommit={(v) => confirmDemandFulfillment(d.id, v)} />
                ) : (
                  fmtDate(d.fulfillment_confirmed_date)
                )}
              </div>
            )}
          </Td>
          <Td>
            {!hasCandidate ? (
              <span className="text-slate-400">-</span>
            ) : !d.fulfillment_confirmed_date ? (
              <span className="text-slate-400">{confirmLabel(d)} dulu</span>
            ) : (
              <ShopConfirmCell value={d.shop_confirmed_date} canEdit={canEditReplacement} onChange={(v) => confirmShopReceipt(d.id, v)} />
            )}
          </Td>
        </>
      )}
      <Td>
        <Badge tone={statusTone(status)}>{status}</Badge>
      </Td>
    </tr>
  );
}

function PoolReplacementSelect({ demand, poolEntries }: { demand: Demand; poolEntries: UtilPoolEntry[] }) {
  const [editing, setEditing] = useState(false);
  const eligible = eligiblePoolEntriesForDemand(poolEntries, demand);

  if (demand.replacement_noreg && !editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-sm text-slate-700 underline decoration-dotted underline-offset-2 hover:text-blue-600 dark:text-slate-200"
      >
        {demand.replacement_noreg}
      </button>
    );
  }

  return (
    <Select
      value={demand.replacement_noreg}
      onChange={(e) => {
        const entry = eligible.find((p) => p.noreg === e.target.value);
        if (entry) assignPoolEntryToDemand(entry.id, demand.id);
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
      className="min-w-[160px]"
      autoFocus={editing}
    >
      <option value="">- pilih dari Supply Pool -</option>
      {eligible.map((e) => (
        <option key={e.id} value={e.noreg} style={e.prev_dept !== demand.dept ? { color: "#e11d48" } : undefined}>
          {e.nama} ({e.noreg}) — {e.prev_dept}
        </option>
      ))}
    </Select>
  );
}
