"use client";
import { useMemo } from "react";
import Link from "next/link";
import { addMonths, endOfMonth, format } from "date-fns";
import { useSessionState } from "@/lib/useSessionState";
import { CalendarRange, CheckCircle2, ClipboardList, Users2, UserCheck, FileText, GraduationCap, HardHat } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile, ProgressBar } from "@/components/ui/StatTile";
import { Select } from "@/components/ui/Form";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { MonthBarChart } from "@/components/ui/MonthBarChart";
import { CompositionChart } from "@/components/ui/CompositionChart";
import { LaborTypeChart } from "@/components/ui/LaborTypeChart";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { useStoreList } from "@/lib/useStore";
import { demandStore, pkwtReviewStore, projectStore, taktStore, utilPoolStore, vokasiStore, zparStore } from "@/lib/repo";
import {
  currentMonthKey,
  demandsNeedingCandidate,
  demandsNeedingShopConfirm,
  demandSupplyRows,
  deptsOfAny,
  directorates,
  divisionsOfAny,
  filterEmployees,
  groupCountBy,
  laborTypeComposition,
  manpowerMovementByFiscalYear,
  monthBuckets,
  positionBreakdown,
  reviewsNeedingAction,
  type ActionItem,
  type ActionKind,
  type DemandSupplyRow,
  type MovementStatus,
} from "@/lib/engine/dashboard";
import { filterByDivDept } from "@/lib/engine/enrollment";
import { computeVokasiStatus } from "@/lib/engine/compute";
import { LABOR_TYPES } from "@/lib/types";
import type {
  Demand,
  EmployeeRecord,
  Plant,
  PkwtReview,
  Project,
  TaktCase,
  UtilPoolEntry,
  VokasiRecord,
  ZparSnapshot,
} from "@/lib/types";

