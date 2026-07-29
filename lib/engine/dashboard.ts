// Aggregation helpers for the Dashboard — pure functions over the raw
// stores, read-only per MTRACK_SPEC.md §5 / §11.
import { addMonths, endOfMonth, format, parseISO, subMonths } from "date-fns";
import { demandVisibleDate, fulfillmentDeadline, reviewFillDeadline, reviewReminderDate, sisaHari } from "./compute";
import { demandTargetDate, effectiveDemandCategory } from "./enrollment";
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

/** Walks back from `month` (exclusive) looking for the nearest earlier
 * calendar month that has a ZPAR snapshot, up to 24 months — the "what
 * changed this month" comparison always wants the last month WITH data, not
 * necessarily the literal previous calendar month if a period was skipped. */
export function previousPeriodWithData(month: string, snapshotsByPeriod: Map<string, EmployeeRecord[]>): string | null {
  let cursor = subMonths(new Date(`${month}-01T00:00:00`), 1);
  for (let i = 0; i < 24; i++) {
    const key = format(cursor, "yyyy-MM");
    if (snapshotsByPeriod.has(key)) return key;
    cursor = subMonths(cursor, 1);
  }
  return null;
}

const MOVE_COMPARE_FIELDS = ["division", "dept", "status_kontrak", "posisi_struktural"] as const;

export interface EmployeeMoveEntry {
  noreg: string;
  nama: string;
  before: EmployeeRecord;
  after: EmployeeRecord;
  changedFields: (typeof MOVE_COMPARE_FIELDS)[number][];
}

export interface EmployeeDiff {
  newHires: EmployeeRecord[];
  left: EmployeeRecord[];
  moved: EmployeeMoveEntry[];
}

/** Month-to-month roster diff by noreg — New (in `after` only), Left (in
 * `before` only), Moved (same noreg, division/dept/status_kontrak/
 * posisi_struktural changed). Surfaces exactly the rotation/mutation/
 * addition/reduction that makes ZPAR change every month. */
