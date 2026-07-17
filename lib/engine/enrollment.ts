// Aggregation & filtering helpers specific to Enrollment Monitoring (§6) and
// Supply-Demand.
import { format, parseISO, subDays } from "date-fns";
import { pkwtReviewStore } from "../repo";
import { fulfillmentDeadline, supplyDemandStatus, type SupplyStatus } from "./compute";
import type { Demand, DemandCategory } from "../types";

/** Supply-Demand: "Arrival to Shop" — the target date the replacement must
 * be active/present. `fulfill_date` is the shop-arrival date once explicitly
 * set (for any origin, and always for Project/Takt Up). Before that:
 * - Vokasi Ended (regular enrollment, not a manual/additional demand)
 *   defaults to 2 weeks before the outgoing person's vokasi-ended date, so
 *   there's runway to onboard the replacement before the seat is vacated.
 * - PKWT Terminate falls back to the review date itself. */
export function demandTargetDate(d: Demand): string {
  if (d.fulfill_date) return d.fulfill_date;
  if (d.origin_type === "VokasiEnded" && d.tgl_ended_outgoing) {
    return format(subDays(parseISO(d.tgl_ended_outgoing), 14), "yyyy-MM-dd");
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
