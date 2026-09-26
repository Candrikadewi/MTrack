// Vokasi Ended demands: one per Vokasi whose batch ends, pruned when stale, and closed as
// No Replace when the person was released naturally (Takt Down / Kaizen).
import { addDays, format, parseISO } from "date-fns";
import { demandTargetDate } from "../enrollment";
import { demandStore, utilPoolStore, vokasiStore } from "../../repo";
import { pushToast } from "../../toast";
import type { Demand, UtilPoolEntry, VokasiRecord } from "../../types";
import { baseDemand } from "./demands";
import { setDemandReplacementByNoreg, setDemandNoReplace } from "./replacement";
import { syncProjectSeatDemands } from "./projects";

function monthStartKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Supply Pool sources that release a person for good — a Vokasi released
 * this way leaves naturally at the end of their batch, so their seat is not
 * backfilled. */
export const NATURAL_RELEASE_SOURCES: UtilPoolEntry["source"][] = ["TaktDown", "Kaizen"];

function naturalReleaseEntry(noreg: string): UtilPoolEntry | undefined {
  return utilPoolStore.list().find((e) => e.noreg === noreg && NATURAL_RELEASE_SOURCES.includes(e.source));
}

function naturalReleaseReason(entry: UtilPoolEntry): string {
  return `Natural release — ${entry.source_label}`;
}

/** A VokasiEnded demand nobody has worked on yet: still the auto-created
 * default (Vokasi New Hire, no candidate, nothing confirmed). */
function untouchedVokasiDemand(d: Demand): boolean {
  return (
    d.origin_type === "VokasiEnded" &&
    d.status === "Open" &&
    !d.replacement_noreg &&
    !d.fulfillment_confirmed_date &&
    !d.shop_confirmed_date &&
    (d.replacement_status === "" || d.replacement_status === "Vokasi New Hire")
  );
}

/** Removes untouched VokasiEnded demands that the creation rule below would
 * never have made: the outgoing batch had already ended in an earlier month
 * than the one the demand was created in (history from the starting file,
 * already replaced in real life). Returns how many were removed. */
export function pruneStaleVokasiDemands(): number {
  let removed = 0;
  for (const d of demandStore.list()) {
    if (!untouchedVokasiDemand(d) || !d.tgl_ended_outgoing) continue;
    const createdMonthStart = monthStartKey(new Date(d.created_at));
    if (d.tgl_ended_outgoing < createdMonthStart) {
      demandStore.remove(d.id);
      removed++;
    }
  }
  return removed;
}

/** Ensures every Vokasi that ends this month or later has exactly one
 * Vokasi-category Demand. Batches that already ended before this month are
 * history (the starting file carries every past batch) and get no demand.
 * A Vokasi already released through Takt Down/Kaizen starts as No Replace.
 * Resolves once the new demands are in the database, so follow-up RPCs
 * (auto-matching) can find them. */
export async function ensureVokasiEndedDemands(): Promise<number> {
  pruneStaleVokasiDemands();
  const demands = demandStore.list();
  const existingRefs = new Set(demands.filter((d) => d.origin_type === "VokasiEnded").map((d) => d.origin_ref));
  const thisMonth = monthStartKey();
  const toCreate: Demand[] = [];
  for (const v of vokasiStore.list()) {
    if (!v.tgl_ended || v.tgl_ended < thisMonth || existingRefs.has(v.id)) continue;
    const released = naturalReleaseEntry(v.noreg);
    toCreate.push(
      baseDemand({
        category: "Vokasi",
        origin_type: "VokasiEnded",
        origin_ref: v.id,
        outgoing_noreg: v.noreg,
        outgoing_nama: v.nama,
        div: v.div,
        dept: v.dept,
        tgl_masuk_outgoing: v.tgl_masuk,
        tgl_ended_outgoing: v.tgl_ended,
        // Regular enrollment default: most vokasi seats get backfilled by a
        // fresh vokasi intake, so pre-select the Source rather than forcing
        // every row through the picker — still changeable to MP Excess/Back
        // Up/No Replace on the Supply-Demand page.
        replacement_status: released ? "No Replace" : "Vokasi New Hire",
        no_replace_reason: released ? naturalReleaseReason(released) : "",
      })
    );
  }
  if (toCreate.length === 0) return 0;
  const error = await demandStore.insertManyPersisted(toCreate);
  if (error) {
    pushToast(`Gagal membuat demand Vokasi: ${error}`);
    demandStore.refetch();
    return 0;
  }
  syncProjectSeatDemands();
  return toCreate.length;
}

