// Small shared pieces of the Demand page: source options, labels, and what counts as done.
import { addMonths, format } from "date-fns";
import { currentMonthKey } from "@/lib/dates";
import { DEMAND_JENIS_LABEL as JENIS_LABEL } from "@/lib/engine/batches";
import type { Demand, DemandOriginType, EmploymentStatus, ReplacementStatus } from "@/lib/types";

export const POOL_SOURCES: ReplacementStatus[] = ["MP Excess", "MP Back Up"];

export const PKWT_SOURCE_OPTIONS: ReplacementStatus[] = [
  "PKWT New Hire",
  "Vokasi New Hire",
  "MP Excess",
  "MP Back Up",
  "No Replace",
];

export const VOKASI_SOURCE_OPTIONS: ReplacementStatus[] = ["Vokasi New Hire", "MP Excess", "MP Back Up", "No Replace"];

export const EMPLOYMENT_STATUS_LABEL: Record<EmploymentStatus, string> = {
  "": "Belum diisi",
  Kontrak: "Kontrak",
  Permanen: "Permanen",
  Vokasi: "Vokasi",
};

export function monthOptions(): string[] {
  const base = new Date(`${currentMonthKey()}-01T00:00:00`);
  return Array.from({ length: 13 }, (_, i) => format(addMonths(base, 6 - i), "yyyy-MM"));
}

/** Demands entered by hand rather than raised by a review, Vokasi batch,
 * project or takt case. */
export const MANUAL_ORIGINS: DemandOriginType[] = ["Resign", "Pension", "PensionDini", "GST", "Unfit", "Others", "Manual"];

/** The Jenis each Ringkasan per Batch tile stands for, to filter the detail
 * table down to it. */
export const TILE_JENIS: Record<string, string[]> = {
  project: [JENIS_LABEL.Project],
  taktup: [JENIS_LABEL.TaktUp],
  pkwt: [JENIS_LABEL.PkwtTerminate],
  vokasi: [JENIS_LABEL.VokasiEnded],
  lainnya: MANUAL_ORIGINS.map((t) => JENIS_LABEL[t]),
};

export const STATUS_OPTIONS = ["Open", "DELAY", "Need Replace ASAP", "Fulfilled Ontime", "Fulfilled but Delay"];

/** Nothing left to do: received by the shop, or not being replaced. */
export function isDemandDone(d: Demand): boolean {
  return Boolean(d.shop_confirmed_date) || d.replacement_status === "No Replace";
}

export function whoOf(d: Demand): string {
  if (d.origin_type === "Project" || d.origin_type === "TaktUp") return `${d.outgoing_label} (${d.dept})`;
  return d.outgoing_nama || d.outgoing_noreg || d.dept;
}

/** Waiting on step 2 of the mapping: a candidate is in, nobody has
 * verified it yet. */
export function awaitingVerification(d: Demand): boolean {
  return Boolean(d.replacement_noreg) && !d.fulfillment_confirmed_date && d.replacement_status !== "No Replace";
}
