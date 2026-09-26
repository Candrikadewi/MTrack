// Vokasi alumni rehired as PKWT sign under a new ZPAR noreg. Linking the two needs strict
// checks or an admin's confirmation (stored in value_mappings), never the name alone.
import { addDays, format, parseISO } from "date-fns";
import { genId } from "../../storage";
import { demandStore, utilPoolStore, valueMappingStore, getActiveSnapshot } from "../../repo";
import { computeReviewDate } from "../compute";
import { KONTRAK_REVIEW_STATUSES, isPermanenForRatio } from "../../types";
import type { Demand, EmployeeRecord } from "../../types";
import { getActiveEmployeeByNoreg, getVokasiByNoreg } from "./people";

/** Name compared letters-only and case-insensitive ("LUNA  S." = "Luna S"). */
function normalizedName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z]+/g, " ").trim();
}

// A Vokasi alumnus hired as PKWT (Source "PKWT New Hire") signs under a
// new noreg that only shows up in a later ZPAR. The link Vokasi noreg →
// ZPAR noreg is stored once confirmed (value_mappings, field noreg_zpar)
// and every release / review / pool lookup follows it from then on.
const REHIRE_FIELD = "noreg_zpar";

export function linkedZparNoreg(vokasiNoreg: string): string | undefined {
  const key = vokasiNoreg.trim().toUpperCase();
  return valueMappingStore.list().find((m) => m.dataset === "vokasi" && m.field === REHIRE_FIELD && m.normalized_raw === key)
    ?.mapped_value;
}

/** Records (or changes) which ZPAR noreg a rehired alumnus signed under. */
export function linkRehiredNoreg(vokasiNoreg: string, zparNoreg: string): void {
  const key = vokasiNoreg.trim().toUpperCase();
  const existing = valueMappingStore
    .list()
    .find((m) => m.dataset === "vokasi" && m.field === REHIRE_FIELD && m.normalized_raw === key);
  const decided_at = new Date().toISOString();
  if (existing) valueMappingStore.update(existing.id, { mapped_value: zparNoreg, decided_at });
  else
    valueMappingStore.insert({
      id: genId("valmap"),
      dataset: "vokasi",
      field: REHIRE_FIELD,
      raw_value: vokasiNoreg,
      normalized_raw: key,
      mapped_value: zparNoreg,
      decided_at,
    });
}

/** The ZPAR employee a rehired alumnus is confirmed as, when the active
 * snapshot has them. Only a confirmed link counts — never a name guess. */
export function findRehiredEmployee(vokasiNoreg: string): EmployeeRecord | undefined {
  const noreg = linkedZparNoreg(vokasiNoreg);
  return noreg ? getActiveEmployeeByNoreg(noreg) : undefined;
}

export interface RehireCheck {
  label: string;
  ok: boolean;
}

export interface RehireCandidate {
  employee: EmployeeRecord;
  checks: RehireCheck[];
  /** Passes every check — safe to link without asking. */
  strict: boolean;
}

/** ZPAR employees who could be the alumnus behind a PKWT New Hire demand
 * after signing: same name, not already linked to someone else, each with
 * the checks that support it. Tgl Masuk is allowed up to 45 days before
 * the sign-contract date (HR back-dates the start sometimes). */
export function rehireCandidates(d: Demand): RehireCandidate[] {
  const snap = getActiveSnapshot();
  if (!snap || !d.replacement_noreg) return [];
  const vokasi = getVokasiByNoreg(d.replacement_noreg);
  const name = normalizedName(d.replacement_nama || vokasi?.nama || "");
  if (!name) return [];
  const taken = new Set(
    valueMappingStore
      .list()
      .filter((m) => m.dataset === "vokasi" && m.field === REHIRE_FIELD && m.normalized_raw !== d.replacement_noreg.toUpperCase())
      .map((m) => m.mapped_value)
  );
  const signed = d.fulfillment_confirmed_date;
  const earliest = signed ? format(addDays(parseISO(signed), -45), "yyyy-MM-dd") : vokasi?.tgl_masuk ?? "";
  return snap.employees
    .filter((e) => normalizedName(e.nama) === name && e.noreg !== d.replacement_noreg && !taken.has(e.noreg))
    .map((employee) => {
      const checks: RehireCheck[] = [
        { label: "Status Kontrak", ok: KONTRAK_REVIEW_STATUSES.includes(employee.status_kontrak) },
        { label: "Tgl Masuk setelah sign kontrak", ok: Boolean(employee.tgl_masuk && earliest && employee.tgl_masuk >= earliest) },
        { label: "Dept sama", ok: !d.dept || employee.dept === d.dept },
        { label: "Gender sama", ok: !vokasi?.gender || employee.gender === vokasi.gender },
      ];
      return { employee, checks, strict: checks.every((c) => c.ok) };
    });
}

/** Links every signed (verified) PKWT New Hire alumnus whose new ZPAR
 * record is unambiguous: exactly one candidate passing every check.
 * Anything less is left for an admin to confirm on the Demand page. */
export function linkRehiredAlumni(): number {
  let linked = 0;
  for (const d of demandStore.list()) {
    if (!isRehiredAlumnus(d) || !d.fulfillment_confirmed_date || linkedZparNoreg(d.replacement_noreg)) continue;
    const strict = rehireCandidates(d).filter((c) => c.strict);
    if (strict.length !== 1) continue;
    linkRehiredNoreg(d.replacement_noreg, strict[0].employee.noreg);
    linked++;
  }
  return linked;
}

/** Filled as "PKWT New Hire" with a Vokasi noreg: the person is an alumnus
 * now under a PKWT contract, whose own Vokasi Ended record says nothing
 * about this seat. */
export function isRehiredAlumnus(d: Demand): boolean {
  return d.replacement_status === "PKWT New Hire" && Boolean(d.replacement_noreg && getVokasiByNoreg(d.replacement_noreg));
}

/** The noregs a seat holder goes by: the one they were mapped with, plus
 * their new ZPAR noreg once a rehired alumnus shows up there. */
export function holderNoregs(d: Demand): string[] {
  if (!isRehiredAlumnus(d)) return [d.replacement_noreg];
  const linked = linkedZparNoreg(d.replacement_noreg);
  return linked && linked !== d.replacement_noreg ? [d.replacement_noreg, linked] : [d.replacement_noreg];
}

export const PENDING_NOREG_NOTE = "Noreg Vokasi — noreg ZPAR baru belum dikonfirmasi";

/** Pool entries released under an alumnus' old Vokasi noreg switch to
 * their new ZPAR noreg, name and PKWT contract end once that ZPAR is in. */
export function syncRehiredPoolEntries(): void {
  for (const entry of utilPoolStore.list()) {
    if (entry.source !== "ProjectFinish" || entry.action_note !== PENDING_NOREG_NOTE) continue;
    const emp = findRehiredEmployee(entry.noreg);
    if (!emp) continue;
    utilPoolStore.update(entry.id, {
      noreg: emp.noreg,
      nama: emp.nama,
      type: isPermanenForRatio(emp.status_kontrak) ? "Permanen" : "PKWT",
      contract_end: isPermanenForRatio(emp.status_kontrak) ? null : computeReviewDate(emp.tgl_masuk, emp.status_kontrak) || null,
      action_note: "",
    });
  }
}
