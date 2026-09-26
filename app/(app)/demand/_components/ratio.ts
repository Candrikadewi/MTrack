// Permanen : Kontrak : Vokasi ratio for the Enrollment Review widget, and how one demand
// would shift it.
import type { Demand, EmployeeRecord, VokasiRecord } from "@/lib/types";
import { isPermanenForRatio } from "@/lib/types";

/** Default scope for every ratio widget on this page when no Divisi/Dept
 * filter is active: Labor Type A within Vehicle Plant (Pers Area Karawang 1
 * & 2) — not the whole plant. Once a Divisi/Dept filter is picked, that
 * filter takes over as the scope instead (no Labor A/Vehicle Plant
 * restriction) — this default only exists to give the unfiltered view a
 * meaningful baseline. Dashboard's own ratio widget is unrelated and keeps
 * scoping to the whole plant regardless. */
export function scopeEmployeesForRatio(employees: EmployeeRecord[], divs: string[], depts: string[]): EmployeeRecord[] {
  if (divs.length === 0 && depts.length === 0) {
    return employees.filter((e) => e.labor_type === "A" && e.plant === "Vehicle Plant");
  }
  const byDiv = divs.length ? employees.filter((e) => divs.includes(e.division)) : employees;
  return depts.length ? byDiv.filter((e) => depts.includes(e.dept)) : byDiv;
}

export function scopeVokasiForRatio(vokasi: VokasiRecord[], divs: string[], depts: string[]): VokasiRecord[] {
  if (divs.length === 0 && depts.length === 0) {
    return vokasi.filter((v) => v.labor_type === "A" && v.plant === "Vehicle Plant");
  }
  const byDiv = divs.length ? vokasi.filter((v) => divs.includes(v.div)) : vokasi;
  return depts.length ? byDiv.filter((v) => depts.includes(v.dept)) : byDiv;
}

export type RatioDelta = { permanen: number; kontrak: number; vokasi: number };

/** Which bucket the outgoing person is actually leaving from. Project/Takt
 * Up demands don't have an outgoing person at all (they're pure additions,
 * not a replacement of someone departing) — origin_ref there is a
 * project/case id, not a person, so this deliberately doesn't try to
 * resolve one for them. */
function outgoingBucket(
  d: Demand,
  empByNoreg: Map<string, EmployeeRecord>,
  vokasiNoregs: Set<string>
): keyof RatioDelta | null {
  if (d.origin_type === "Project" || d.origin_type === "TaktUp") return null;
  if (d.origin_type === "PkwtTerminate") return "kontrak";
  if (d.origin_type === "VokasiEnded") return "vokasi";
  const emp = empByNoreg.get(d.outgoing_noreg);
  if (emp) return isPermanenForRatio(emp.status_kontrak) ? "permanen" : "kontrak";
  if (vokasiNoregs.has(d.outgoing_noreg)) return "vokasi";
  return null;
}

/** Projection delta for one demand, following what its actual mapping
 * decides — a Permanen replaced by a new Kontrak hire nets permanen -1,
 * kontrak +1. MP Excess/MP Back Up are transfers of someone already
 * counted in the current headcount, so they net zero. Undecided demands
 * (no Source picked yet) contribute nothing — there's nothing to project
 * until a mapping choice is actually made. */
export function demandRatioDelta(d: Demand, empByNoreg: Map<string, EmployeeRecord>, vokasiNoregs: Set<string>): RatioDelta {
  const delta: RatioDelta = { permanen: 0, kontrak: 0, vokasi: 0 };
  if (!d.replacement_status) return delta;
  const out = outgoingBucket(d, empByNoreg, vokasiNoregs);
  if (out) delta[out] -= 1;
  if (d.replacement_status === "PKWT New Hire") delta.kontrak += 1;
  else if (d.replacement_status === "Vokasi New Hire") delta.vokasi += 1;
  return delta;
}