/** Vokasi released through Takt Down/Kaizen: their VokasiEnded demand
 * switches to No Replace (natural release) unless a replacement is already
 * verified. */
export function applyVokasiNaturalRelease(entry: UtilPoolEntry): void {
  if (entry.type !== "Vokasi" || !NATURAL_RELEASE_SOURCES.includes(entry.source)) return;
  for (const d of demandStore.list()) {
    if (d.origin_type !== "VokasiEnded" || d.outgoing_noreg !== entry.noreg) continue;
    if (d.fulfillment_confirmed_date || d.replacement_status === "No Replace") continue;
    setDemandNoReplace(d.id, naturalReleaseReason(entry));
  }
}

/** Undoes applyVokasiNaturalRelease once the person is taken back out of
 * Takt Down/Kaizen (and no other release still covers them): the demand
 * returns to the regular Vokasi New Hire default. */
export function revertVokasiNaturalRelease(noreg: string, removedEntryId: string): void {
  const stillReleased = utilPoolStore
    .list()
    .some((e) => e.id !== removedEntryId && e.noreg === noreg && NATURAL_RELEASE_SOURCES.includes(e.source));
  if (stillReleased) return;
  for (const d of demandStore.list()) {
    if (d.origin_type !== "VokasiEnded" || d.outgoing_noreg !== noreg) continue;
    if (d.replacement_status !== "No Replace" || !d.no_replace_reason.startsWith("Natural release")) continue;
    setDemandReplacementByNoreg(d.id, "", "Vokasi New Hire");
  }
}

/** §4.2 auto-matching: new Vokasi batch upload -> fill Open Demand whose
 * Source is "Vokasi New Hire" (regardless of which tab it lives on — a PKWT
 * demand backfilled from the Vokasi pipeline is just as eligible as a
 * Vokasi-origin one) with a same-dept candidate from the batch.
 *
 * A candidate only fits a seat that is vacated by the time they start (the
 * outgoing person ends no later than a month after the candidate's Tgl
 * Masuk), never their own seat or a seat of their own batch — otherwise a
 * starting file carrying every batch would match batches against
 * themselves. Oldest vacancies are filled first. Only call this once the
 * demands are persisted (see ensureVokasiEndedDemands), since the RPC looks
 * each one up server-side. */
export function autoMatchVokasiBatch(newRecords: VokasiRecord[]): number {
  const usedNoreg = new Set(
    demandStore
      .list()
      .filter((d) => d.replacement_noreg)
      .map((d) => d.replacement_noreg)
  );
  const vacatedBy = (d: Demand) => d.tgl_ended_outgoing || demandTargetDate(d);
  const openDemands = demandStore
    .list()
    .filter((d) => d.replacement_status === "Vokasi New Hire" && d.status === "Open" && !d.replacement_noreg)
    .sort((a, b) => vacatedBy(a).localeCompare(vacatedBy(b)));

  const fits = (r: VokasiRecord, demand: Demand) => {
    if (r.dept !== demand.dept || usedNoreg.has(r.noreg) || r.noreg === demand.outgoing_noreg) return false;
    if (demand.origin_type === "VokasiEnded" && vokasiStore.get(demand.origin_ref)?.batch === r.batch) return false;
    const vacated = vacatedBy(demand);
    if (!vacated || !r.tgl_masuk) return true;
    return vacated <= format(addDays(parseISO(r.tgl_masuk), 31), "yyyy-MM-dd");
  };

  let matched = 0;
  for (const demand of openDemands) {
    const candidate = newRecords.find((r) => fits(r, demand));
    if (!candidate) continue;
    usedNoreg.add(candidate.noreg);
    setDemandReplacementByNoreg(demand.id, candidate.noreg, "Vokasi New Hire");
    matched++;
  }
  return matched;
}
