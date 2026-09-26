// Editing the need rows of a project or Takt Up after registration: which demands belong to
// which row, and reconciling an edit without losing demands already in progress.
import { genId } from "../../storage";
import { demandStore } from "../../repo";
import type { ProjectMpNeedRow } from "../../types";
import { mapMpStatusToDemandCategory } from "./people";
import { expandRowToDemands, isEditableDemand } from "./demands";

export type NeedRowDraft = Omit<ProjectMpNeedRow, "id" | "demand_ids"> & { id?: string };

/** Each row's demand ids: exact when rows record their own, otherwise by
 * creation order (rows expanded one after another into `flat`). */
export function demandIdsByRow(rows: ProjectMpNeedRow[], flat: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (rows.every((r) => r.demand_ids)) {
    for (const r of rows) map.set(r.id, r.demand_ids ?? []);
    return map;
  }
  let i = 0;
  for (const r of rows) {
    const n = Math.max(1, r.qty);
    map.set(r.id, flat.slice(i, i + n));
    i += n;
  }
  return map;
}

/** How many of these demands are already in progress (see isEditableDemand). */
export function lockedDemandCount(ids: string[]): number {
  return ids.filter((id) => {
    const d = demandStore.get(id);
    return d !== undefined && !isEditableDemand(d);
  }).length;
}

type ReconcileResult = { ok: true; rows: ProjectMpNeedRow[]; demandIds: string[] } | { ok: false; error: string };

/** Applies an edited list of need rows to a Project / Takt Up: removed
 * rows drop their demands, a lower qty drops untouched demands, a higher
 * qty adds new ones, and changed div/dept/status/date carry over to the
 * untouched demands. Refuses (changing nothing) when that would remove or
 * reshape a demand already in progress. */
export function reconcileNeedRows(
  prevRows: ProjectMpNeedRow[],
  flatIds: string[],
  nextRows: NeedRowDraft[],
  originType: "Project" | "TaktUp",
  originRef: string,
  labelOf: (row: Omit<ProjectMpNeedRow, "id">) => string
): ReconcileResult {
  const idsByRow = demandIdsByRow(prevRows, flatIds);
  const nextIds = new Set(nextRows.map((r) => r.id).filter(Boolean));
  const describe = (r: { dept: string; status_mp: string }) => `${r.dept || "-"} · ${r.status_mp}`;

  // Validate everything first so a refused edit leaves no half-applied state.
  for (const prev of prevRows) {
    const ids = idsByRow.get(prev.id) ?? [];
    const locked = lockedDemandCount(ids);
    const next = nextRows.find((r) => r.id === prev.id);
    if (!next) {
      if (locked > 0)
        return { ok: false, error: `Baris ${describe(prev)} sudah punya ${locked} kandidat/pemenuhan, tidak bisa dihapus.` };
      continue;
    }
    if (next.qty < locked)
      return { ok: false, error: `Qty ${describe(prev)} minimal ${locked} (sudah punya kandidat/pemenuhan).` };
    const reshaped = next.division !== prev.division || next.dept !== prev.dept || next.status_mp !== prev.status_mp;
    if (reshaped && locked > 0) {
      return { ok: false, error: `Divisi/Dept/Status ${describe(prev)} tidak bisa diubah karena sudah ada kandidat/pemenuhan.` };
    }
  }

  for (const prev of prevRows) {
    if (nextIds.has(prev.id)) continue;
    for (const id of idsByRow.get(prev.id) ?? []) if (demandStore.get(id)) demandStore.remove(id);
  }

  const rows: ProjectMpNeedRow[] = [];
  for (const draft of nextRows) {
    const prev = draft.id ? prevRows.find((r) => r.id === draft.id) : undefined;
    const row: ProjectMpNeedRow = { ...draft, id: prev?.id ?? genId("row") };
    let ids = prev ? (idsByRow.get(prev.id) ?? []).filter((id) => demandStore.get(id)) : [];
    const editable = ids.filter((id) => isEditableDemand(demandStore.get(id)!));
    if (prev) {
      for (const id of editable) {
        demandStore.update(id, {
          category: mapMpStatusToDemandCategory(row.status_mp),
          div: row.division,
          dept: row.dept,
          fulfill_date: row.fulfill_date,
          outgoing_label: labelOf(row),
        });
      }
    }
    const qty = Math.max(1, row.qty);
    if (ids.length > qty) {
      const drop = editable.slice(0, ids.length - qty);
      for (const id of drop) demandStore.remove(id);
      ids = ids.filter((id) => !drop.includes(id));
    } else if (ids.length < qty) {
      const created = expandRowToDemands({ ...row, qty: qty - ids.length }, originType, originRef, labelOf(row));
      ids = [...ids, ...created.map((d) => d.id)];
    }
    rows.push({ ...row, demand_ids: ids });
  }
  return { ok: true, rows, demandIds: rows.flatMap((r) => r.demand_ids ?? []) };
}
