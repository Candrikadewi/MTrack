// Aggregation helpers for the Dashboard — pure functions over the raw
// stores, read-only per MTRACK_SPEC.md §5 / §11.
import { addMonths, endOfMonth, format, subMonths } from "date-fns";
import { fulfillmentDeadline, reviewFillDeadline, sisaHari } from "./compute";
import { demandTargetDate } from "./enrollment";
import { POSISI_STRUKTURAL_GROUPS } from "../types";
import type { Demand, DemandCategory, DemandOriginType, EmployeeRecord, PkwtReview, VokasiRecord } from "../types";

export function directorates(employees: EmployeeRecord[]): string[] {
  return Array.from(new Set(employees.map((e) => e.directorat))).sort();
}

export function divisionsOf(employees: EmployeeRecord[], directorat?: string): string[] {
  const scoped = directorat ? employees.filter((e) => e.directorat === directorat) : employees;
  return Array.from(new Set(scoped.map((e) => e.division))).sort();
}

export function deptsOf(employees: EmployeeRecord[], division?: string): string[] {
  const scoped = division ? employees.filter((e) => e.division === division) : employees;
  return Array.from(new Set(scoped.map((e) => e.dept))).sort();
}

/** Multi-select variant: divisions under any of the given directorates (all divisions if empty). */
export function divisionsOfAny(employees: EmployeeRecord[], directorats: string[]): string[] {
  const scoped = directorats.length ? employees.filter((e) => directorats.includes(e.directorat)) : employees;
  return Array.from(new Set(scoped.map((e) => e.division))).sort();
}

/** Multi-select variant: depts under any of the given divisions (all depts if empty). */
export function deptsOfAny(employees: EmployeeRecord[], divisions: string[]): string[] {
  const scoped = divisions.length ? employees.filter((e) => divisions.includes(e.division)) : employees;
  return Array.from(new Set(scoped.map((e) => e.dept))).sort();
}

export interface OrgFilter {
  directorates: string[];
  divisions: string[];
  depts: string[];
}

export function filterEmployees(employees: EmployeeRecord[], filter: OrgFilter): EmployeeRecord[] {
  return employees.filter(
    (e) =>
      (filter.directorates.length === 0 || filter.directorates.includes(e.directorat)) &&
      (filter.divisions.length === 0 || filter.divisions.includes(e.division)) &&
      (filter.depts.length === 0 || filter.depts.includes(e.dept))
  );
}

export interface CompositionRow {
  key: string;
  permanen: number;
  kontrak: number;
  vokasi: number;
  laki: number;
  perempuan: number;
}

// ---------------------------------------------------------------------------
// Manpower Movement — one bar per month of the Fiscal Year (April → March)
// ---------------------------------------------------------------------------

/** 12 "yyyy-MM" month keys for the fiscal year (Apr–Mar) containing refDate. */
export function fiscalYearMonths(refDate: Date = new Date()): string[] {
  const startYear = refDate.getMonth() >= 3 ? refDate.getFullYear() : refDate.getFullYear() - 1;
  return Array.from({ length: 12 }, (_, i) => format(new Date(startYear, 3 + i, 1), "yyyy-MM"));
}

function isVokasiActiveAsOf(v: VokasiRecord, asOfIsoDate: string): boolean {
  if (!v.tgl_masuk || v.tgl_masuk > asOfIsoDate) return false;
  return !v.tgl_ended || v.tgl_ended > asOfIsoDate;
}

export type MovementStatus = "Permanen" | "Kontrak" | "Vokasi";

export interface MovementFilter {
  org: OrgFilter;
  laborTypes: string[];
  statuses: MovementStatus[]; // empty = all three
}

/** Movement per FY month, sourced from the ZPAR snapshot whose `period` matches
 * that month (0 if no snapshot uploaded for it) + Vokasi active as of month-end.
 * `filter` scopes both the ZPAR employees and the Vokasi records — Vokasi has no
 * `directorat`, so only its div/dept are matched against `filter.org`. */
