// Aggregation helpers for the Dashboard — pure functions over the raw
// stores, read-only per MTRACK_SPEC.md §5 / §11.
import { addMonths, addYears, differenceInYears, endOfMonth, endOfYear, format, parseISO, startOfMonth, subMonths } from "date-fns";
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

const MUTATION_FIELDS = ["division", "dept", "section"] as const;

export type ExitReason = "Kontrak Ended/Terminate" | "Pensiun" | "Resign" | "Tidak Diketahui";

/** New hire whose labor_type is B2 is a PKWT-overlap hire (temp double-cover
 * before the outgoing person actually leaves), not a straightforward
 * addition. */
export interface NewHireEntry {
  employee: EmployeeRecord;
  overlapping: boolean;
}

export interface ExitEntry {
  employee: EmployeeRecord;
  reason: ExitReason;
}

export interface MutationEntry {
  noreg: string;
  nama: string;
  before: EmployeeRecord;
  after: EmployeeRecord;
  changedFields: (typeof MUTATION_FIELDS)[number][];
}

export interface PositionChangeEntry {
  noreg: string;
  nama: string;
  before: string;
  after: string;
}

export interface EmployeeDiff {
  newHires: NewHireEntry[];
  exits: ExitEntry[];
  mutations: MutationEntry[];
  positionChanges: PositionChangeEntry[];
}

/** Best-effort "why did this person leave the roster" classification,
 * cross-referencing the data HR/Enrollment already tracks. Only as reliable
 * as Enrollment Monitoring is kept current — an exit with no matching
 * review/demand falls back to "Tidak Diketahui" rather than guessing. */
function classifyExitReason(noreg: string, reviews: PkwtReview[], demands: Demand[]): ExitReason {
  if (reviews.some((r) => r.noreg === noreg && r.review_result === "Terminate")) return "Kontrak Ended/Terminate";
  if (demands.some((d) => d.outgoing_noreg === noreg && d.origin_type === "Pension")) return "Pensiun";
  if (demands.some((d) => d.outgoing_noreg === noreg && d.origin_type === "Resign")) return "Resign";
  return "Tidak Diketahui";
}

/** Month-to-month roster diff by noreg:
 * - New: in `after` only — tagged "PKWT Overlapping" if labor_type is B2.
 * - Exit: in `before` only — tagged with a best-effort reason (see
 *   classifyExitReason).
 * - Mutation: same noreg, division/dept/section changed (org placement /
 *   Rotasi-Mutasi proper). Contract-stage progression (Kontrak 1.1 -> 1.2 ->
 *   2) is intentionally excluded — that's a scheduled milestone, not a move.
 * - Position Change: same noreg, posisi_struktural (ZPAR "Posisi
 *   (Struktural)" column) changed — tracked separately from org placement.
 * Labor type transitions (B2/B3/B4 etc.) are analyzed in the Komposisi by
 * Labor Type section instead, not here.
 * `org`, when given, scopes both rosters to the dashboard's Directorate/
 * Divisi/Dept filter before diffing — so someone who mutated out of the
 * filtered scope reads as an exit, and someone who mutated in reads as a
 * new hire, matching what "movement within this division" should mean. */
