"use client";
import { useMemo } from "react";
import { format } from "date-fns";
import { useSessionState } from "@/lib/useSessionState";
import { CalendarRange, Users2, UserCheck, FileText, GraduationCap, CalendarCheck2, UserMinus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile, ProgressBar } from "@/components/ui/StatTile";
import { Select } from "@/components/ui/Form";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { MonthBarChart } from "@/components/ui/MonthBarChart";
import { CompositionChart } from "@/components/ui/CompositionChart";
import { LaborTypeChart } from "@/components/ui/LaborTypeChart";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { useStoreList } from "@/lib/useStore";
import { demandStore, pkwtReviewStore, projectStore, taktStore, utilPoolStore, vokasiStore, zparStore } from "@/lib/repo";
import {
  currentMonthKey,
  deptsOfAny,
  directorates,
  divisionsOfAny,
  filterEmployees,
  groupCountBy,
  laborTypeComposition,
  manpowerMovementByFiscalYear,
  monthBuckets,
  pkwtEnrollmentStats,
  vokasiEnrollmentStats,
  type ReplacementStats,
} from "@/lib/engine/dashboard";
import { filterByDivDept } from "@/lib/engine/enrollment";
import { computeVokasiStatus } from "@/lib/engine/compute";
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
  const [period, setPeriod] = useSessionState<string>("dash.period", "");
  const selectedSnapshot: ZparSnapshot | undefined =
    sortedSnapshots.find((s) => s.period === period) ?? activeSnapshot ?? sortedSnapshots[0];

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
  const movementRows = useMemo(
    () => manpowerMovementByFiscalYear(snapshotsByPeriod, vokasi),
    [snapshotsByPeriod, vokasi]
  );

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
            Ringkasan kondisi manpower — read-only, mengagregasi semua modul.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <CalendarRange size={16} className="text-slate-400" />
          <span className="text-xs font-medium text-slate-500">Periode ZPAR</span>
          <Select
            value={selectedSnapshot?.period ?? ""}
            onChange={(e) => setPeriod(e.target.value)}
            className="!w-auto border-none !p-0 !py-0 text-sm font-semibold shadow-none focus:ring-0"
          >
            {sortedSnapshots.map((s) => (
              <option key={s.id} value={s.period}>
                {s.period} {s.is_active ? "(aktif)" : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* 1. Total Manpower & Status */}
      <Card title="Total Manpower & Status">
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
        <div className="grid gap-3 sm:grid-cols-4">
          <StatTile
            label="Total Manpower"
            value={filteredEmployees.length + vokasiActive.length}
            tone="blue"
            icon={Users2}
          />
          <StatTile
            label="Permanen"
            value={permanenCount.length}
            sub={`L: ${genderCount(permanenCount).L} · P: ${genderCount(permanenCount).P}`}
            tone="emerald"
            icon={UserCheck}
          />
          <StatTile
            label="Kontrak (PKWT+AKTI)"
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
      <Card title="Manpower Movement" subtitle="Komposisi Permanen / Kontrak / Vokasi per bulan, Fiscal Year (Apr–Mar)">
        <CompositionChart data={movementRows} heightClass="h-56" />
      </Card>

      {/* 3. Komposisi by Labor Type */}
      <LaborTypeBlock employees={employees} />

      {/* 4 & 5. PKWT Review / Vokasi Ended per bulan */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PkwtReviewChartBlock employees={employees} reviews={reviews} />
        <VokasiEndedChartBlock employees={employees} vokasi={vokasi} />
      </div>

      {/* 6. Enrollment Overview */}
      <EnrollmentOverviewBlock reviews={reviews} vokasi={vokasi} demands={demands} />

      {/* 7 & 8. Project / Takt Time Summary */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ProjectSummaryBlock projects={projects} demands={demands} />
        <TaktSummaryBlock taktCases={taktCases} demands={demands} utilPool={utilPool} />
      </div>
    </div>
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

function LaborTypeBlock({ employees }: { employees: EmployeeRecord[] }) {
  const [selDirectorates, setSelDirectorates] = useSessionState<string[]>("dash.laborType.directorates", []);
  const [selDivisions, setSelDivisions] = useSessionState<string[]>("dash.laborType.divisions", []);
  const [selDepts, setSelDepts] = useSessionState<string[]>("dash.laborType.depts", []);
  const filtered = filterEmployees(employees, {
    directorates: selDirectorates,
    divisions: selDivisions,
    depts: selDepts,
  });
  const rows = laborTypeComposition(filtered);

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

function PkwtReviewChartBlock({ employees, reviews }: { employees: EmployeeRecord[]; reviews: PkwtReview[] }) {
  const [selDirectorates, setSelDirectorates] = useSessionState<string[]>("dash.pkwtReview.directorates", []);
  const [selDivisions, setSelDivisions] = useSessionState<string[]>("dash.pkwtReview.divisions", []);
  const [selDepts, setSelDepts] = useSessionState<string[]>("dash.pkwtReview.depts", []);
  const filteredReviews = filterByDivDept(reviews, selDivisions, selDepts);
  const { buckets, byMonth } = monthBuckets(filteredReviews, (r) => r.tgl_review?.slice(0, 7));
  const [selected, setSelected] = useSessionState("dash.pkwtReview.month", currentMonthKey());
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
          <div className="text-xs font-semibold text-slate-500">Detail — {selected}</div>
          <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
            {detailItems.length} <span className="text-sm font-normal text-slate-500">orang review</span>
          </div>
          <div className="mt-3">
            <div className="text-xs font-medium text-slate-500">By Status Kontrak</div>
            <CompactDetailList items={byStatusKontrak} unit="review" />
          </div>
          <div className="mt-3">
            <div className="text-xs font-medium text-slate-500">By Labor Type</div>
            <CompactDetailList items={byLaborType} unit="review" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function VokasiEndedChartBlock({ employees, vokasi }: { employees: EmployeeRecord[]; vokasi: VokasiRecord[] }) {
  const [selDirectorates, setSelDirectorates] = useSessionState<string[]>("dash.vokasiEnded.directorates", []);
  const [selDivisions, setSelDivisions] = useSessionState<string[]>("dash.vokasiEnded.divisions", []);
  const [selDepts, setSelDepts] = useSessionState<string[]>("dash.vokasiEnded.depts", []);
  const filteredVokasi = filterByDivDept(vokasi, selDivisions, selDepts);
  const { buckets, byMonth } = monthBuckets(filteredVokasi, (v) => v.tgl_ended?.slice(0, 7));
  const [selected, setSelected] = useSessionState("dash.vokasiEnded.month", currentMonthKey());
  const detailItems = byMonth.get(selected) ?? [];
  const byLaborType = groupCountBy(detailItems, (v) => v.labor_type || "Other");

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
          <div className="text-xs font-semibold text-slate-500">Detail — {selected}</div>
          <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
            {detailItems.length} <span className="text-sm font-normal text-slate-500">ended</span>
          </div>
          <div className="mt-3">
            <div className="text-xs font-medium text-slate-500">By Labor Type</div>
            <CompactDetailList items={byLaborType} unit="vokasi ended" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function EnrollmentColumn({
  label,
  monthLabel,
  stats,
}: {
  label: string;
  monthLabel: string;
  stats: ReplacementStats;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-slate-500">{label}</h4>
      <div className="grid grid-cols-2 gap-3">
        <StatTile label={monthLabel} value={stats.currentMonthCount} tone="blue" icon={CalendarCheck2} />
        <StatTile label="Need Replace" value={stats.needReplace} tone="rose" icon={UserMinus} />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span>Progress Replacement</span>
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {stats.fulfilled}/{stats.total} MP replaced ({stats.percent.toFixed(0)}%)
          </span>
        </div>
        <ProgressBar percent={stats.percent} />
      </div>
      <div className="mt-3">
        <div className="text-xs font-medium text-slate-500">Komposisi Need Replace</div>
        <CompactDetailList items={stats.composition} unit="need replace" />
      </div>
    </div>
  );
}

function EnrollmentOverviewBlock({
  reviews,
  vokasi,
  demands,
}: {
  reviews: PkwtReview[];
  vokasi: VokasiRecord[];
  demands: Demand[];
}) {
  const pkwt = pkwtEnrollmentStats(reviews, demands);
  const vok = vokasiEnrollmentStats(vokasi, demands);
  return (
    <Card title="Enrollment Overview">
      <div className="grid gap-6 sm:grid-cols-2">
        <EnrollmentColumn label="PKWT" monthLabel="Review Bulan Ini" stats={pkwt} />
        <EnrollmentColumn label="Vokasi" monthLabel="Ended Bulan Ini" stats={vok} />
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
}: {
  taktCases: TaktCase[];
  demands: Demand[];
  utilPool: UtilPoolEntry[];
}) {
  const plants: Plant[] = ["Plant 1", "Plant 2"];
  const todayStr = format(new Date(), "yyyy-MM-dd");
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
                    {current.takt_after}s{" "}
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
                        {next.takt_after}s · mulai {next.date}
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
