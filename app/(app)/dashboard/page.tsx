"use client";
import { useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useSessionState } from "@/lib/useSessionState";
import {
  ClipboardList,
  Users2,
  UserCheck,
  UserPlus,
  UserMinus,
  Shuffle,
  FileText,
  GraduationCap,
  HardHat,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile, ProgressBar } from "@/components/ui/StatTile";
import { Field, Select } from "@/components/ui/Form";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { FullWidthTabs } from "@/components/ui/Tabs";
import { MonthBarChart } from "@/components/ui/MonthBarChart";
import { CompositionChart } from "@/components/ui/CompositionChart";
import { LaborTypeChart } from "@/components/ui/LaborTypeChart";
import { AgeMovementChart } from "@/components/ui/AgeMovementChart";
import { Badge, type Tone as BadgeTone } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { useStoreList } from "@/lib/useStore";
import { demandStore, pkwtReviewStore, projectStore, taktStore, utilPoolStore, vokasiStore, zparStore } from "@/lib/repo";
import {
  ageMovementForecast,
  candidateBatchesNeedingAction,
  currentMonthKey,
  demandSupplyRows,
  deptsOfAny,
  diffEmployees,
  directorates,
  divisionsOfAny,
  filterByLaborTypeStatus,
  filterEmployees,
  fiscalYearMonths,
  groupCountBy,
  laborTypeMovementByFiscalYear,
  laborTypeMovementDetail,
  manpowerMovementByFiscalYear,
  monthBuckets,
  positionBreakdown,
  previousPeriodWithData,
  reviewBatchesNeedingAction,
  shopConfirmBatchesNeedingAction,
  type ActionBatch,
  type DemandSupplyRow,
  type EmployeeDiff,
  type MovementStatus,
} from "@/lib/engine/dashboard";
import { demandTargetDate, filterByDivDept } from "@/lib/engine/enrollment";
import { computeVokasiStatus, demandVisibleDate } from "@/lib/engine/compute";
import { LABOR_TYPES } from "@/lib/types";
import { useRole } from "@/lib/RoleContext";
import type { Role } from "@/lib/roles";
import type {
  Demand,
  DemandCategory,
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
  const role = useRole();
  const snapshots = useStoreList(zparStore);
  const vokasi = useStoreList(vokasiStore);
  const demands = useStoreList(demandStore);
  const reviews = useStoreList(pkwtReviewStore);
  const projects = useStoreList(projectStore);
  const taktCases = useStoreList(taktStore);
  const utilPool = useStoreList(utilPoolStore);

  const activeSnapshot = snapshots.find((s) => s.is_active);

  // Demography sections show the roster "as of hari aktif" — always the
  // Active ZPAR snapshot, full stop. There is no viewing-month picker here
  // anymore: browsing a *different* historical snapshot is Upload Center's
  // job (via "Use This Data"), not something Dashboard should also offer.
  const employees = useMemo(() => activeSnapshot?.employees ?? [], [activeSnapshot]);

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

  // Single org filter for the whole page — every section below reads off
  // this instead of carrying its own separate Directorate/Division/Dept
  // MultiSelects.
  const [selDirectorates, setSelDirectorates] = useSessionState<string[]>("dash.org.directorates", []);
  const [selDivisions, setSelDivisions] = useSessionState<string[]>("dash.org.divisions", []);
  const [selDepts, setSelDepts] = useSessionState<string[]>("dash.org.depts", []);

  // Splits the long stack of sections below Action Needed into two switchable
  // groups so a visit doesn't mean scrolling past 8 cards to reach the one
  // you came for — "Demography" (who's on the roster) vs. "Monitoring"
  // (what needs tracking/action across reviews, demand-supply, project/takt).
  const [section, setSection] = useSessionState<"demography" | "monitoring">("dash.section", "demography");

  if (snapshots.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
        <EmptyState text="Belum ada snapshot ZPAR. Upload data di Upload Center terlebih dahulu." />
      </div>
    );
  }

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
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ringkasan kondisi manpower, read-only, mengagregasi semua modul.
        </p>
      </div>

      {/* Org filter — applies to every section below. */}
      <Card>
        <OrgCascadeFilter
          employees={employees}
          selDirectorates={selDirectorates}
          setSelDirectorates={setSelDirectorates}
          selDivisions={selDivisions}
          setSelDivisions={setSelDivisions}
          selDepts={selDepts}
          setSelDepts={setSelDepts}
        />
      </Card>

      {/* 0. Action Needed */}
      <ActionNeededBlock reviews={reviews} demands={demands} role={role} />

      <FullWidthTabs
        tabs={[
          { key: "demography", label: "Demography" },
          { key: "monitoring", label: "Monitoring" },
        ]}
        active={section}
        onChange={(k) => setSection(k as "demography" | "monitoring")}
      />

      {section === "demography" ? (
        <>
          {/* 1. Total Manpower & Status */}
          <Card
            title="Total Manpower & Status"
            subtitle={activeSnapshot ? `Data ZPAR periode ${activeSnapshot.period} (Active)` : undefined}
          >
            <TotalManpowerCard
              total={filteredEmployees.length + vokasiActive.length}
              gender={genderCount([...filteredEmployees, ...vokasiActive])}
              employees={filteredEmployees}
            />
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
            snapshotsByPeriod={snapshotsByPeriod}
            vokasi={vokasi}
            reviews={reviews}
            demands={demands}
            selDirectorates={selDirectorates}
            selDivisions={selDivisions}
            selDepts={selDepts}
          />

          {/* 3. Age Movement */}
          <AgeMovementBlock
            employees={employees}
            selDirectorates={selDirectorates}
            selDivisions={selDivisions}
            selDepts={selDepts}
          />

          {/* 4. Labor Type Movement */}
          <LaborTypeMovementBlock
            snapshotsByPeriod={snapshotsByPeriod}
            selDirectorates={selDirectorates}
            selDivisions={selDivisions}
            selDepts={selDepts}
          />
        </>
      ) : (
        <>
          {/* PKWT Monitoring / Vokasi Monitoring — each folds its own
              Demand-Supply table in, so it's not a separate card anymore. */}
          <div className="space-y-6">
            <PkwtReviewChartBlock
              reviews={reviews}
              demands={demands}
              selDivisions={selDivisions}
              selDepts={selDepts}
            />
            <VokasiEndedChartBlock
              vokasi={vokasi}
              demands={demands}
              selDivisions={selDivisions}
              selDepts={selDepts}
            />
          </div>

          {/* Project Monitoring / Takt Time Monitoring */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ProjectSummaryBlock projects={projects} demands={demands} />
            <TaktSummaryBlock taktCases={taktCases} demands={demands} utilPool={utilPool} />
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 0. Action Needed — one row per (stage, category): Isi Review PKWT,
// Mapping Candidate PKWT/Vokasi, Shop Confirmation PKWT/Vokasi. Each row
// collapses every month-batch with a gap into a single total + worst-case
// status, so the panel stays a fixed 5 rows no matter how big a backlog
// gets — full month-by-month detail still lives on the linked source page.
// ---------------------------------------------------------------------------

interface ActionSectionSpec {
  key: string;
  icon: typeof ClipboardList;
  title: string;
  anchor: "due_date" | "arrival";
  batches: ActionBatch[];
}

/** Which Action Needed rows are each role's own job — admin sees the whole
 * pipeline as a monitoring overview; HR only fills PKWT reviews; Shop maps
 * replacements in Demand Pool and confirms them on the floor; Guest gets no
 * action rows at all (view-only). */
const ROLE_ACTION_KEYS: Record<Role, string[] | null> = {
  admin: null, // null = show every section
  hr: ["review"],
  shop: ["candidate-pkwt", "candidate-vokasi", "shop-pkwt", "shop-vokasi"],
  guest: [],
};

function ActionNeededBlock({ reviews, demands, role }: { reviews: PkwtReview[]; demands: Demand[]; role: Role }) {
  const reviewBatches = useMemo(() => reviewBatchesNeedingAction(reviews), [reviews]);
  const candidatePkwt = useMemo(() => candidateBatchesNeedingAction(demands, "PKWT"), [demands]);
  const candidateVokasi = useMemo(() => candidateBatchesNeedingAction(demands, "Vokasi"), [demands]);
  const shopPkwt = useMemo(() => shopConfirmBatchesNeedingAction(demands, "PKWT"), [demands]);
  const shopVokasi = useMemo(() => shopConfirmBatchesNeedingAction(demands, "Vokasi"), [demands]);

  const allSections: ActionSectionSpec[] = [
    { key: "review", icon: ClipboardList, title: "Isi Review PKWT", anchor: "due_date", batches: reviewBatches },
    { key: "candidate-pkwt", icon: Users2, title: "Mapping Candidate PKWT", anchor: "due_date", batches: candidatePkwt },
    { key: "candidate-vokasi", icon: Users2, title: "Mapping Candidate Vokasi", anchor: "due_date", batches: candidateVokasi },
    { key: "shop-pkwt", icon: HardHat, title: "Shop Confirmation PKWT", anchor: "arrival", batches: shopPkwt },
    { key: "shop-vokasi", icon: HardHat, title: "Shop Confirmation Vokasi", anchor: "arrival", batches: shopVokasi },
  ];
  const allowedKeys = ROLE_ACTION_KEYS[role];
  const sections = allowedKeys === null ? allSections : allSections.filter((s) => allowedKeys.includes(s.key));

  if (sections.length === 0) return null;

  return (
    <Card title="Action Needed" subtitle="Progres tiap tahap review, candidate mapping, dan shop confirmation — real-time.">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {sections.map((section) => (
          <ActionSummaryRow key={section.key} section={section} />
        ))}
      </div>
    </Card>
  );
}

function ActionSummaryRow({ section }: { section: ActionSectionSpec }) {
  const { icon: Icon, title, anchor, batches } = section;
  if (batches.length === 0) {
    return (
      <div className="flex items-center gap-3 py-2.5 text-sm">
        <Icon size={15} className="shrink-0 text-slate-300 dark:text-slate-600" />
        <span className="flex-1 text-slate-500 dark:text-slate-400">{title}</span>
        <Badge tone="green">Aman</Badge>
      </div>
    );
  }

  const totalGap = batches.reduce((sum, b) => sum + (b.total - b.done), 0);
  const worst = batches.reduce((a, b) => (b.daysRemaining < a.daysRemaining ? b : a));
  const overdue = worst.daysRemaining < 0;
  const days = Math.abs(worst.daysRemaining);
  const statusLabel =
    anchor === "arrival"
      ? overdue
        ? `H+${days} Arrival to Shop`
        : `H-${days} Arrival to Shop`
      : overdue
        ? `Overdue ${days}D`
        : `H-${days} due date`;

  return (
    <Link
      href={worst.href}
      className="flex items-center gap-3 py-2.5 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60"
    >
      <Icon size={15} className="shrink-0 text-slate-400" />
      <span className="flex-1 text-slate-700 dark:text-slate-200">
        {title}{" "}
        <span className="text-slate-400">
          — {totalGap} MP tertunda · {batches.length} bulan
        </span>
      </span>
      <Badge tone={overdue ? "red" : "amber"}>{statusLabel}</Badge>
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

function TotalManpowerCard({
  total,
  gender,
  employees,
}: {
  total: number;
  gender: { L: number; P: number };
  employees: EmployeeRecord[];
}) {
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
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              L: {gender.L} · P: {gender.P}
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
  snapshotsByPeriod,
  vokasi,
  reviews,
  demands,
  selDirectorates,
  selDivisions,
  selDepts,
}: {
  snapshotsByPeriod: Map<string, EmployeeRecord[]>;
  vokasi: VokasiRecord[];
  reviews: PkwtReview[];
  demands: Demand[];
  selDirectorates: string[];
  selDivisions: string[];
  selDepts: string[];
}) {
  const [selLaborTypes, setSelLaborTypes] = useSessionState<string[]>("dash.movement.laborTypes", []);
  const [selStatuses, setSelStatuses] = useSessionState<MovementStatus[]>("dash.movement.statuses", []);

  // The FY window anchors to real "today" — not a page-level viewing-month
  // pick — since this chart's job is "where movement stands right now", with
  // "Lihat Perubahan" below as the dedicated control for historical diffing.
  const refDate = useMemo(() => new Date(), []);
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

  const [diffMonth, setDiffMonth] = useSessionState<string>("dash.movement.diffMonth", "");
  const availableMonths = useMemo(() => Array.from(snapshotsByPeriod.keys()).sort().reverse(), [snapshotsByPeriod]);
  const prevMonth = diffMonth ? previousPeriodWithData(diffMonth, snapshotsByPeriod) : null;
  // "Lihat Perubahan" follows both the shared org filter AND this section's
  // own Labor Type/Status selection — narrowing the chart above should
  // narrow the diff panel below it the same way.
  const diff = useMemo(() => {
    if (!diffMonth || !prevMonth) return null;
    const before = filterByLaborTypeStatus(snapshotsByPeriod.get(prevMonth)!, selLaborTypes, selStatuses);
    const after = filterByLaborTypeStatus(snapshotsByPeriod.get(diffMonth)!, selLaborTypes, selStatuses);
    return diffEmployees(before, after, reviews, demands, {
      directorates: selDirectorates,
      divisions: selDivisions,
      depts: selDepts,
    });
  }, [diffMonth, prevMonth, snapshotsByPeriod, reviews, demands, selDirectorates, selDivisions, selDepts, selLaborTypes, selStatuses]);

  return (
    <Card
      title="Manpower Movement"
      action={
        availableMonths.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <Shuffle size={14} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Lihat Perubahan</span>
            <Select
              bare
              value={diffMonth}
              onChange={(e) => setDiffMonth(e.target.value)}
              className="!w-auto border-none !p-0 !py-0 text-sm font-semibold shadow-none focus:ring-0"
            >
              <option value="">- pilih bulan -</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {format(new Date(`${m}-01T00:00:00`), "MMM yyyy")}
                </option>
              ))}
            </Select>
          </div>
        )
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
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
      {diffMonth && (
        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          {!diff ? (
            <EmptyState text="Tidak ada data periode sebelumnya untuk dibandingkan." />
          ) : (
            <EmployeeDiffPanel diff={diff} fromMonth={prevMonth!} toMonth={diffMonth} />
          )}
        </div>
      )}
    </Card>
  );
}

const MUTATION_FIELD_LABELS: Record<string, string> = {
  division: "Divisi",
  dept: "Dept",
  section: "Section",
};

const EXIT_REASON_TONE: Record<string, BadgeTone> = {
  "Kontrak Ended/Terminate": "amber",
  Pensiun: "blue",
  Resign: "red",
  "Tidak Diketahui": "slate",
};

function EmployeeDiffPanel({ diff, fromMonth, toMonth }: { diff: EmployeeDiff; fromMonth: string; toMonth: string }) {
  const fmtMonth = (m: string) => format(new Date(`${m}-01T00:00:00`), "MMM yyyy");
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Perubahan {fmtMonth(fromMonth)} → {fmtMonth(toMonth)}, berdasarkan noreg.
      </p>
      <div className="grid gap-4 lg:grid-cols-4">
        <DiffColumn
          icon={UserPlus}
          tone="emerald"
          title={`Baru (${diff.newHires.length})`}
          empty="Tidak ada penambahan."
          rows={diff.newHires.map((e) => ({
            key: e.employee.noreg,
            primary: `${e.employee.nama} (${e.employee.noreg})`,
            secondary: `${e.employee.division} · ${e.employee.dept}`,
            tag: e.overlapping ? "PKWT Overlapping" : undefined,
            tagTone: "violet" as BadgeTone,
          }))}
        />
        <DiffColumn
          icon={UserMinus}
          tone="red"
          title={`Keluar (${diff.exits.length})`}
          empty="Tidak ada pengurangan."
          rows={diff.exits.map((e) => ({
            key: e.employee.noreg,
            primary: `${e.employee.nama} (${e.employee.noreg})`,
            secondary: `${e.employee.division} · ${e.employee.dept}`,
            tag: e.reason,
            tagTone: EXIT_REASON_TONE[e.reason],
          }))}
        />
        <DiffColumn
          icon={Shuffle}
          tone="amber"
          title={`Mutasi (${diff.mutations.length})`}
          empty="Tidak ada mutasi."
          rows={diff.mutations.map((m) => ({
            key: m.noreg,
            primary: `${m.nama} (${m.noreg})`,
            secondary: m.changedFields
              .map((f) => `${MUTATION_FIELD_LABELS[f]}: ${m.before[f] || "-"} → ${m.after[f] || "-"}`)
              .join(" · "),
          }))}
        />
        <DiffColumn
          icon={TrendingUp}
          tone="violet"
          title={`Posisi (${diff.positionChanges.length})`}
          empty="Tidak ada perubahan posisi."
          rows={diff.positionChanges.map((p) => ({
            key: p.noreg,
            primary: `${p.nama} (${p.noreg})`,
            secondary: `${p.before || "-"} → ${p.after || "-"}`,
          }))}
        />
      </div>
    </div>
  );
}