export function diffEmployees(
  before: EmployeeRecord[],
  after: EmployeeRecord[],
  reviews: PkwtReview[],
  demands: Demand[],
  org?: OrgFilter
): EmployeeDiff {
  const scopedBefore = org ? filterEmployees(before, org) : before;
  const scopedAfter = org ? filterEmployees(after, org) : after;
  const beforeByNoreg = new Map(scopedBefore.filter((e) => e.noreg).map((e) => [e.noreg, e]));
  const afterByNoreg = new Map(scopedAfter.filter((e) => e.noreg).map((e) => [e.noreg, e]));

  const newHires: NewHireEntry[] = scopedAfter
    .filter((e) => e.noreg && !beforeByNoreg.has(e.noreg))
    .map((employee) => ({ employee, overlapping: employee.labor_type === "B2" }));

  const exits: ExitEntry[] = scopedBefore
    .filter((e) => e.noreg && !afterByNoreg.has(e.noreg))
    .map((employee) => ({ employee, reason: classifyExitReason(employee.noreg, reviews, demands) }));

  const mutations: MutationEntry[] = [];
  const positionChanges: PositionChangeEntry[] = [];
  for (const [noreg, a] of afterByNoreg) {
    const b = beforeByNoreg.get(noreg);
    if (!b) continue;
    const changedFields = MUTATION_FIELDS.filter((f) => a[f] !== b[f]);
    if (changedFields.length > 0) {
      mutations.push({ noreg, nama: a.nama, before: b, after: a, changedFields });
    }
    if (a.posisi_struktural !== b.posisi_struktural) {
      positionChanges.push({ noreg, nama: a.nama, before: b.posisi_struktural, after: a.posisi_struktural });
    }
  }
  return { newHires, exits, mutations, positionChanges };
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

/** Same Permanen vs "everything else = Kontrak" partition
 * manpowerMovementByFiscalYear uses, exposed standalone so callers other
 * than the FY chart (e.g. the Manpower Movement "Lihat Perubahan" diff) can
 * scope a roster snapshot to the same Labor Type/Status selection. */
export function filterByLaborTypeStatus(
  employees: EmployeeRecord[],
  laborTypes: string[],
  statuses: MovementStatus[]
): EmployeeRecord[] {
  const scopeStatuses = statuses.length ? statuses : (["Permanen", "Kontrak", "Vokasi"] as MovementStatus[]);
  return employees.filter((e) => {
    if (laborTypes.length > 0 && !laborTypes.includes(e.labor_type)) return false;
    return scopeStatuses.includes(e.status_kontrak === "Permanen" ? "Permanen" : "Kontrak");
  });
}

// ---------------------------------------------------------------------------
// Labor Type Movement — one bar per FY month (Apr-Mar, same window as
// Manpower Movement) stacked by every ZPAR labor_type code, plus a
// month-over-month detail split into "New In" (brand-new hires landing on a
// code) and "Retagging" (an existing employee's code itself changed, e.g.
// A → B2) so the section reads as movement, not just a snapshot composition.
// ---------------------------------------------------------------------------

export type LaborTypeRow = { key: string } & Record<string, number | string>;

/** One row per FY month, each ZPAR labor_type code as its own stacked key
 * (A, B1-4, C1-2, D, E1-2, T, F) — sourced from the snapshot whose `period`
 * matches that month, same as manpowerMovementByFiscalYear. */
export function laborTypeMovementByFiscalYear(
  snapshotsByPeriod: Map<string, EmployeeRecord[]>,
  org: OrgFilter = { directorates: [], divisions: [], depts: [] },
  refDate: Date = new Date()
): LaborTypeRow[] {
  return fiscalYearMonths(refDate).map((month) => {
    const scoped = filterEmployees(snapshotsByPeriod.get(month) ?? [], org);
    const row: LaborTypeRow = { key: format(new Date(`${month}-01T00:00:00`), "MMM yy") };
    for (const e of scoped) {
      const code = e.labor_type.trim();
      if (!code) continue;
      row[code] = (Number(row[code]) || 0) + 1;
    }
    return row;
  });
}

export interface LaborTypeMovementPerson {
  noreg: string;
  nama: string;
  division: string;
  dept: string;
}

/** Genuinely new to the roster (noreg absent from `before` entirely) who
 * landed with this labor_type code — i.e. new hires, not a re-tag of an
 * existing employee. */
export interface LaborTypeNewInEntry {
  laborType: string;
  count: number;
  people: LaborTypeMovementPerson[];
}

/** An existing employee (noreg present in both months) whose labor_type
 * code itself changed — e.g. "A → B2". */
export interface LaborTypeTransitionEntry {
  from: string;
  to: string;
  count: number;
  people: LaborTypeMovementPerson[];
}

export interface LaborTypeMovementDetail {
  newIn: LaborTypeNewInEntry[];
  retagging: LaborTypeTransitionEntry[];
}

/** Month-to-month labor_type diff by noreg, split into the two things that
 * can change a bar's composition: brand-new hires landing directly on a
 * code ("New In"), and existing employees whose code itself was changed
 * ("Retagging", e.g. A → B2). Both are collapsed into per-group tallies
 * (sorted by count desc) instead of a flat per-person list, so a month with
 * many labor types stays a short, scannable summary rather than an N×N
 * matrix — the full person list for one specific retagging pair is still
 * available via that entry's `people`. */
export function laborTypeMovementDetail(before: EmployeeRecord[], after: EmployeeRecord[], org?: OrgFilter): LaborTypeMovementDetail {
  const scopedBefore = org ? filterEmployees(before, org) : before;
  const scopedAfter = org ? filterEmployees(after, org) : after;
  const beforeByNoreg = new Map(scopedBefore.filter((e) => e.noreg).map((e) => [e.noreg, e]));

  const newInByCode = new Map<string, LaborTypeMovementPerson[]>();
  const retaggingByPair = new Map<string, { from: string; to: string; people: LaborTypeMovementPerson[] }>();

  for (const a of scopedAfter) {
    if (!a.noreg || !a.labor_type) continue;
    const person: LaborTypeMovementPerson = { noreg: a.noreg, nama: a.nama, division: a.division, dept: a.dept };
    const b = beforeByNoreg.get(a.noreg);
    if (!b) {
      (newInByCode.get(a.labor_type) ?? newInByCode.set(a.labor_type, []).get(a.labor_type)!).push(person);
    } else if (b.labor_type && b.labor_type !== a.labor_type) {
      const key = `${b.labor_type}→${a.labor_type}`;
      const entry = retaggingByPair.get(key) ?? { from: b.labor_type, to: a.labor_type, people: [] };
      entry.people.push(person);
      retaggingByPair.set(key, entry);
    }
  }

  const newIn = Array.from(newInByCode.entries())
    .map(([laborType, people]) => ({ laborType, count: people.length, people }))
    .sort((a, b) => b.count - a.count);
  const retagging = Array.from(retaggingByPair.values())
    .map((e) => ({ ...e, count: e.people.length }))
    .sort((a, b) => b.count - a.count);
  return { newIn, retagging };
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

// ---------------------------------------------------------------------------
// Age Movement — forecast of the active roster's age composition at 7
// yearly checkpoints (now, end of this year, then end of each of the next 5
// years), assuming nobody is replaced. Retirement is effective the 1st of
// the month after the 55th birthday, and only applies to Permanen MP — once
// that date passes, a Permanen employee drops out of the active buckets
// entirely (tracked separately as a cumulative "Pensiun" count instead), so
// the total active figure at each checkpoint already IS "what headcount
// becomes if nobody retiring gets backfilled". Non-Permanen MP
// (Kontrak/AKTI) have no retirement concept here — their departure is via
// contract non-renewal, not age, so they just keep aging through the
// buckets (the last bucket, "55", covers 55-and-up for them).
// ---------------------------------------------------------------------------

export type AgeBucket = "<20" | "21-30" | "31-40" | "41-50" | "51-54" | "55";
export const AGE_BUCKETS: AgeBucket[] = ["<20", "21-30", "31-40", "41-50", "51-54", "55"];

function ageBucketOf(age: number): AgeBucket {
  if (age <= 20) return "<20";
  if (age <= 30) return "21-30";
  if (age <= 40) return "31-40";
  if (age <= 50) return "41-50";
  if (age <= 54) return "51-54";
  return "55";
}

/** Retirement is effective the 1st of the month *after* the 55th birthday —
 * e.g. born 9 March means turning 55 lands on 9 March, so retirement is 1
 * April of that year, regardless of which day of the month the birthday
 * itself falls on. */
function retirementEffectiveDate(tglLahirIso: string): Date {
  const turns55 = addYears(parseISO(tglLahirIso), 55);
  return startOfMonth(addMonths(turns55, 1));
}

export interface RetireeEntry {
  noreg: string;
  nama: string;
  division: string;
  dept: string;
  /** Short month name (Jan..Dec) retirement takes effect — the year is
   * implied by which checkpoint this entry lives under. */
  bulanPensiun: string;
}

export interface AgeMovementCheckpoint {
  key: string; // "Saat Ini" | "Akhir 2026" | "Akhir 2027" | ...
  asOfDate: string; // yyyy-MM-dd
  buckets: Record<AgeBucket, number>;
  totalActive: number;
  pensiunKumulatif: number;
  /** Newly crossed into >55 (Permanen only) since the previous checkpoint —
   * i.e. who retires *that year*. Empty for the first checkpoint, which has
   * no "previous" to diff against. */
  baruPensiun: RetireeEntry[];
}

/** `today` is injectable for tests/determinism; defaults to the real
 * current date since this is meant to always read as "as of right now". */
export function ageMovementForecast(employees: EmployeeRecord[], today: Date = new Date()): AgeMovementCheckpoint[] {
  const thisYear = today.getFullYear();
  const checkpoints = [
    { key: "Saat Ini", date: today },
    { key: `Akhir ${thisYear}`, date: endOfYear(today) },
    ...Array.from({ length: 5 }, (_, i) => ({
      key: `Akhir ${thisYear + i + 1}`,
      date: endOfYear(addYears(today, i + 1)),
    })),
  ];

  let prevRetired = new Set<string>();
  const result: AgeMovementCheckpoint[] = [];
  for (const { key, date } of checkpoints) {
    const buckets: Record<AgeBucket, number> = { "<20": 0, "21-30": 0, "31-40": 0, "41-50": 0, "51-54": 0, "55": 0 };
    const retiredNow = new Set<string>();
    const baruPensiun: RetireeEntry[] = [];
    for (const e of employees) {
      if (!e.tgl_lahir || !e.noreg) continue;
      const retirementDate = e.status_kontrak === "Permanen" ? retirementEffectiveDate(e.tgl_lahir) : null;
      const isRetired = retirementDate !== null && date >= retirementDate;
      if (isRetired) {
        retiredNow.add(e.noreg);
        if (!prevRetired.has(e.noreg)) {
          baruPensiun.push({
            noreg: e.noreg,
            nama: e.nama,
            division: e.division,
            dept: e.dept,
            bulanPensiun: format(retirementDate!, "MMM"),
          });
        }
      } else {
        const age = differenceInYears(date, parseISO(e.tgl_lahir));
        buckets[ageBucketOf(age)]++;
      }
    }
    const totalActive = Object.values(buckets).reduce((a, b) => a + b, 0);
    result.push({ key, asOfDate: format(date, "yyyy-MM-dd"), buckets, totalActive, pensiunKumulatif: retiredNow.size, baruPensiun });
    prevRetired = retiredNow;
  }
  return result;
}