export default function DashboardPage() {
  const snapshots = useStoreList(zparStore);
  const vokasi = useStoreList(vokasiStore);
  const demands = useStoreList(demandStore);
  const reviews = useStoreList(pkwtReviewStore);
  const projects = useStoreList(projectStore);
  const taktCases = useStoreList(taktStore);
  const utilPool = useStoreList(utilPoolStore);

  const sortedSnapshots = useMemo(
    () => [...snapshots].sort((a, b) => b.period.localeCompare(a.period)),
    [snapshots]
  );
  const activeSnapshot = snapshots.find((s) => s.is_active);

  // "Bulan berjalan" — the dashboard's single top-level viewing-month filter.
  // Drives which ZPAR snapshot backs the headcount sections (matched by period,
  // falling back to whichever snapshot is active) AND the month-bucket
  // highlighting/windowing used across every section below. Selecting the
  // *active* ZPAR snapshot itself is an Upload Center concern, not this filter.
  const [refMonth, setRefMonth] = useSessionState<string>("dash.refMonth", currentMonthKey());
  const refMonthOptions = useMemo(() => {
    const base = new Date(`${currentMonthKey()}-01T00:00:00`);
    return Array.from({ length: 13 }, (_, i) => format(addMonths(base, 6 - i), "yyyy-MM"));
  }, []);

  const selectedSnapshot: ZparSnapshot | undefined =
    sortedSnapshots.find((s) => s.period === refMonth) ?? activeSnapshot ?? sortedSnapshots[0];

  const employees = useMemo(() => selectedSnapshot?.employees ?? [], [selectedSnapshot]);

  const fulfilledVokasiIds = useMemo(
    () => new Set(demands.filter((d) => d.category === "Vokasi" && d.status === "Fulfilled").map((d) => d.origin_ref)),
    [demands]
  );

  const snapshotsByPeriod = useMemo(() => {
    const latestByPeriod = new Map<string, ZparSnapshot>();
    for (const s of snapshots) {
      const existing = latestByPeriod.get(s.period);
      if (!existing || s.upload_date > existing.upload_date) latestByPeriod.set(s.period, s);
    }
    const map = new Map<string, EmployeeRecord[]>();
    for (const [p, s] of latestByPeriod) map.set(p, s.employees);
    return map;
  }, [snapshots]);

  const [selDirectorates, setSelDirectorates] = useSessionState<string[]>("dash.b1.directorates", []);
  const [selDivisions, setSelDivisions] = useSessionState<string[]>("dash.b1.divisions", []);
  const [selDepts, setSelDepts] = useSessionState<string[]>("dash.b1.depts", []);

  if (sortedSnapshots.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
        <EmptyState text="Belum ada snapshot ZPAR. Upload data di Upload Center terlebih dahulu." />
      </div>
    );
  }

  const divisionOptions = divisionsOfAny(employees, selDirectorates);
  const deptOptions = deptsOfAny(employees, selDivisions);

  const filteredEmployees = filterEmployees(employees, {
    directorates: selDirectorates,
    divisions: selDivisions,
    depts: selDepts,
  });
  const filteredVokasi = vokasi.filter(
    (v) =>
      (selDivisions.length === 0 || selDivisions.includes(v.div)) &&
      (selDepts.length === 0 || selDepts.includes(v.dept))
  );

  const permanenCount = filteredEmployees.filter((e) => e.status_kontrak === "Permanen");
  const kontrakCount = filteredEmployees.filter((e) => e.status_kontrak !== "Permanen");
  const vokasiActive = filteredVokasi.filter(
    (v) => computeVokasiStatus(v.tgl_ended, fulfilledVokasiIds.has(v.id)) !== "Ended"
  );

  const genderCount = (arr: { gender: string }[]) => ({
    L: arr.filter((x) => x.gender === "L").length,
    P: arr.filter((x) => x.gender === "P").length,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ringkasan kondisi manpower, read-only, mengagregasi semua modul.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <CalendarRange size={16} className="text-slate-400" />
          <span className="text-xs font-medium text-slate-500">Bulan</span>
          <Select
            bare
            value={refMonth}
            onChange={(e) => setRefMonth(e.target.value)}
            className="!w-auto border-none !p-0 !py-0 text-sm font-semibold shadow-none focus:ring-0"
          >
            {refMonthOptions.map((m) => (
              <option key={m} value={m}>
                {format(new Date(`${m}-01T00:00:00`), "MMM yyyy")}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* 0. Action Needed */}
      <ActionNeededBlock reviews={reviews} demands={demands} />

      {/* 1. Total Manpower & Status */}
      <Card
        title="Total Manpower & Status"
        subtitle={selectedSnapshot ? `Data ZPAR periode ${selectedSnapshot.period}` : undefined}
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <MultiSelect
            label="Directorate"
            options={directorates(employees)}
            selected={selDirectorates}
            onChange={(v) => {
              setSelDirectorates(v);
              setSelDivisions([]);
              setSelDepts([]);
            }}
          />
          <MultiSelect
            label="Division"
            options={divisionOptions}
            selected={selDivisions}
            onChange={(v) => {
              setSelDivisions(v);
              setSelDepts([]);
            }}
          />
          <MultiSelect label="Department" options={deptOptions} selected={selDepts} onChange={setSelDepts} />
        </div>
        <TotalManpowerCard total={filteredEmployees.length + vokasiActive.length} employees={filteredEmployees} />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Permanen"
            value={permanenCount.length}
            sub={`L: ${genderCount(permanenCount).L} · P: ${genderCount(permanenCount).P}`}
            tone="emerald"
            icon={UserCheck}
          />
          <StatTile
            label="Kontrak"
            value={kontrakCount.length}
            sub={`L: ${genderCount(kontrakCount).L} · P: ${genderCount(kontrakCount).P}`}
            tone="amber"
            icon={FileText}
          />
          <StatTile
            label="Vokasi Aktif"
            value={vokasiActive.length}
            sub={`L: ${genderCount(vokasiActive).L} · P: ${genderCount(vokasiActive).P}`}
            tone="violet"
            icon={GraduationCap}
          />
        </div>
      </Card>

      {/* 2. Manpower Movement */}
      <ManpowerMovementBlock
        employees={employees}
        snapshotsByPeriod={snapshotsByPeriod}
        vokasi={vokasi}
        refMonth={refMonth}
      />

      {/* 3. Komposisi by Labor Type */}
      <LaborTypeBlock employees={employees} vokasi={vokasi} demands={demands} />

      {/* 4 & 5. PKWT Review / Vokasi Ended per bulan */}
      <div className="space-y-6">
        <PkwtReviewChartBlock employees={employees} reviews={reviews} refMonth={refMonth} />
        <VokasiEndedChartBlock employees={employees} vokasi={vokasi} refMonth={refMonth} />
      </div>

      {/* 6. Demand-Supply Overview */}
      <DemandSupplyBlock demands={demands} />

      {/* 7 & 8. Project / Takt Time Summary */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ProjectSummaryBlock projects={projects} demands={demands} />
        <TaktSummaryBlock taktCases={taktCases} demands={demands} utilPool={utilPool} refMonth={refMonth} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 0. Action Needed — cross-stage worklist (review fill -> candidate sign ->
// shop confirm), each item due or overdue within the next 7 days.
// ---------------------------------------------------------------------------

const ACTION_KIND_ICON: Record<ActionKind, typeof ClipboardList> = {
  review: ClipboardList,
  candidate: Users2,
  shop_confirm: HardHat,
};

const ACTION_LIST_CAP = 8;

function ActionNeededBlock({ reviews, demands }: { reviews: PkwtReview[]; demands: Demand[] }) {
  const items = useMemo(
    () =>
      [...reviewsNeedingAction(reviews), ...demandsNeedingCandidate(demands), ...demandsNeedingShopConfirm(demands)].sort(
        (a, b) => a.daysRemaining - b.daysRemaining
      ),
    [reviews, demands]
  );
  const shown = items.slice(0, ACTION_LIST_CAP);
  const hiddenCount = items.length - shown.length;

  return (
    <Card title="Action Needed" subtitle="Tahap review, candidate mapping, dan shop confirmation yang jatuh tempo dalam 7 hari.">
      {items.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={16} /> Semua tahap on-track, tidak ada yang jatuh tempo dalam 7 hari ke depan.
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {shown.map((item) => (
              <ActionRow key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </div>
          {hiddenCount > 0 && (
            <p className="pt-2 text-xs text-slate-400">
              {`+${hiddenCount} lainnya`} — cek Enrollment Monitoring &amp; Demand Pool untuk daftar lengkap.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function ActionRow({ item }: { item: ActionItem }) {
  const Icon = ACTION_KIND_ICON[item.kind];
  const overdue = item.daysRemaining < 0;
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 py-2.5 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60"
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          overdue ? "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400" : "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
        }`}
      >
        <Icon size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-slate-800 dark:text-slate-100">
          {item.nama} <span className="font-normal text-slate-400">({item.noreg})</span>
        </div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">
          {item.label} · {item.dept}
        </div>
      </div>
      <Badge tone={overdue ? "red" : "amber"}>{overdue ? `Telat ${Math.abs(item.daysRemaining)}h` : `${item.daysRemaining}h lagi`}</Badge>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Shared cascading Directorate → Division → Department filter
// ---------------------------------------------------------------------------

function OrgCascadeFilter({
  employees,
  selDirectorates,
  setSelDirectorates,
  selDivisions,
  setSelDivisions,
  selDepts,
  setSelDepts,
}: {
  employees: EmployeeRecord[];
  selDirectorates: string[];
  setSelDirectorates: (v: string[]) => void;
  selDivisions: string[];
  setSelDivisions: (v: string[]) => void;
  selDepts: string[];
  setSelDepts: (v: string[]) => void;
}) {
  const divisionOptions = divisionsOfAny(employees, selDirectorates);
  const deptOptions = deptsOfAny(employees, selDivisions);
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <MultiSelect
        label="Directorate"
        options={directorates(employees)}
        selected={selDirectorates}
        onChange={(v) => {
          setSelDirectorates(v);
          setSelDivisions([]);
          setSelDepts([]);
        }}
      />
      <MultiSelect
        label="Division"
        options={divisionOptions}
        selected={selDivisions}
        onChange={(v) => {
          setSelDivisions(v);
          setSelDepts([]);
        }}
      />
      <MultiSelect label="Department" options={deptOptions} selected={selDepts} onChange={setSelDepts} />
    </div>
  );
}

function TotalManpowerCard({ total, employees }: { total: number; employees: EmployeeRecord[] }) {
  const rows = positionBreakdown(employees);
  return (
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 dark:border-blue-500/20 dark:from-blue-500/10 dark:to-indigo-500/10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center gap-3 sm:border-r sm:border-blue-200/60 sm:pr-5 dark:sm:border-blue-500/20">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-300">
            <Users2 size={18} strokeWidth={2.25} />
          </span>
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Manpower</div>
            <div className="mt-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-3xl font-bold tabular-nums text-transparent">
              {total}
            </div>
          </div>
        </div>
        <div className="flex-1 sm:pl-1">
          <div className="mb-1.5 text-xs font-semibold text-slate-500">Breakdown Posisi (Struktural)</div>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">Tidak ada data posisi struktural.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    {r.label}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const MOVEMENT_STATUSES: MovementStatus[] = ["Permanen", "Kontrak", "Vokasi"];

function ManpowerMovementBlock({
  employees,
  snapshotsByPeriod,
  vokasi,
  refMonth,
}: {
  employees: EmployeeRecord[];
  snapshotsByPeriod: Map<string, EmployeeRecord[]>;
  vokasi: VokasiRecord[];
  refMonth: string;
}) {
  const [selDirectorates, setSelDirectorates] = useSessionState<string[]>("dash.movement.directorates", []);
  const [selDivisions, setSelDivisions] = useSessionState<string[]>("dash.movement.divisions", []);
  const [selDepts, setSelDepts] = useSessionState<string[]>("dash.movement.depts", []);
  const [selLaborTypes, setSelLaborTypes] = useSessionState<string[]>("dash.movement.laborTypes", []);
  const [selStatuses, setSelStatuses] = useSessionState<MovementStatus[]>("dash.movement.statuses", []);

  const refDate = useMemo(() => new Date(`${refMonth}-01T00:00:00`), [refMonth]);
  const movementRows = useMemo(
    () =>
      manpowerMovementByFiscalYear(
        snapshotsByPeriod,
        vokasi,
        {
          org: { directorates: selDirectorates, divisions: selDivisions, depts: selDepts },
          laborTypes: selLaborTypes,
          statuses: selStatuses,
        },
        refDate
      ),
    [snapshotsByPeriod, vokasi, selDirectorates, selDivisions, selDepts, selLaborTypes, selStatuses, refDate]
  );

  return (
    <Card title="Manpower Movement">
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MultiSelect
          label="Directorate"
          options={directorates(employees)}
          selected={selDirectorates}
          onChange={(v) => {
            setSelDirectorates(v);
            setSelDivisions([]);
            setSelDepts([]);
          }}
        />
        <MultiSelect
          label="Division"
          options={divisionsOfAny(employees, selDirectorates)}
          selected={selDivisions}
          onChange={(v) => {
            setSelDivisions(v);
            setSelDepts([]);
          }}
        />
        <MultiSelect
          label="Department"
          options={deptsOfAny(employees, selDivisions)}
          selected={selDepts}
          onChange={setSelDepts}
        />
        <MultiSelect
          label="Labor Type"
          options={[...LABOR_TYPES]}
          selected={selLaborTypes}
          onChange={setSelLaborTypes}
        />
        <MultiSelect
          label="Status"
          options={MOVEMENT_STATUSES}
          selected={selStatuses}
          onChange={(v) => setSelStatuses(v as MovementStatus[])}
        />
      </div>
      <CompositionChart data={movementRows} heightClass="h-56" />
    </Card>
  );
}

function LaborTypeBlock({
  employees,
  vokasi,
  demands,
}: {
  employees: EmployeeRecord[];
  vokasi: VokasiRecord[];
  demands: Demand[];
}) {
  const [selDirectorates, setSelDirectorates] = useSessionState<string[]>("dash.laborType.directorates", []);
  const [selDivisions, setSelDivisions] = useSessionState<string[]>("dash.laborType.divisions", []);
  const [selDepts, setSelDepts] = useSessionState<string[]>("dash.laborType.depts", []);
  const filtered = filterEmployees(employees, {
    directorates: selDirectorates,
    divisions: selDivisions,
    depts: selDepts,
  });
  const fulfilledVokasiIds = new Set(
    demands.filter((d) => d.category === "Vokasi" && d.status === "Fulfilled").map((d) => d.origin_ref)
  );
  const filteredVokasi = vokasi.filter(
    (v) =>
      (selDivisions.length === 0 || selDivisions.includes(v.div)) &&
      (selDepts.length === 0 || selDepts.includes(v.dept))
  );
  const vokasiActive = filteredVokasi.filter(
    (v) => computeVokasiStatus(v.tgl_ended, fulfilledVokasiIds.has(v.id)) !== "Ended"
  );
  const rows = laborTypeComposition(filtered, vokasiActive.length);

  return (
    <Card title="Komposisi by Labor Type">
      <OrgCascadeFilter
        employees={employees}
        selDirectorates={selDirectorates}
        setSelDirectorates={setSelDirectorates}
        selDivisions={selDivisions}
        setSelDivisions={setSelDivisions}
        selDepts={selDepts}
        setSelDepts={setSelDepts}
      />
      {rows.length === 0 ? <EmptyState text="Tidak ada data." /> : <LaborTypeChart data={rows} />}
    </Card>
  );
}

function CompactDetailList({ items, unit }: { items: { key: string; count: number }[]; unit: string }) {
  if (items.length === 0) return <p className="text-sm text-slate-400">Tidak ada {unit} bulan ini.</p>;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {items.map((d) => (
        <span
          key={d.key}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          {d.key}
          <span className="inline-flex min-w-[1.4rem] items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[11px] font-bold text-white dark:bg-blue-500">
            {d.count}
          </span>
        </span>
      ))}
    </div>
  );
}

function PkwtReviewChartBlock({
  employees,
  reviews,
  refMonth,
}: {
  employees: EmployeeRecord[];
  reviews: PkwtReview[];
  refMonth: string;
}) {
  const [selDirectorates, setSelDirectorates] = useSessionState<string[]>("dash.pkwtReview.directorates", []);
  const [selDivisions, setSelDivisions] = useSessionState<string[]>("dash.pkwtReview.divisions", []);
  const [selDepts, setSelDepts] = useSessionState<string[]>("dash.pkwtReview.depts", []);
  const filteredReviews = filterByDivDept(reviews, selDivisions, selDepts);
  const { buckets, byMonth } = monthBuckets(filteredReviews, (r) => r.tgl_review?.slice(0, 7), 3, 5, refMonth);
  const [selected, setSelected] = useSessionState("dash.pkwtReview.month", refMonth);
  const detailItems = byMonth.get(selected) ?? [];
  const byStatusKontrak = groupCountBy(detailItems, (r) => r.status_kontrak);
  const byLaborType = groupCountBy(detailItems, (r) => r.labor_type || "Other");

  return (
    <Card title="PKWT Review per Bulan">
      <OrgCascadeFilter
        employees={employees}
        selDirectorates={selDirectorates}
        setSelDirectorates={setSelDirectorates}
        selDivisions={selDivisions}
        setSelDivisions={setSelDivisions}
        selDepts={selDepts}
        setSelDepts={setSelDepts}
      />
      <div className="space-y-4">
        <MonthBarChart data={buckets} selectedMonth={selected} onSelect={setSelected} showValueLabels />
        <div>
          <div className="text-xs font-semibold text-slate-500">Detail: {selected}</div>
          <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
            {detailItems.length} <span className="text-sm font-normal text-slate-500">orang review</span>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 sm:divide-x sm:divide-slate-200 dark:sm:divide-slate-800">
            <div>
              <div className="text-xs font-medium text-slate-500">By Status Kontrak</div>
              <CompactDetailList items={byStatusKontrak} unit="review" />
            </div>
            <div className="sm:pl-4">
              <div className="text-xs font-medium text-slate-500">By Labor Type</div>
              <CompactDetailList items={byLaborType} unit="review" />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function VokasiEndedChartBlock({
  employees,
  vokasi,
  refMonth,
}: {
  employees: EmployeeRecord[];
  vokasi: VokasiRecord[];
  refMonth: string;
}) {
  const [selDirectorates, setSelDirectorates] = useSessionState<string[]>("dash.vokasiEnded.directorates", []);
  const [selDivisions, setSelDivisions] = useSessionState<string[]>("dash.vokasiEnded.divisions", []);
  const [selDepts, setSelDepts] = useSessionState<string[]>("dash.vokasiEnded.depts", []);
  const filteredVokasi = filterByDivDept(vokasi, selDivisions, selDepts);
  const { buckets, byMonth } = monthBuckets(filteredVokasi, (v) => v.tgl_ended?.slice(0, 7), 3, 5, refMonth);
  const [selected, setSelected] = useSessionState("dash.vokasiEnded.month", refMonth);
  const detailItems = byMonth.get(selected) ?? [];

  return (
    <Card title="Vokasi Ended per Bulan">
      <OrgCascadeFilter
        employees={employees}
        selDirectorates={selDirectorates}
        setSelDirectorates={setSelDirectorates}
        selDivisions={selDivisions}
        setSelDivisions={setSelDivisions}
        selDepts={selDepts}
        setSelDepts={setSelDepts}
      />
      <div className="space-y-4">
        <MonthBarChart data={buckets} selectedMonth={selected} onSelect={setSelected} showValueLabels />
        <div>
          <div className="text-xs font-semibold text-slate-500">Detail: {selected}</div>
          <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
            {detailItems.length} <span className="text-sm font-normal text-slate-500">ended</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function DemandSupplyTable({ label, rows }: { label: string; rows: DemandSupplyRow[] }) {
  const totalDemand = rows.reduce((sum, r) => sum + r.demand, 0);
  const totalSupply = rows.reduce((sum, r) => sum + r.supply, 0);
  const totalPercent = totalDemand ? (totalSupply / totalDemand) * 100 : 0;

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-slate-500">{label}</h4>
      {rows.length === 0 ? (
        <EmptyState text="Belum ada demand." />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Replacement Need</Th>
              <Th>Demand</Th>
              <Th>Supply</Th>
              <Th>Progress</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.reason}>
                <Td>{r.reason}</Td>
                <Td>{r.demand}</Td>
                <Td>{r.supply}</Td>
                <Td>
                  <div className="w-28">
                    <ProgressBar percent={r.percent} />
                  </div>
                </Td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 font-semibold dark:border-slate-700">
              <Td>Total</Td>
              <Td>{totalDemand}</Td>
              <Td>{totalSupply}</Td>
              <Td>
                <div className="w-28">
                  <ProgressBar percent={totalPercent} />
                </div>
              </Td>
            </tr>
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}

function DemandSupplyBlock({ demands }: { demands: Demand[] }) {
  const pkwtRows = demandSupplyRows(demands, "PKWT");
  const vokasiRows = demandSupplyRows(demands, "Vokasi");
  return (
    <Card title="Demand-Supply Overview">
      <div className="grid gap-6 lg:grid-cols-2">
        <DemandSupplyTable label="PKWT" rows={pkwtRows} />
        <DemandSupplyTable label="Vokasi" rows={vokasiRows} />
      </div>
    </Card>
  );
}

function ProjectSummaryBlock({ projects, demands }: { projects: Project[]; demands: Demand[] }) {
  const ongoing = projects.filter((p) => p.status === "Ongoing");
  return (
    <Card title="Project Monitoring Summary">
      {ongoing.length === 0 ? (
        <EmptyState text="Tidak ada project Ongoing." />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {ongoing.map((p) => {
            const needed = p.rows.reduce((sum, r) => sum + r.qty, 0);
            const gap = demands.filter((d) => p.demand_ids.includes(d.id) && d.status === "Open").length;
            return (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-100">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    Kebutuhan: {needed} orang · selesai {p.end_date}
                  </div>
                </div>
                {gap === 0 ? (
                  <Badge tone="green">✅ MP Terpenuhi</Badge>
                ) : (
                  <Badge tone="amber">⚠️ Perlu {gap} MP lagi</Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function taktMpDelta(t: TaktCase): number {
  if (t.category === "up") return (t.need_rows ?? []).reduce((sum, r) => sum + r.qty, 0);
  return -(t.released_persons?.length ?? t.released_pool_ids.length);
}

function TaktSummaryBlock({
  taktCases,
  demands,
  utilPool,
  refMonth,
}: {
  taktCases: TaktCase[];
  demands: Demand[];
  utilPool: UtilPoolEntry[];
  refMonth: string;
}) {
  const plants: Plant[] = ["Plant 1", "Plant 2"];
  const todayStr = format(endOfMonth(new Date(`${refMonth}-01T00:00:00`)), "yyyy-MM-dd");
  return (
    <Card title="Takt Time Monitoring Summary">
      <div className="space-y-4">
        {plants.map((plant) => {
          const cases = taktCases.filter((t) => t.plant === plant);
          const current = cases.filter((t) => t.date <= todayStr).sort((a, b) => b.date.localeCompare(a.date))[0];
          const next = cases.filter((t) => t.date > todayStr).sort((a, b) => a.date.localeCompare(b.date))[0];

          let needed = 0;
          let fulfilledCount = 0;
          if (next) {
            if (next.category === "up") {
              needed = (next.need_rows ?? []).reduce((sum, r) => sum + r.qty, 0);
              fulfilledCount = demands.filter((d) => next.demand_ids.includes(d.id) && d.status === "Fulfilled").length;
            } else {
              needed = next.released_persons?.length ?? 0;
              fulfilledCount = utilPool.filter((u) => next.released_pool_ids.includes(u.id) && u.status !== "Open").length;
            }
          }
          const kurang = needed - fulfilledCount;

          return (
            <div key={plant} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
              <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{plant}</div>

              {!current ? (
                <div className="text-xs text-slate-400">Belum ada Takt Time berjalan.</div>
              ) : (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Takt Saat Ini ({current.date})</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {current.takt_after} menit{" "}
                    <span className={taktMpDelta(current) >= 0 ? "text-emerald-600" : "text-rose-600"}>
                      ({taktMpDelta(current) >= 0 ? "+" : ""}
                      {taktMpDelta(current)} MP)
                    </span>
                  </span>
                </div>
              )}

              <div className="mt-2 border-t border-dashed border-slate-100 pt-2 dark:border-slate-800">
                {!next ? (
                  <div className="text-xs text-slate-400">Belum ada rencana Next Takt Time Prep.</div>
                ) : (
                  <div className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Next Takt Time Prep</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {next.takt_after} menit · mulai {next.date}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-slate-500">Kebutuhan {needed} orang</span>
                      {kurang <= 0 ? (
                        <Badge tone="green">✅ MP Terpenuhi</Badge>
                      ) : (
                        <Badge tone="amber">⚠️ Kurang {kurang} MP</Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
