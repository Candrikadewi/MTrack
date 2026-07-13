// Aggregation helpers for the Dashboard — pure functions over the raw
// stores, read-only per MTRACK_SPEC.md §5 / §11.
import { addMonths, format, subMonths } from "date-fns";
import { computeVokasiStatus } from "./compute";
import type { Demand, EmployeeRecord, PkwtReview, VokasiRecord } from "../types";

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

export interface CompositionRow {
  key: string;
  permanen: number;
  kontrak: number;
  vokasi: number;
  laki: number;
  perempuan: number;
}

function isVokasiActive(v: VokasiRecord, fulfilledIds: Set<string>): boolean {
  const status = computeVokasiStatus(v.tgl_ended, fulfilledIds.has(v.id));
  return status !== "Ended";
}

export function compositionByDivision(
  employees: EmployeeRecord[],
  vokasi: VokasiRecord[],
  fulfilledVokasiIds: Set<string>,
  directorat: string
): CompositionRow[] {
  const divisions = divisionsOf(employees, directorat);
  return divisions.map((division) => {
    const empRows = employees.filter((e) => e.division === division);
    const vokasiRows = vokasi.filter((v) => v.div === division && isVokasiActive(v, fulfilledVokasiIds));
    const permanen = empRows.filter((e) => e.status_kontrak === "Permanen").length;
    const kontrak = empRows.length - permanen;
    return {
      key: division,
      permanen,
      kontrak,
      vokasi: vokasiRows.length,
      laki: empRows.filter((e) => e.gender === "L").length + vokasiRows.filter((v) => v.gender === "L").length,
      perempuan: empRows.filter((e) => e.gender === "P").length + vokasiRows.filter((v) => v.gender === "P").length,
    };
  });
}

export function compositionByDept(
  employees: EmployeeRecord[],
  vokasi: VokasiRecord[],
  fulfilledVokasiIds: Set<string>,
  division: string
): CompositionRow[] {
  const depts = deptsOf(employees, division);
  return depts.map((dept) => {
    const empRows = employees.filter((e) => e.dept === dept);
    const vokasiRows = vokasi.filter((v) => v.dept === dept && isVokasiActive(v, fulfilledVokasiIds));
    const permanen = empRows.filter((e) => e.status_kontrak === "Permanen").length;
    const kontrak = empRows.length - permanen;
    return {
      key: dept,
      permanen,
      kontrak,
      vokasi: vokasiRows.length,
      laki: empRows.filter((e) => e.gender === "L").length + vokasiRows.filter((v) => v.gender === "L").length,
      perempuan: empRows.filter((e) => e.gender === "P").length + vokasiRows.filter((v) => v.gender === "P").length,
    };
  });
}

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

export function pkwtEnrollmentStats(reviews: PkwtReview[], demands: Demand[]) {
  const cm = currentMonthKey();
  const reviewsThisMonth = reviews.filter((r) => r.tgl_review.slice(0, 7) === cm);
  const terminated = reviews.filter((r) => r.review_result === "Terminate");
  const terminatedDemandIds = new Set(terminated.map((r) => r.demand_id).filter(Boolean));
  const terminatedDemands = demands.filter((d) => terminatedDemandIds.has(d.id));
  const fulfilled = terminatedDemands.filter((d) => d.status === "Fulfilled").length;
  return {
    reviewsThisMonth: reviewsThisMonth.length,
    terminatedCount: terminated.length,
    fulfilled,
    percent: terminatedDemands.length ? (fulfilled / terminatedDemands.length) * 100 : 0,
  };
}

export function vokasiEnrollmentStats(vokasi: VokasiRecord[], demands: Demand[]) {
  const cm = currentMonthKey();
  const endedThisMonth = vokasi.filter((v) => v.tgl_ended?.slice(0, 7) === cm);
  const endedDemands = demands.filter(
    (d) => d.category === "Vokasi" && d.origin_type === "VokasiEnded" && d.tgl_ended_outgoing.slice(0, 7) === cm
  );
  const fulfilled = endedDemands.filter((d) => d.status === "Fulfilled").length;
  return {
    endedThisMonth: endedThisMonth.length,
    fulfilled,
    percent: endedDemands.length ? (fulfilled / endedDemands.length) * 100 : 0,
  };
}

export { subMonths };
