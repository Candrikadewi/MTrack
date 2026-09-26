// Supply (Utilization) Pool: adding people, Kaizen supply, proposing a pool candidate for a
// demand, and natural release.
import { genId } from "../../storage";
import { demandStore, utilPoolStore } from "../../repo";
import { createClient } from "../../supabase/client";
import { pushToast } from "../../toast";
import { computeFsStatus, today } from "../compute";
import type { KaizenLaborGroup, MpStatusKategori, ReplacementStatus, UtilPoolEntry } from "../../types";
import { estimateContractEnd } from "./people";
import { NATURAL_RELEASE_SOURCES, applyVokasiNaturalRelease, revertVokasiNaturalRelease } from "./vokasiEnded";

export function removePoolEntry(entry: UtilPoolEntry): void {
  utilPoolStore.remove(entry.id);
  if (entry.type === "Vokasi" && NATURAL_RELEASE_SOURCES.includes(entry.source)) {
    revertVokasiNaturalRelease(entry.noreg, entry.id);
  }
}

export function pushToUtilPool(input: {
  noreg: string;
  nama: string;
  type: MpStatusKategori;
  source: UtilPoolEntry["source"];
  source_label: string;
  prev_div: string;
  prev_dept: string;
  contract_end: string | null;
  entered_pool_date?: string;
  action_note?: string;
}): UtilPoolEntry {
  const entry: UtilPoolEntry = {
    id: genId("pool"),
    noreg: input.noreg,
    nama: input.nama,
    type: input.type,
    source: input.source,
    source_label: input.source_label,
    prev_div: input.prev_div,
    prev_dept: input.prev_dept,
    entered_pool_date: input.entered_pool_date ?? today().toISOString().slice(0, 10),
    contract_end: input.contract_end,
    status: "Open",
    action_note: input.action_note ?? "",
  };
  utilPoolStore.insert(entry);
  applyVokasiNaturalRelease(entry);
  return entry;
}

/** Kaizen-driven headcount release: a shop/department is challenged to
 * improve its process and free up MP — this records who came out of that
 * effort and pushes them straight into Supply Pool (like Takt Down). Each
 * person carries the activity and release date of the plan row they were
 * picked for, and the whole release is declared under one labor group
 * (A/F or B/C). source_label groups them per year, labor group, division
 * and activity so each result gets its own Source Summary batch. Contract
 * due date is auto-estimated like every other Supply Pool source. */
export function createKaizenSupply(input: {
  laborGroup: KaizenLaborGroup;
  persons: {
    noreg: string;
    nama: string;
    type: MpStatusKategori;
    div: string;
    dept: string;
    activity: string;
    releaseDate: string;
  }[];
}): UtilPoolEntry[] {
  return input.persons.map((p) => {
    const contractEnd = estimateContractEnd(p.noreg, p.type);
    const year = p.releaseDate.slice(0, 4);
    return pushToUtilPool({
      noreg: p.noreg,
      nama: p.nama,
      type: p.type,
      source: "Kaizen",
      source_label: `Kaizen ${year} Labor ${input.laborGroup} - ${p.div} (${p.activity})`,
      prev_div: p.div,
      prev_dept: p.dept,
      contract_end: contractEnd,
      entered_pool_date: p.releaseDate,
    });
  });
}

/** Step 1 of pool mapping: propose a Util Pool person (MP Excess/Back Up)
 * for a demand. The demand stays Open ("Diusulkan") and the pool entry is
 * reserved so no other demand can take it; step 2 is HR/admin verifying via
 * confirmDemandFulfillment. Pass `null` to withdraw the proposal and release
 * the reserved entry. Routed through the `propose_pool_candidate` RPC
 * (migration_12) so the admin / shop-PKWT rule holds server-side — direct
 * table writes here are admin-only under RLS and fail silently for shop. */
export function proposePoolCandidate(poolEntryId: string | null, demandId: string): void {
  const demand = demandStore.get(demandId);
  if (!demand) return;
  const entry = poolEntryId ? utilPoolStore.get(poolEntryId) : undefined;
  if (poolEntryId && !entry) return;

  const previousDemand = demand;
  const previousEntry = demand.replacement_noreg
    ? utilPoolStore.list().find((e) => e.noreg === demand.replacement_noreg && e.status === "Assigned")
    : undefined;
  const releasing = previousEntry && previousEntry.id !== poolEntryId ? previousEntry : undefined;
  const entryBefore = entry ? { status: entry.status, action_note: entry.action_note } : undefined;

  const replacement_status: ReplacementStatus =
    demand.replacement_status === "" || demand.replacement_status === "No Replace"
      ? "MP Excess"
      : demand.replacement_status;
  const fs_status = entry ? computeFsStatus(replacement_status, demand.dept, entry.prev_dept, undefined) : "";

  if (releasing) utilPoolStore.patchLocal(releasing.id, { status: "Open", action_note: "" });
  if (entry) {
    demandStore.patchLocal(demandId, {
      replacement_status,
      no_replace_reason: "",
      replacement_noreg: entry.noreg,
      replacement_nama: entry.nama,
      replacement_dept: entry.prev_dept,
      replacement_batch: "",
      fs_status,
      status: "Open",
    });
    utilPoolStore.patchLocal(entry.id, { status: "Assigned", action_note: `Diusulkan untuk demand ${demandId}` });
  } else {
    demandStore.patchLocal(demandId, {
      replacement_noreg: "",
      replacement_nama: "",
      replacement_dept: "",
      replacement_batch: "",
      fs_status: "",
      status: "Open",
    });
  }

  createClient()
    .rpc("propose_pool_candidate", { p_demand_id: demandId, p_pool_entry_id: poolEntryId, p_fs_status: fs_status })
    .then((res: { error: { message: string } | null }) => {
      if (res.error) {
        console.error("propose_pool_candidate failed:", res.error.message);
        demandStore.patchLocal(demandId, previousDemand);
        if (releasing) utilPoolStore.patchLocal(releasing.id, { status: releasing.status, action_note: releasing.action_note });
        if (entry && entryBefore) utilPoolStore.patchLocal(entry.id, entryBefore);
        pushToast(`Gagal menyimpan usulan: ${res.error.message}`);
        return;
      }
      demandStore.refetch();
      utilPoolStore.refetch();
    });
}

export function naturalRelease(poolEntryId: string): void {
  utilPoolStore.update(poolEntryId, { status: "Released", action_note: "Natural Release" });
}
