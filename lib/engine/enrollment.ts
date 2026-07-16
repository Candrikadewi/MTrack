// Aggregation & filtering helpers specific to Enrollment Monitoring (§6) and
// Supply-Demand.
import { pkwtReviewStore } from "../repo";
import type { Demand } from "../types";

/** Supply-Demand: "tanggal pemenuhan" — the target date the replacement must
 * be active/present. `fulfill_date` is the shop-arrival date for Project/Takt
 * Up (and once set, for any origin); falls back to `tgl_ended_outgoing` (the
 * PKWT review date / Vokasi ended date) for PKWT Terminate / Vokasi Ended. */
export function demandTargetDate(d: Demand): string {
  return d.fulfill_date || d.tgl_ended_outgoing || "";
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
