// Aggregation helpers for the Dashboard — pure functions over the raw
// stores, read-only per MTRACK_SPEC.md §5 / §11.
import { addMonths, endOfMonth, format, subMonths } from "date-fns";
import type { Demand, DemandOriginType, EmployeeRecord, PkwtReview, VokasiRecord } from "../types";

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

/** Movement per FY month, sourced from the ZPAR snapshot whose `period` matches
 * that month (0 if no snapshot uploaded for it) + Vokasi active as of month-end. */
export function manpowerMovementByFiscalYear(
  snapshotsByPeriod: Map<string, EmployeeRecord[]>,
  vokasi: VokasiRecord[],
  refDate: Date = new Date()
): CompositionRow[] {
  return fiscalYearMonths(refDate).map((month) => {
    const employees = snapshotsByPeriod.get(month) ?? [];
    const permanenRows = employees.filter((e) => e.status_kontrak === "Permanen");
    const kontrakRows = employees.filter((e) => e.status_kontrak !== "Permanen");
    const monthEnd = format(endOfMonth(new Date(`${month}-01T00:00:00`)), "yyyy-MM-dd");
    const vokasiRows = vokasi.filter((v) => isVokasiActiveAsOf(v, monthEnd));
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
 * separate stacked keys within the same bar. Unrecognized codes bucket as "Other". */
export function laborTypeComposition(employees: EmployeeRecord[]): LaborTypeRow[] {
  const counts = new Map<string, number>();
  for (const e of employees) {
    const code = e.labor_type.trim();
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const known = new Set(LABOR_TYPE_GROUPS.flatMap((g) => g.codes));
  const rows: LaborTypeRow[] = LABOR_TYPE_GROUPS.map((g) => {
    const row: LaborTypeRow = { key: g.base };
    for (const code of g.codes) {
      const c = counts.get(code) ?? 0;
      if (c > 0) row[code] = c;
    }
    return row;
  });
  const otherCount = Array.from(counts.entries())
    .filter(([code]) => !known.has(code))
    .reduce((sum, [, c]) => sum + c, 0);
  if (otherCount > 0) rows.push({ key: "Other", Other: otherCount });
  return rows;
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

export function monthBuckets<T>(
  items: T[],
  monthOf: (item: T) => string | undefined,
  monthsBefore = 3,
  monthsAfter = 5
): { buckets: MonthBucket[]; byMonth: Map<string, T[]> } {
  const now = new Date();
  const byMonth = new Map<string, T[]>();
  const months: string[] = [];
  for (let i = -monthsBefore; i <= monthsAfter; i++) {
    const m = format(addMonths(now, i), "yyyy-MM");
    months.push(m);
    byMonth.set(m, []);
  }
  for (const item of items) {
    const m = monthOf(item);
    if (m && byMonth.has(m)) byMonth.get(m)!.push(item);
  }
  const currentMonth = format(now, "yyyy-MM");
  const buckets = months.map((m) => ({
    month: m,
    label: format(new Date(`${m}-01T00:00:00`), "MMM yy"),
    value: byMonth.get(m)?.length ?? 0,
    isCurrent: m === currentMonth,
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

export interface ReplacementStats {
  currentMonthCount: number;
  needReplace: number;
  fulfilled: number;
  total: number;
  percent: number;
  composition: { key: string; count: number }[];
}

export function pkwtEnrollmentStats(reviews: PkwtReview[], demands: Demand[]): ReplacementStats {
  const cm = currentMonthKey();
  const reviewsThisMonth = reviews.filter((r) => r.tgl_review.slice(0, 7) === cm).length;
  const pkwtDemands = demands.filter((d) => d.category === "PKWT");
  const open = pkwtDemands.filter((d) => d.status === "Open");
  const fulfilled = pkwtDemands.length - open.length;
  return {
    currentMonthCount: reviewsThisMonth,
    needReplace: open.length,
    fulfilled,
    total: pkwtDemands.length,
    percent: pkwtDemands.length ? (fulfilled / pkwtDemands.length) * 100 : 0,
    composition: groupCountBy(open, demandOriginLabel),
  };
}

export function vokasiEnrollmentStats(vokasi: VokasiRecord[], demands: Demand[]): ReplacementStats {
  const cm = currentMonthKey();
  const endedThisMonth = vokasi.filter((v) => v.tgl_ended?.slice(0, 7) === cm).length;
  const vokasiDemands = demands.filter((d) => d.category === "Vokasi");
  const open = vokasiDemands.filter((d) => d.status === "Open");
  const fulfilled = vokasiDemands.length - open.length;
  return {
    currentMonthCount: endedThisMonth,
    needReplace: open.length,
    fulfilled,
    total: vokasiDemands.length,
    percent: vokasiDemands.length ? (fulfilled / vokasiDemands.length) * 100 : 0,
    composition: groupCountBy(open, demandOriginLabel),
  };
}

export { subMonths };
