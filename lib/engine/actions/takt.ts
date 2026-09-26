// Takt Time: Takt Up opens demands, Takt Down releases people to the Supply Pool.
import { genId } from "../../storage";
import { demandStore, taktStore, utilPoolStore } from "../../repo";
import type { ProjectMpNeedRow, TaktCase, TaktDownPerson, TaktDownPlanRow, UtilPoolEntry } from "../../types";
import { estimateContractEnd } from "./people";
import { createDemandsFromTaktRow, isEditableDemand } from "./demands";
import { reconcileNeedRows } from "./needRows";
import type { NeedRowDraft } from "./needRows";
import { removePoolEntry, pushToUtilPool } from "./pool";

export function updateTaktUp(
  taktId: string,
  input: { plant: TaktCase["plant"]; date: string; takt_before: number; takt_after: number; rows: NeedRowDraft[] }
): string | null {
  const takt = taktStore.get(taktId);
  if (!takt || takt.category !== "up") return "Takt Up tidak ditemukan.";
  const result = reconcileNeedRows(
    takt.need_rows ?? [],
    takt.demand_ids,
    input.rows,
    "TaktUp",
    takt.id,
    (row) => `Takt Up ${input.plant} - ${row.division} - ${row.dept}`
  );
  if (!result.ok) return result.error;
  taktStore.update(taktId, {
    plant: input.plant,
    date: input.date,
    takt_before: input.takt_before,
    takt_after: input.takt_after,
    need_rows: result.rows,
    demand_ids: result.demandIds,
  });
  return null;
}

/** Same invariant as deleteProject: untouched demands go with the case,
 * anything already in progress stays standing on its own. */
export function deleteTaktUp(taktId: string): boolean {
  const takt = taktStore.get(taktId);
  if (!takt || takt.category !== "up") return false;
  for (const id of takt.demand_ids) {
    const d = demandStore.get(id);
    if (d && isEditableDemand(d)) demandStore.remove(id);
  }
  taktStore.remove(taktId);
  return true;
}

export function createTaktUp(input: {
  plant: TaktCase["plant"];
  date: string;
  takt_before: number;
  takt_after: number;
  need_rows: Omit<ProjectMpNeedRow, "id">[];
}): TaktCase {
  const takt: TaktCase = {
    id: genId("takt"),
    plant: input.plant,
    date: input.date,
    category: "up",
    takt_before: input.takt_before,
    takt_after: input.takt_after,
    need_rows: input.need_rows.map((r) => ({ ...r, id: genId("row") })),
    demand_ids: [],
    released_pool_ids: [],
  };
  taktStore.insert(takt);
  const needRows = (takt.need_rows ?? []).map((row) => ({
    ...row,
    demand_ids: createDemandsFromTaktRow(takt, row).map((d) => d.id),
  }));
  return taktStore.update(takt.id, { need_rows: needRows, demand_ids: needRows.flatMap((r) => r.demand_ids) })!;
}

/** The plan row a released person's composition matches (division + dept +
 * status), used to carry that row's planned release_date onto the Supply
 * Pool entry created for them — the same relationship
 * ProjectMpNeedRow.fulfill_date has to the Demands it expands into. Falls
 * back to the case's own date when a person doesn't line up with any row
 * (e.g. added via bulk/search without a matching plan entry). */
function releaseDateFor(person: TaktDownPerson, planRows: TaktDownPlanRow[], fallbackDate: string): string {
  const row = planRows.find((r) => r.division === person.div && r.dept === person.dept && r.status_mp === person.type);
  return row?.release_date || fallbackDate;
}

export function createTaktDown(input: {
  plant: TaktCase["plant"];
  date: string;
  takt_before: number;
  takt_after: number;
  plan_rows: Omit<TaktDownPlanRow, "id">[];
  released_persons: TaktDownPerson[];
}): TaktCase {
  const planRowsWithIds = input.plan_rows.map((r) => ({ ...r, id: genId("plan") }));
  const takt: TaktCase = {
    id: genId("takt"),
    plant: input.plant,
    date: input.date,
    category: "down",
    takt_before: input.takt_before,
    takt_after: input.takt_after,
    plan_rows: planRowsWithIds,
    released_persons: input.released_persons,
    demand_ids: [],
    released_pool_ids: [],
  };
  taktStore.insert(takt);
  const poolIds: string[] = [];
  for (const p of input.released_persons) {
    const contractEnd = estimateContractEnd(p.noreg, p.type);
    const entry = pushToUtilPool({
      noreg: p.noreg,
      nama: p.nama,
      type: p.type,
      source: "TaktDown",
      source_label: `Takt Down ${input.plant}`,
      prev_div: p.div,
      prev_dept: p.dept,
      contract_end: contractEnd,
      entered_pool_date: releaseDateFor(p, planRowsWithIds, input.date),
    });
    poolIds.push(entry.id);
  }
  return taktStore.update(takt.id, { released_pool_ids: poolIds })!;
}

