// Aggregation & filtering helpers specific to Enrollment Monitoring (§6) and
// Supply-Demand.
import { format, parseISO, subBusinessDays } from "date-fns";
import { pkwtReviewStore } from "../repo";
import { fulfillmentDeadline, supplyDemandStatus, type SupplyStatus } from "./compute";
import type { Demand, DemandCategory, UtilPoolEntry } from "../types";

/** Supply-Demand: "Arrival to Shop" — the target date the replacement must
 * be active/present. `fulfill_date` is the shop-arrival date once explicitly
 * set (for any origin, and always for Project/Takt Up). Before that, both
 * Vokasi Ended and PKWT Terminate (regular enrollment, not a manual/
 * additional demand) default to 2 weeks (10 hari kerja) before the outgoing
 * person's actual end date, so there's runway to onboard/train the
 * replacement before the seat is vacated — matching the shop-training
 * overlap the real handover needs. */
export function demandTargetDate(d: Demand): string {
  if (d.fulfill_date) return d.fulfill_date;
  if ((d.origin_type === "VokasiEnded" || d.origin_type === "PkwtTerminate") && d.tgl_ended_outgoing) {
    return format(subBusinessDays(parseISO(d.tgl_ended_outgoing), 10), "yyyy-MM-dd");
  }
  return d.tgl_ended_outgoing || "";
}

/** Supply-Demand: the category a demand should actually be tracked/tabbed
 * under. Normally this matches its origin category, but picking "Vokasi New
 * Hire" as the Source on a PKWT-origin demand means the vacancy is being
 * backfilled from the Vokasi pipeline instead — the demand belongs on the
 * Vokasi tab from that point on, even though it originated from a PKWT
 * termination. One-directional only: there's no "PKWT New Hire" source on
 * the Vokasi tab, so a Vokasi-origin demand never moves the other way. */
export function effectiveDemandCategory(d: Demand): DemandCategory {
  return d.replacement_status === "Vokasi New Hire" ? "Vokasi" : d.category;
}

/** Supply-Demand page's granular status column — see supplyDemandStatus. */
export function demandGranularStatus(d: Demand): SupplyStatus {
  const target = demandTargetDate(d);
  const deadline = fulfillmentDeadline(target, d.fs_status);
  return supplyDemandStatus(target, deadline, d.shop_confirmed_date);
}

export function demandStatusLabel(d: Demand): string {
  if (d.origin_type === "PkwtTerminate") {
    const review = pkwtReviewStore.get(d.origin_ref);
    return review ? review.status_kontrak : "PKWT Terminate";
  }
  const labels: Record<string, string> = {
    Project: "Project",
    TaktUp: "Takt Up",
    Resign: "Resign",
    Pension: "Pensiun",
    GST: "GST",
    Unfit: "Unfit",
    Others: d.origin_label || "Others",
    Manual: "Manual",
    VokasiEnded: "Vokasi Ended",
  };
  return labels[d.origin_type] ?? d.origin_type;
}

/** Generic cascading div/dept filter for any {div,dept}-shaped array (reviews use div/dept, demands use div/dept too). */
export function divisionsOfRows(rows: { div: string }[]): string[] {
  return Array.from(new Set(rows.map((r) => r.div).filter(Boolean))).sort();
}

export function deptsOfRows(rows: { div: string; dept: string }[], selectedDivisions: string[]): string[] {
  const scoped = selectedDivisions.length ? rows.filter((r) => selectedDivisions.includes(r.div)) : rows;
  return Array.from(new Set(scoped.map((r) => r.dept).filter(Boolean))).sort();
}

export function filterByDivDept<T extends { div: string; dept: string }>(
  rows: T[],
  divisions: string[],
  depts: string[]
): T[] {
  return rows.filter(
    (r) => (divisions.length === 0 || divisions.includes(r.div)) && (depts.length === 0 || depts.includes(r.dept))
  );
}

/** Ranks a Util Pool entry against a demand it might fill: same department
 * AND matching MP status first (the strongest "utilize this before hiring"
 * signal), then same department, then matching status, then everything
 * else. Lower is better/first. Same department is weighted above matching
 * status because a same-shop excess MP is the concrete org policy this
 * implements ("MP excess yang same shop dulu") — PAD/admin's check is
 * specifically about catching a shop's own unsurfaced excess. */
function poolMatchRank(entry: UtilPoolEntry, demand: Demand): number {
  const deptMatch = entry.prev_dept === demand.dept;
  const statusMatch = entry.type === demand.category;
  if (deptMatch && statusMatch) return 0;
  if (deptMatch) return 1;
  if (statusMatch) return 2;
  return 3;
}

/** Open Util Pool entries eligible to fill a demand (plus whichever entry
 * is already assigned to it, so an in-progress selection doesn't vanish
 * mid-edit), ranked by poolMatchRank so the best-matching, same-shop
 * candidates surface first — this is the "MP Excess muncul sebagai
 * rekomendasi 1st" ordering for both the Source recommendation banner and
 * the candidate picker on the Demand Pool page. */
export function eligiblePoolEntriesForDemand(poolEntries: UtilPoolEntry[], demand: Demand): UtilPoolEntry[] {
  return poolEntries
    .filter((e) => e.status === "Open" || e.noreg === demand.replacement_noreg)
    .sort((a, b) => poolMatchRank(a, demand) - poolMatchRank(b, demand));
}