export function manpowerMovementByFiscalYear(
  snapshotsByPeriod: Map<string, EmployeeRecord[]>,
  vokasi: VokasiRecord[],
  filter: MovementFilter = { org: { directorates: [], divisions: [], depts: [] }, laborTypes: [], statuses: [] },
  refDate: Date = new Date()
): CompositionRow[] {
  const statuses = filter.statuses.length ? filter.statuses : (["Permanen", "Kontrak", "Vokasi"] as MovementStatus[]);
  const showPermanen = statuses.includes("Permanen");
  const showKontrak = statuses.includes("Kontrak");
  const showVokasi = statuses.includes("Vokasi");

  return fiscalYearMonths(refDate).map((month) => {
    const scoped = filterEmployees(snapshotsByPeriod.get(month) ?? [], filter.org).filter(
      (e) => filter.laborTypes.length === 0 || filter.laborTypes.includes(e.labor_type)
    );
    const permanenRows = showPermanen ? scoped.filter((e) => e.status_kontrak === "Permanen") : [];
    const kontrakRows = showKontrak ? scoped.filter((e) => e.status_kontrak !== "Permanen") : [];
    const monthEnd = format(endOfMonth(new Date(`${month}-01T00:00:00`)), "yyyy-MM-dd");
    const vokasiScoped = vokasi.filter(
      (v) =>
        (filter.org.divisions.length === 0 || filter.org.divisions.includes(v.div)) &&
        (filter.org.depts.length === 0 || filter.org.depts.includes(v.dept)) &&
        (filter.laborTypes.length === 0 || filter.laborTypes.includes(v.labor_type))
    );
    const vokasiRows = showVokasi ? vokasiScoped.filter((v) => isVokasiActiveAsOf(v, monthEnd)) : [];
    return {
      key: format(new Date(`${month}-01T00:00:00`), "MMM yy"),
      permanen: permanenRows.length,
      kontrak: kontrakRows.length,
      vokasi: vokasiRows.length,
      laki:
        permanenRows.filter((e) => e.gender === "L").length +
        kontrakRows.filter((e) => e.gender === "L").length +
        vokasiRows.filter((v) => v.gender === "L").length,
      perempuan:
        permanenRows.filter((e) => e.gender === "P").length +
        kontrakRows.filter((e) => e.gender === "P").length +
        vokasiRows.filter((v) => v.gender === "P").length,
    };
  });
}

// ---------------------------------------------------------------------------
// Komposisi by Labor Type
// ---------------------------------------------------------------------------

export const LABOR_TYPE_GROUPS: { base: string; codes: string[] }[] = [
  { base: "A", codes: ["A"] },
  { base: "B", codes: ["B1", "B2", "B3", "B4"] },
  { base: "C", codes: ["C1", "C2"] },
  { base: "D", codes: ["D"] },
  { base: "E", codes: ["E1", "E2"] },
  { base: "T", codes: ["T"] },
  { base: "F", codes: ["F"] },
];

export type LaborTypeRow = { key: string } & Record<string, number | string>;

/** One row per base group (A,B,C,D,E,T,F); sub-codes (B1-4/C1-2/E1-2) become
 * separate stacked keys within the same bar. Vokasi (not a ZPAR labor_type code)
 * is appended as its own bar from the caller-supplied active-Vokasi count. */