/**
 * Edits an existing Takt Down case — plan_rows, released_persons, and the
 * case's own fields all stay changeable after creation, unlike the original
 * one-shot flow, since one takt-time change block commonly affects several
 * shops discovered/refined over more than one sitting.
 *
 * Only persons still "Open" in the Supply Pool are safe to drop — once a
 * released person has been Assigned (mapped to a Demand) or Released, their
 * Util Pool entry is left alone rather than silently deleted, so an
 * in-progress Demand mapping never gets orphaned by a Takt Down edit. The
 * caller (TaktDownModal) disables removal of non-Open persons in the UI;
 * this is the same invariant enforced again server-side of the store.
 */
export function updateTaktDown(
  taktId: string,
  input: {
    plant: TaktCase["plant"];
    date: string;
    takt_before: number;
    takt_after: number;
    plan_rows: TaktDownPlanRow[];
    released_persons: TaktDownPerson[];
  }
): TaktCase | undefined {
  const takt = taktStore.get(taktId);
  if (!takt) return undefined;

  const poolByNoreg = new Map(
    (takt.released_pool_ids ?? [])
      .map((id) => utilPoolStore.get(id))
      .filter((e): e is UtilPoolEntry => Boolean(e))
      .map((e) => [e.noreg, e])
  );

  const nextNoregs = new Set(input.released_persons.map((p) => p.noreg));
  const removedButLocked: TaktDownPerson[] = [];
  const keptPoolIds: string[] = [];

  for (const [noreg, entry] of poolByNoreg) {
    const stillPresent = nextNoregs.has(noreg);
    if (stillPresent) {
      keptPoolIds.push(entry.id);
      // Keep the Supply Pool entry in sync with an in-place edit (e.g.
      // correcting a person's shop or status) — only while it's still
      // Open; an already-Assigned/Released entry keeps its snapshot.
      if (entry.status === "Open") {
        const edited = input.released_persons.find((p) => p.noreg === noreg);
        if (
          edited &&
          (edited.nama !== entry.nama ||
            edited.type !== entry.type ||
            edited.div !== entry.prev_div ||
            edited.dept !== entry.prev_dept)
        ) {
          utilPoolStore.update(entry.id, { nama: edited.nama, type: edited.type, prev_div: edited.div, prev_dept: edited.dept });
        }
      }
      continue;
    }
    if (entry.status === "Open") {
      removePoolEntry(entry);
    } else {
      // Already utilized elsewhere — keep the pool entry and the person on
      // the case instead of orphaning what it's now backing.
      const prevPerson = (takt.released_persons ?? []).find((p) => p.noreg === noreg);
      if (prevPerson) removedButLocked.push(prevPerson);
      keptPoolIds.push(entry.id);
    }
  }

  const newPersons = input.released_persons.filter((p) => !poolByNoreg.has(p.noreg));
  const newPoolIds: string[] = [];
  for (const p of newPersons) {
    const contractEnd = estimateContractEnd(p.noreg, p.type);
    const entry = pushToUtilPool({
      noreg: p.noreg,
      nama: p.nama,
      type: p.type,
      source: "TaktDown",
      source_label: `Takt Down ${input.plant}`,
      prev_div: p.div,
      prev_dept: p.dept,
      contract_end: contractEnd,
      entered_pool_date: releaseDateFor(p, input.plan_rows, input.date),
    });
    newPoolIds.push(entry.id);
  }

  const finalPersons = [...input.released_persons.filter((p) => nextNoregs.has(p.noreg)), ...removedButLocked];

  return taktStore.update(taktId, {
    plant: input.plant,
    date: input.date,
    takt_before: input.takt_before,
    takt_after: input.takt_after,
    plan_rows: input.plan_rows,
    released_persons: finalPersons,
    released_pool_ids: [...keptPoolIds, ...newPoolIds],
  });
}

/**
 * Deletes a Takt Down case. Same safety invariant as updateTaktDown's
 * removal path: a released person still "Open" in the Supply Pool is
 * cleaned up with the case (nothing depends on it), but one already
 * Assigned or Released is left in place — the case record disappears, but
 * the Supply Pool entry it produced (and whatever Demand it's backing)
 * keeps standing on its own. Returns false if the case doesn't exist.
 */
export function deleteTaktDown(taktId: string): boolean {
  const takt = taktStore.get(taktId);
  if (!takt || takt.category !== "down") return false;

  for (const poolId of takt.released_pool_ids ?? []) {
    const entry = utilPoolStore.get(poolId);
    if (entry && entry.status === "Open") removePoolEntry(entry);
  }
  taktStore.remove(taktId);
  return true;
}
