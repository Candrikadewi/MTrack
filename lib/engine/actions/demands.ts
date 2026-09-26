// Creating demands: the shared blank demand, expanding a need row into demands, repairing
// missing ones, and manual demands (Resign, GST, Unfit, ...) with their edit/delete rules.
import { genId } from "../../storage";
import { demandStore, projectStore, taktStore } from "../../repo";
import { pushToast } from "../../toast";
import type { Demand, DemandCategory, DemandOriginType, Project, ProjectMpNeedRow, TaktCase } from "../../types";
import { mapMpStatusToDemandCategory } from "./people";

export function baseDemand(overrides: Partial<Demand>): Demand {
  return {
    id: genId("demand"),
    category: "Vokasi",
    origin_type: "Manual",
    origin_ref: "",
    outgoing_noreg: "",
    outgoing_nama: "",
    outgoing_label: "",
    div: "",
    dept: "",
    tgl_masuk_outgoing: "",
    tgl_ended_outgoing: "",
    fulfill_date: "",
    replacement_status: "",
    no_replace_reason: "",
    replacement_noreg: "",
    replacement_nama: "",
    replacement_batch: "",
    replacement_tgl_masuk: "",
    replacement_dept: "",
    replacement_employment_status: "",
    fs_status: "",
    status: "Open",
    fulfillment_confirmed_date: "",
    shop_confirmed_date: "",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/** §12 "Expand qty Project/Takt": 1 row qty=N -> N Demand records, same outgoing_label. */
export function expandRowToDemands(
  row: ProjectMpNeedRow,
  originType: Extract<DemandOriginType, "Project" | "TaktUp">,
  originRef: string,
  outgoingLabel: string
): Demand[] {
  const qty = Math.max(1, row.qty);
  const demands: Demand[] = Array.from({ length: qty }, () =>
    baseDemand({
      category: mapMpStatusToDemandCategory(row.status_mp),
      origin_type: originType,
      origin_ref: originRef,
      outgoing_label: outgoingLabel,
      div: row.division,
      dept: row.dept,
      fulfill_date: row.fulfill_date,
    })
  );
  demandStore.insertMany(demands);
  return demands;
}

/** Recreates Project / Takt Up demands that a project or takt case points
 * at but the database never stored. Until blank dates were sent as null
 * (see toRow in lib/storage.ts) every such insert was rejected, silently,
 * so the case exists with demand ids that lead nowhere — and picking a
 * Source then failed with "Demand not found". Ids are kept, so the case's
 * links stay valid. Project rows that record their own demand_ids are
 * matched exactly; otherwise ids map to rows in creation order. Run only
 * once the demand, project and takt stores are loaded. Returns how many
 * were recreated. */
export async function repairMissingPlanDemands(): Promise<number> {
  const known = new Set(demandStore.list().map((d) => d.id));
  const toCreate: Demand[] = [];
  const recreate = (ids: string[], row: ProjectMpNeedRow, originType: "Project" | "TaktUp", ref: string, label: string) => {
    for (const id of ids) {
      if (known.has(id)) continue;
      known.add(id);
      toCreate.push(
        baseDemand({
          id,
          category: mapMpStatusToDemandCategory(row.status_mp),
          origin_type: originType,
          origin_ref: ref,
          outgoing_label: label,
          div: row.division,
          dept: row.dept,
          fulfill_date: row.fulfill_date,
        })
      );
    }
  };
  const byPosition = (ids: string[], rows: ProjectMpNeedRow[]) => {
    const out: [ProjectMpNeedRow, string[]][] = [];
    let i = 0;
    for (const row of rows) {
      const n = Math.max(1, row.qty);
      out.push([row, ids.slice(i, i + n)]);
      i += n;
    }
    return out;
  };

  for (const project of projectStore.list()) {
    if (project.rows.every((r) => r.demand_ids)) {
      for (const row of project.rows) recreate(row.demand_ids ?? [], row, "Project", project.id, project.name);
    } else {
      for (const [row, ids] of byPosition(project.demand_ids, project.rows)) recreate(ids, row, "Project", project.id, project.name);
    }
  }
  for (const takt of taktStore.list()) {
    if (takt.category !== "up") continue;
    for (const [row, ids] of byPosition(takt.demand_ids, takt.need_rows ?? [])) {
      recreate(ids, row, "TaktUp", takt.id, `Takt Up ${takt.plant} - ${row.division} - ${row.dept}`);
    }
  }
  if (toCreate.length === 0) return 0;
  const error = await demandStore.insertManyPersisted(toCreate);
  if (error) {
    demandStore.refetch();
    pushToast(`Gagal memulihkan demand: ${error}`);
    return 0;
  }
  return toCreate.length;
}

export function createDemandsFromProjectRow(project: Project, row: ProjectMpNeedRow): Demand[] {
  return expandRowToDemands(row, "Project", project.id, project.name);
}

export function createDemandsFromTaktRow(takt: TaktCase, row: ProjectMpNeedRow): Demand[] {
  return expandRowToDemands(
    row,
    "TaktUp",
    takt.id,
    `Takt Up ${takt.plant} - ${row.division} - ${row.dept}`
  );
}

export function createManualDemand(input: {
  category: DemandCategory;
  origin_type: Extract<DemandOriginType, "Resign" | "Pension" | "PensionDini" | "GST" | "Unfit" | "Others" | "Manual">;
  origin_label?: string; // free-text reason when origin_type = "Others"
  outgoing_noreg: string;
  outgoing_nama: string;
  div: string;
  dept: string;
  fulfill_date: string;
}): Demand {
  const d = baseDemand({
    category: input.category,
    origin_type: input.origin_type,
    origin_label: input.origin_label,
    outgoing_noreg: input.outgoing_noreg,
    outgoing_nama: input.outgoing_nama,
    div: input.div,
    dept: input.dept,
    fulfill_date: input.fulfill_date,
    tgl_ended_outgoing: new Date().toISOString().slice(0, 10),
  });
  demandStore.insert(d);
  return d;
}

/** A demand nobody has acted on yet — no candidate, nothing verified or
 * received. Only these are reshaped or removed when an input is edited or
 * deleted; anything in progress stays as it is. */
export function isEditableDemand(d: Demand): boolean {
  return d.status !== "Fulfilled" && !d.replacement_noreg && !d.fulfillment_confirmed_date && !d.shop_confirmed_date;
}

export type ManualDemandInput = Parameters<typeof createManualDemand>[0];

/** Edits a manual demand's own details. Its category only changes while
 * nobody has been mapped to it yet. */
export function updateManualDemand(demandId: string, input: ManualDemandInput): string | null {
  const d = demandStore.get(demandId);
  if (!d) return "Demand tidak ditemukan.";
  if (input.category !== d.category && !isEditableDemand(d)) return "Kategori tidak bisa diubah setelah ada kandidat.";
  demandStore.update(demandId, {
    category: input.category,
    origin_type: input.origin_type,
    origin_label: input.origin_label,
    outgoing_noreg: input.outgoing_noreg,
    outgoing_nama: input.outgoing_nama,
    div: input.div,
    dept: input.dept,
    fulfill_date: input.fulfill_date,
  });
  return null;
}

export function deleteManualDemand(demandId: string): string | null {
  const d = demandStore.get(demandId);
  if (!d) return "Demand tidak ditemukan.";
  if (!isEditableDemand(d)) return "Demand ini sudah punya kandidat/pemenuhan, tidak bisa dihapus.";
  demandStore.remove(demandId);
  return null;
}