export function laborTypeComposition(employees: EmployeeRecord[], activeVokasiCount = 0): LaborTypeRow[] {
  const counts = new Map<string, number>();
  for (const e of employees) {
    const code = e.labor_type.trim();
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const rows: LaborTypeRow[] = LABOR_TYPE_GROUPS.map((g) => {
    const row: LaborTypeRow = { key: g.base };
    for (const code of g.codes) {
      const c = counts.get(code) ?? 0;
      if (c > 0) row[code] = c;
    }
    return row;
  });
  if (activeVokasiCount > 0) rows.push({ key: "Vokasi", Vokasi: activeVokasiCount });
  return rows;
}

// ---------------------------------------------------------------------------
// Total Manpower & Status — Posisi (Struktural) breakdown
// ---------------------------------------------------------------------------

export interface PositionBreakdownRow {
  label: string;
  count: number;
}

/** Counts employees per POSISI_STRUKTURAL_GROUPS bucket, in that fixed display
 * order (first substring match wins). Unrecognized/blank positions are omitted. */
export function positionBreakdown(employees: EmployeeRecord[]): PositionBreakdownRow[] {
  return POSISI_STRUKTURAL_GROUPS.map((g) => ({
    label: g.label,
    count: employees.filter((e) => e.posisi_struktural?.toLowerCase().includes(g.match)).length,
  })).filter((r) => r.count > 0);
}

// ---------------------------------------------------------------------------
// Month bucketing (PKWT Review / Vokasi Ended charts)
// ---------------------------------------------------------------------------

export interface MonthBucket {
  month: string;
  label: string;
  value: number;
  isCurrent: boolean;
}

/** `refMonth` ("yyyy-MM") is the dashboard's viewing-month reference — the
 * window is centered on it and it's what gets marked `isCurrent`, not
 * necessarily today's real-world month. */
export function monthBuckets<T>(
  items: T[],
  monthOf: (item: T) => string | undefined,
  monthsBefore = 3,
  monthsAfter = 5,
  refMonth: string = format(new Date(), "yyyy-MM")
): { buckets: MonthBucket[]; byMonth: Map<string, T[]> } {
  const refDate = new Date(`${refMonth}-01T00:00:00`);
  const byMonth = new Map<string, T[]>();
  const months: string[] = [];
  for (let i = -monthsBefore; i <= monthsAfter; i++) {
    const m = format(addMonths(refDate, i), "yyyy-MM");
    months.push(m);
    byMonth.set(m, []);
  }
  for (const item of items) {
    const m = monthOf(item);
    if (m && byMonth.has(m)) byMonth.get(m)!.push(item);
  }
  const buckets = months.map((m) => ({
    month: m,
    label: format(new Date(`${m}-01T00:00:00`), "MMM yy"),
    value: byMonth.get(m)?.length ?? 0,
    isCurrent: m === refMonth,
  }));
  return { buckets, byMonth };
}

export function currentMonthKey(): string {
  return format(new Date(), "yyyy-MM");
}

export function groupCountBy<T>(items: T[], keyOf: (item: T) => string): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Enrollment Overview — need-replace + composition breakdown
// ---------------------------------------------------------------------------

const ORIGIN_LABELS: Record<DemandOriginType, string> = {
  PkwtTerminate: "PKWT Terminate",
  VokasiEnded: "Vokasi Ended",
  Project: "Project",
  TaktUp: "Takt Time",
  Resign: "Resign",
  Pension: "Pension",
  GST: "GST",
  Unfit: "Unfit",
  Others: "Others",
  Manual: "Manual",
};

export function demandOriginLabel(d: Demand): string {
  return ORIGIN_LABELS[d.origin_type] ?? d.origin_type;
}

export interface DemandSupplyRow {
  reason: string;
  demand: number;
  supply: number;
  percent: number;
}

/** One row per origin reason (Replacement Need) for the given category — Demand =
 * every demand ever raised for that reason, Supply = how many are Fulfilled. */
export function demandSupplyRows(demands: Demand[], category: DemandCategory): DemandSupplyRow[] {
  const scoped = demands.filter((d) => d.category === category);
  const counts = new Map<string, { demand: number; supply: number }>();
  for (const d of scoped) {
    const reason = demandOriginLabel(d);
    const entry = counts.get(reason) ?? { demand: 0, supply: 0 };
    entry.demand++;
    if (d.status === "Fulfilled") entry.supply++;
    counts.set(reason, entry);
  }
  return Array.from(counts.entries())
    .map(([reason, v]) => ({ reason, demand: v.demand, supply: v.supply, percent: v.demand ? (v.supply / v.demand) * 100 : 0 }))
    .sort((a, b) => b.demand - a.demand);
}

// ---------------------------------------------------------------------------
// Action Needed (Dashboard) — cross-stage worklist surfacing what's overdue
// or due soon across the PKWT enrollment -> demand -> fulfillment chain, so
// no single stage silently slips. See MTRACK_SPEC.md §12 lead-time chain.
// ---------------------------------------------------------------------------

const ACTION_WINDOW_DAYS = 7;

export type ActionKind = "review" | "candidate" | "shop_confirm";

export interface ActionItem {
  id: string;
  noreg: string;
  nama: string;
  dept: string;
  kind: ActionKind;
  label: string;
  dueDate: string;
  daysRemaining: number;
  href: string;
}

function withinActionWindow(dueDate: string): boolean {
  return Boolean(dueDate) && sisaHari(dueDate) <= ACTION_WINDOW_DAYS;
}

/** Stage 1: PKWT reviews not yet filled (Continue/Terminate), due or overdue
 * for their fill deadline (tgl_review - 30 hari kerja). */
export function reviewsNeedingAction(reviews: PkwtReview[]): ActionItem[] {
  return reviews
    .filter((r) => r.review_result === "")
    .map((r): ActionItem => {
      const dueDate = reviewFillDeadline(r.tgl_review);
      return {
        id: r.id,
        noreg: r.noreg,
        nama: r.nama,
        dept: r.dept,
        kind: "review",
        label: "Isi review PKWT",
        dueDate,
        daysRemaining: sisaHari(dueDate),
        href: "/enrollment",
      };
    })
    .filter((item) => withinActionWindow(item.dueDate))
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/** Stage 2: demands not yet signed/assigned (no Source chosen, no candidate
 * mapped, or mapped but not yet confirmed) — excludes No Replace, which
 * deliberately never gets a candidate. Due at the fulfillment deadline
 * (Due Date Sign Contract / Assigned). */
export function demandsNeedingCandidate(demands: Demand[]): ActionItem[] {
  return demands
    .filter((d) => d.replacement_status !== "No Replace" && !d.fulfillment_confirmed_date)
    .map((d): ActionItem => {
      const target = demandTargetDate(d);
      const dueDate = fulfillmentDeadline(target, d.fs_status);
      return {
        id: d.id,
        noreg: d.outgoing_noreg || d.outgoing_label,
        nama: d.outgoing_nama || d.outgoing_label,
        dept: d.dept,
        kind: "candidate",
        label: "Cari & sign kandidat pengganti",
        dueDate,
        daysRemaining: sisaHari(dueDate),
        href: "/supply-demand",
      };
    })
    .filter((item) => withinActionWindow(item.dueDate))
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/** Stage 3: candidate already signed/assigned but the shop hasn't confirmed
 * receipt yet. Due at Arrival to Shop itself. */
export function demandsNeedingShopConfirm(demands: Demand[]): ActionItem[] {
  return demands
    .filter((d) => d.fulfillment_confirmed_date && !d.shop_confirmed_date)
    .map((d): ActionItem => {
      const dueDate = demandTargetDate(d);
      return {
        id: d.id,
        noreg: d.replacement_noreg,
        nama: d.replacement_nama || d.replacement_noreg,
        dept: d.dept,
        kind: "shop_confirm",
        label: "Konfirmasi kedatangan di shop",
        dueDate,
        daysRemaining: sisaHari(dueDate),
        href: "/supply-demand",
      };
    })
    .filter((item) => withinActionWindow(item.dueDate))
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export { subMonths };