export function diffEmployees(before: EmployeeRecord[], after: EmployeeRecord[]): EmployeeDiff {
  const beforeByNoreg = new Map(before.filter((e) => e.noreg).map((e) => [e.noreg, e]));
  const afterByNoreg = new Map(after.filter((e) => e.noreg).map((e) => [e.noreg, e]));

  const newHires = after.filter((e) => e.noreg && !beforeByNoreg.has(e.noreg));
  const left = before.filter((e) => e.noreg && !afterByNoreg.has(e.noreg));

  const moved: EmployeeMoveEntry[] = [];
  for (const [noreg, a] of afterByNoreg) {
    const b = beforeByNoreg.get(noreg);
    if (!b) continue;
    const changedFields = MOVE_COMPARE_FIELDS.filter((f) => a[f] !== b[f]);
    if (changedFields.length > 0) moved.push({ noreg, nama: a.nama, before: b, after: a, changedFields });
  }
  return { newHires, left, moved };
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
// Action Needed (Dashboard) — one row per (stage, category), each listing
// every month-batch that's currently visible and still has a gap (done <
// total), so a backlog spanning several months never gets hidden behind a
// single "most urgent" pick. See MTRACK_SPEC.md §12 lead-time chain.
// ---------------------------------------------------------------------------

export type ActionKind = "review" | "candidate" | "shop_confirm";

/** One month's worth of progress for a given stage — e.g. "89 PKWT reviews
 * due in September, 5 filled so far, next deadline is overdue by 2 days". */
export interface ActionBatch {
  month: string; // "yyyy-MM"
  monthLabel: string; // "September"
  done: number;
  total: number;
  dueDate: string; // most urgent remaining item's due date in this batch
  daysRemaining: number;
  href: string;
}

function monthLabelOf(month: string): string {
  return format(parseISO(`${month}-01`), "MMMM");
}

function mostUrgent<T>(items: T[], dueDateOf: (item: T) => string): string {
  return items.reduce((soonestDue, item) => {
    const due = dueDateOf(item);
    return sisaHari(due) < sisaHari(soonestDue) ? due : soonestDue;
  }, dueDateOf(items[0]));
}

/** Stage 1: PKWT reviews not yet filled (Continue/Terminate), grouped by
 * tgl_review's month — only months where at least one unfilled review's
 * reminder window has already opened (tgl_review - 40 hari kerja). */
export function reviewBatchesNeedingAction(reviews: PkwtReview[]): ActionBatch[] {
  const byMonth = new Map<string, PkwtReview[]>();
  for (const r of reviews) {
    if (!r.tgl_review) continue;
    const month = r.tgl_review.slice(0, 7);
    (byMonth.get(month) ?? byMonth.set(month, []).get(month)!).push(r);
  }
  const batches: ActionBatch[] = [];
  for (const [month, group] of byMonth) {
    const total = group.length;
    const done = group.filter((r) => r.review_result !== "").length;
    if (done >= total) continue;
    const visibleRemaining = group.filter((r) => r.review_result === "" && sisaHari(reviewReminderDate(r.tgl_review)) <= 0);
    if (visibleRemaining.length === 0) continue;
    const dueDate = mostUrgent(visibleRemaining, (r) => reviewFillDeadline(r.tgl_review));
    batches.push({ month, monthLabel: monthLabelOf(month), done, total, dueDate, daysRemaining: sisaHari(dueDate), href: "/enrollment" });
  }
  return batches.sort((a, b) => a.month.localeCompare(b.month));
}

/** Stage 2: demands (of the given category) not yet signed/assigned — no
 * Source chosen, no candidate mapped, or mapped but not yet confirmed.
 * Excludes No Replace, which deliberately never gets a candidate. Grouped
 * by Demand Pool month (demandVisibleDate of Arrival to Shop); only months
 * already visible in the Demand Pool are included. */
export function candidateBatchesNeedingAction(demands: Demand[], category: DemandCategory): ActionBatch[] {
  const byMonth = new Map<string, Demand[]>();
  for (const d of demands) {
    if (effectiveDemandCategory(d) !== category || d.replacement_status === "No Replace") continue;
    const visible = demandVisibleDate(demandTargetDate(d));
    if (!visible) continue;
    const month = visible.slice(0, 7);
    (byMonth.get(month) ?? byMonth.set(month, []).get(month)!).push(d);
  }
  const batches: ActionBatch[] = [];
  for (const [month, group] of byMonth) {
    const total = group.length;
    const done = group.filter((d) => d.fulfillment_confirmed_date).length;
    if (done >= total) continue;
    const visibleRemaining = group.filter(
      (d) => !d.fulfillment_confirmed_date && sisaHari(demandVisibleDate(demandTargetDate(d))) <= 0
    );
    if (visibleRemaining.length === 0) continue;
    const dueDate = mostUrgent(visibleRemaining, (d) => fulfillmentDeadline(demandTargetDate(d), d.fs_status));
    batches.push({ month, monthLabel: monthLabelOf(month), done, total, dueDate, daysRemaining: sisaHari(dueDate), href: "/supply-demand" });
  }
  return batches.sort((a, b) => a.month.localeCompare(b.month));
}

/** Stage 3: demands (of the given category) already signed/assigned but the
 * shop hasn't confirmed receipt yet. Grouped by Arrival to Shop's month —
 * always "visible" once signed, so no extra visibility gate needed. */
export function shopConfirmBatchesNeedingAction(demands: Demand[], category: DemandCategory): ActionBatch[] {
  const byMonth = new Map<string, Demand[]>();
  for (const d of demands) {
    if (effectiveDemandCategory(d) !== category || !d.fulfillment_confirmed_date) continue;
    const target = demandTargetDate(d);
    if (!target) continue;
    const month = target.slice(0, 7);
    (byMonth.get(month) ?? byMonth.set(month, []).get(month)!).push(d);
  }
  const batches: ActionBatch[] = [];
  for (const [month, group] of byMonth) {
    const total = group.length;
    const done = group.filter((d) => d.shop_confirmed_date).length;
    if (done >= total) continue;
    const remaining = group.filter((d) => !d.shop_confirmed_date);
    const dueDate = mostUrgent(remaining, (d) => demandTargetDate(d));
    batches.push({ month, monthLabel: monthLabelOf(month), done, total, dueDate, daysRemaining: sisaHari(dueDate), href: "/supply-demand" });
  }
  return batches.sort((a, b) => a.month.localeCompare(b.month));
}

export { subMonths };