function DiffColumn({
  icon: Icon,
  tone,
  title,
  empty,
  rows,
}: {
  icon: typeof UserPlus;
  tone: "emerald" | "red" | "amber" | "violet";
  title: string;
  empty: string;
  rows: { key: string; primary: string; secondary: string; tag?: string; tagTone?: BadgeTone }[];
}) {
  const toneClass = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
    violet: "text-violet-600 dark:text-violet-400",
  }[tone];
  return (
    <div>
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${toneClass}`}>
        <Icon size={13} /> {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">{empty}</p>
      ) : (
        <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((r) => (
            <div key={r.key} className="rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-700 dark:text-slate-200">{r.primary}</span>
                {r.tag && <Badge tone={r.tagTone}>{r.tag}</Badge>}
              </div>
              <div className="text-slate-400">{r.secondary}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Movement", not just a snapshot: one bar per FY month stacked by every
 * ZPAR labor_type code, plus a month-picker below splitting that month's
 * change into "New In" (brand-new hires landing on a code) and "Retagging"
 * (an existing employee's code itself changed, e.g. A → B2) — same idea as
 * Manpower Movement's chart, but for labor_type instead of
 * Permanen/Kontrak/Vokasi. */
function LaborTypeMovementBlock({
  snapshotsByPeriod,
  selDirectorates,
  selDivisions,
  selDepts,
}: {
  snapshotsByPeriod: Map<string, EmployeeRecord[]>;
  selDirectorates: string[];
  selDivisions: string[];
  selDepts: string[];
}) {
  const refDate = useMemo(() => new Date(), []);
  const rows = useMemo(
    () =>
      laborTypeMovementByFiscalYear(
        snapshotsByPeriod,
        { directorates: selDirectorates, divisions: selDivisions, depts: selDepts },
        refDate
      ),
    [snapshotsByPeriod, selDirectorates, selDivisions, selDepts, refDate]
  );

  const monthsWithData = useMemo(
    () => fiscalYearMonths(refDate).filter((m) => snapshotsByPeriod.has(m)),
    [snapshotsByPeriod, refDate]
  );
  const latestMonth = monthsWithData[monthsWithData.length - 1] ?? "";
  const [selMonth, setSelMonth] = useSessionState("dash.laborTypeMovement.month", latestMonth);
  const effectiveMonth = monthsWithData.includes(selMonth) ? selMonth : latestMonth;
  const prevMonth = effectiveMonth ? previousPeriodWithData(effectiveMonth, snapshotsByPeriod) : null;
  const detail = useMemo(() => {
    if (!effectiveMonth || !prevMonth) return { newIn: [], retagging: [] };
    return laborTypeMovementDetail(snapshotsByPeriod.get(prevMonth)!, snapshotsByPeriod.get(effectiveMonth)!, {
      directorates: selDirectorates,
      divisions: selDivisions,
      depts: selDepts,
    });
  }, [effectiveMonth, prevMonth, snapshotsByPeriod, selDirectorates, selDivisions, selDepts]);
  const totalNewIn = detail.newIn.reduce((sum, n) => sum + n.count, 0);
  const totalRetagging = detail.retagging.reduce((sum, r) => sum + r.count, 0);

  const [selFrom, setSelFrom] = useSessionState("dash.laborTypeMovement.from", "");
  const [selTo, setSelTo] = useSessionState("dash.laborTypeMovement.to", "");
  const fromOptions = Array.from(new Set(detail.retagging.map((r) => r.from))).sort();
  const toOptions = Array.from(
    new Set(detail.retagging.filter((r) => !selFrom || r.from === selFrom).map((r) => r.to))
  ).sort();
  const matchedRetag = detail.retagging.find((r) => r.from === selFrom && r.to === selTo);
  const fmtMonth = (m: string) => format(new Date(`${m}-01T00:00:00`), "MMM yy");

  return (
    <Card title="Labor Type Movement" subtitle="1 fiscal year berjalan, dari data ZPAR terbaru per bulan.">
      {rows.length === 0 ? (
        <EmptyState text="Tidak ada data." />
      ) : (
        <div className="space-y-4">
          <LaborTypeChart data={rows} />
          {monthsWithData.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {monthsWithData.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelMonth(m)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                    effectiveMonth === m
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-300"
                      : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  {fmtMonth(m)}
                </button>
              ))}
            </div>
          )}
          {effectiveMonth && (
            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500">
                {prevMonth
                  ? `Perubahan Labor Type — ${fmtMonth(prevMonth)} → ${fmtMonth(effectiveMonth)}`
                  : "Tidak ada periode sebelumnya untuk dibandingkan."}
              </div>
              {prevMonth && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-500">
                      New In <span className="font-normal text-slate-400">({totalNewIn} orang — MP baru masuk)</span>
                    </div>
                    <CompactDetailList
                      items={detail.newIn.map((n) => ({ key: n.laborType, count: n.count }))}
                      unit="new in"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500">
                      Retagging{" "}
                      <span className="font-normal text-slate-400">
                        ({totalRetagging} orang, {detail.retagging.length} case)
                      </span>
                    </div>
                    {detail.retagging.length === 0 ? (
                      <p className="mt-1 text-sm text-slate-400">Tidak ada retagging.</p>
                    ) : (
                      <>
                        <CompactDetailList
                          items={detail.retagging.map((r) => ({ key: `${r.from} → ${r.to}`, count: r.count }))}
                          unit="case"
                        />
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Field label="Dari">
                            <Select
                              value={selFrom}
                              onChange={(e) => {
                                setSelFrom(e.target.value);
                                setSelTo("");
                              }}
                            >
                              <option value="">- pilih -</option>
                              {fromOptions.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Ke">
                            <Select value={selTo} onChange={(e) => setSelTo(e.target.value)} disabled={!selFrom}>
                              <option value="">- pilih -</option>
                              {toOptions.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                        {selFrom && selTo && (
                          <div className="mt-2">
                            {!matchedRetag || matchedRetag.people.length === 0 ? (
                              <p className="text-sm text-slate-400">Tidak ada.</p>
                            ) : (
                              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                                {matchedRetag.people.map((p) => (
                                  <div
                                    key={p.noreg}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs dark:border-slate-800"
                                  >
                                    <span className="font-medium text-slate-700 dark:text-slate-200">
                                      {p.nama} ({p.noreg})
                                    </span>
                                    <span className="text-slate-400">
                                      {p.division} · {p.dept}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Forecast, not a live count — read against the Active ZPAR snapshot only,
 * assuming nobody retiring gets replaced. Retirement age is 55: anyone
 * projected past 55 drops out of the stacked buckets and is tracked instead
 * as a dashed cumulative "Pensiun" line, so the bar's own height already
 * shows what headcount becomes without backfill. */
function AgeMovementBlock({
  employees,
  selDirectorates,
  selDivisions,
  selDepts,
}: {
  employees: EmployeeRecord[];
  selDirectorates: string[];
  selDivisions: string[];
  selDepts: string[];
}) {
  const orgFiltered = filterEmployees(employees, {
    directorates: selDirectorates,
    divisions: selDivisions,
    depts: selDepts,
  });

  const [selLaborTypes, setSelLaborTypes] = useSessionState<string[]>("dash.ageMovement.laborTypes", []);
  const [selStatus, setSelStatus] = useSessionState<string[]>("dash.ageMovement.status", []);
  const [selPosisi, setSelPosisi] = useSessionState<string[]>("dash.ageMovement.posisi", []);

  const statusOptions = Array.from(new Set(orgFiltered.map((e) => e.status_kontrak))).sort();
  const posisiOptions = Array.from(new Set(orgFiltered.map((e) => e.posisi_struktural).filter(Boolean))).sort();

  const filtered = orgFiltered.filter(
    (e) =>
      (selLaborTypes.length === 0 || selLaborTypes.includes(e.labor_type)) &&
      (selStatus.length === 0 || selStatus.includes(e.status_kontrak)) &&
      (selPosisi.length === 0 || selPosisi.includes(e.posisi_struktural))
  );

  const checkpoints = useMemo(() => ageMovementForecast(filtered), [filtered]);
  const [selectedKey, setSelectedKey] = useSessionState("dash.ageMovement.checkpoint", checkpoints[0]?.key ?? "");
  const selected = checkpoints.find((c) => c.key === selectedKey) ?? checkpoints[0];

  return (
    <Card
      title="Age Movement"
      subtitle="Forecast dari ZPAR Active — asumsi tidak ada penggantian saat pensiun (efektif 1 bulan setelah usia 55, khusus MP Permanen)."
    >
      {checkpoints.length === 0 ? (
        <EmptyState text="Tidak ada data." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MultiSelect label="Labor Type" options={[...LABOR_TYPES]} selected={selLaborTypes} onChange={setSelLaborTypes} />
            <MultiSelect label="Status" options={statusOptions} selected={selStatus} onChange={setSelStatus} />
            <MultiSelect label="Posisi (Struktural)" options={posisiOptions} selected={selPosisi} onChange={setSelPosisi} />
          </div>
          <AgeMovementChart data={checkpoints} />
          <div className="flex flex-wrap gap-2">
            {checkpoints.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setSelectedKey(c.key)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selected?.key === c.key
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-300"
                    : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
                }`}
              >
                {c.key}
              </button>
            ))}
          </div>
          {selected && (
            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <div className="text-xs font-medium text-slate-500">Total Active — {selected.key}</div>
                  <div className="mt-0.5 text-2xl font-bold text-slate-800 dark:text-slate-100">
                    {selected.totalActive} <span className="text-sm font-normal text-slate-500">orang</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Pensiun (kumulatif)</div>
                  <div className="mt-0.5 text-2xl font-bold text-slate-800 dark:text-slate-100">
                    {selected.pensiunKumulatif} <span className="text-sm font-normal text-slate-500">orang</span>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <div className="text-xs font-medium text-slate-500">
                  {selected.key === checkpoints[0].key
                    ? "Sudah pensiun (dikeluarkan dari figure aktif)"
                    : `Baru pensiun sejak ${checkpoints[checkpoints.indexOf(selected) - 1]?.key}`}
                </div>
                {selected.baruPensiun.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-400">Tidak ada.</p>
                ) : (
                  <div className="mt-1.5 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {selected.baruPensiun.map((r) => (
                      <div
                        key={r.noreg}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs dark:border-slate-800"
                      >
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {r.nama} ({r.noreg})
                        </span>
                        <span className="flex items-center gap-2 text-slate-400">
                          {r.division} · {r.dept}
                          <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                            {r.bulanPensiun}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
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

/** Both PKWT/Vokasi Monitoring cards fold their category's Demand-Supply
 * table in directly (the standalone "Demand-Supply Overview" card is gone —
 * it only ever showed the same two tables side by side). Scoped to the real
 * current month, same demandVisibleDate/demandTargetDate window Demand Pool
 * itself uses, plus the page's org filter. */
function scopedDemandSupplyRows(
  demands: Demand[],
  category: DemandCategory,
  selDivisions: string[],
  selDepts: string[]
): DemandSupplyRow[] {
  const today = currentMonthKey();
  const monthDemands = demands.filter((d) => demandVisibleDate(demandTargetDate(d)).slice(0, 7) === today);
  const scoped = filterByDivDept(monthDemands, selDivisions, selDepts);
  return demandSupplyRows(scoped, category);
}

function PkwtReviewChartBlock({
  reviews,
  demands,
  selDivisions,
  selDepts,
}: {
  reviews: PkwtReview[];
  demands: Demand[];
  selDivisions: string[];
  selDepts: string[];
}) {
  const today = currentMonthKey();
  const filteredReviews = filterByDivDept(reviews, selDivisions, selDepts);
  const { buckets, byMonth } = monthBuckets(filteredReviews, (r) => r.tgl_review?.slice(0, 7), 3, 5, today);
  const [selected, setSelected] = useSessionState("dash.pkwtReview.month", today);
  const detailItems = byMonth.get(selected) ?? [];
  const byStatusKontrak = groupCountBy(detailItems, (r) => r.status_kontrak);
  const byLaborType = groupCountBy(detailItems, (r) => r.labor_type || "Other");
  const demandSupply = scopedDemandSupplyRows(demands, "PKWT", selDivisions, selDepts);

  return (
    <Card title="PKWT Monitoring">
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
        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="mb-2 text-xs font-semibold text-slate-500">Demand-Supply — Bulan berjalan ({today})</div>
          <DemandSupplyTable label="PKWT" rows={demandSupply} />
        </div>
      </div>
    </Card>
  );
}

function VokasiEndedChartBlock({
  vokasi,
  demands,
  selDivisions,
  selDepts,
}: {
  vokasi: VokasiRecord[];
  demands: Demand[];
  selDivisions: string[];
  selDepts: string[];
}) {
  const today = currentMonthKey();
  const filteredVokasi = filterByDivDept(vokasi, selDivisions, selDepts);
  const { buckets, byMonth } = monthBuckets(filteredVokasi, (v) => v.tgl_ended?.slice(0, 7), 3, 5, today);
  const [selected, setSelected] = useSessionState("dash.vokasiEnded.month", today);
  const detailItems = byMonth.get(selected) ?? [];
  const demandSupply = scopedDemandSupplyRows(demands, "Vokasi", selDivisions, selDepts);

  return (
    <Card title="Vokasi Monitoring">
      <div className="space-y-4">
        <MonthBarChart data={buckets} selectedMonth={selected} onSelect={setSelected} showValueLabels />
        <div>
          <div className="text-xs font-semibold text-slate-500">Detail: {selected}</div>
          <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
            {detailItems.length} <span className="text-sm font-normal text-slate-500">ended</span>
          </div>
        </div>
        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="mb-2 text-xs font-semibold text-slate-500">Demand-Supply — Bulan berjalan ({today})</div>
          <DemandSupplyTable label="Vokasi" rows={demandSupply} />
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

function ProjectSummaryBlock({ projects, demands }: { projects: Project[]; demands: Demand[] }) {
  const ongoing = projects.filter((p) => p.status === "Ongoing");
  return (
    <Card title="Project Monitoring">
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
    <Card title="Takt Time Monitoring">
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
