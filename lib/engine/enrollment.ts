// Aggregation & filtering helpers specific to Enrollment Monitoring (§6).
import { format } from "date-fns";
import { pkwtReviewStore } from "../repo";
import type { Demand, DemandCategory } from "../types";

export function relevantDate(d: Demand): string {
  return d.tgl_ended_outgoing || d.fulfill_date || "";
}

export function relevantMonth(d: Demand): string {
  return relevantDate(d).slice(0, 7);
}

export function demandsForTabAndMonth(demands: Demand[], category: DemandCategory, month: string): Demand[] {
  return demands.filter((d) => d.category === category && relevantMonth(d) === month);
}

export interface EnrollmentSummary {
  total: number;
  fulfilled: number;
  percent: number;
  byDate: { date: string; total: number; fulfilled: number }[];
  takt: { total: number; fulfilled: number };
  project: { total: number; fulfilled: number };
}

export function computeEnrollmentSummary(monthDemands: Demand[]): EnrollmentSummary {
  const personBased = monthDemands.filter((d) => d.origin_type !== "Project" && d.origin_type !== "TaktUp");
  const taktDemands = monthDemands.filter((d) => d.origin_type === "TaktUp");
  const projectDemands = monthDemands.filter((d) => d.origin_type === "Project");

  const byDateMap = new Map<string, { total: number; fulfilled: number }>();
  for (const d of personBased) {
    const date = relevantDate(d) || "—";
    const entry = byDateMap.get(date) ?? { total: 0, fulfilled: 0 };
    entry.total++;
    if (d.status === "Fulfilled") entry.fulfilled++;
    byDateMap.set(date, entry);
  }

  return {
    total: monthDemands.length,
    fulfilled: monthDemands.filter((d) => d.status === "Fulfilled").length,
    percent: monthDemands.length
      ? (monthDemands.filter((d) => d.status === "Fulfilled").length / monthDemands.length) * 100
      : 0,
    byDate: Array.from(byDateMap.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    takt: { total: taktDemands.length, fulfilled: taktDemands.filter((d) => d.status === "Fulfilled").length },
    project: {
      total: projectDemands.length,
      fulfilled: projectDemands.filter((d) => d.status === "Fulfilled").length,
    },
  };
}

export function demandStatusLabel(d: Demand): string {
  if (d.origin_type === "PkwtTerminate") {
    const review = pkwtReviewStore.get(d.origin_ref);
    if (review) return review.status_kontrak;
  }
  const labels: Record<string, string> = {
    Project: "Project",
    TaktUp: "Takt Up",
    Resign: "Resign",
    Pension: "Pensiun",
    GST: "GST",
    Unfit: "Unfit",
    Manual: "Manual",
    VokasiEnded: "Vokasi Ended",
  };
  return labels[d.origin_type] ?? d.origin_type;
}

export function monthLabel(month: string): string {
  if (!month) return "-";
  return format(new Date(`${month}-01T00:00:00`), "MMMM yyyy");
}
