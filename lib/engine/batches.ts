// "Ringkasan per Batch" for Demand and Supply: how many MP are still to be
// fulfilled (Demand) or utilized (Supply) per source and batch, out of the
// total. Shared by the Demand/Supply pages and Dashboard's Action Needed
// so both always show the same numbers and names.
import { format } from "date-fns";
import { fmtDate } from "./compute";
import { demandTargetDate, isDemandDue } from "./enrollment";
import { kaizenLaborGroupOf } from "../types";
import type { Demand, DemandOriginType, Project, TaktCase, UtilPoolEntry, UtilPoolSource } from "../types";

export type BatchTone = "slate" | "blue" | "green" | "amber" | "red" | "violet";

export interface BatchSummary {
  id: string;
  label: string;
  meta?: string;
  /** Still to do (to fulfil / to utilize). */
  count: number;
  /** What `count` is out of, when known. */
  total?: number;
  tone?: BatchTone;
  /** Where this batch is shown in full (a project or takt detail page).
   * Omit when there's no such page. Edit / Hapus sit on the row itself. */
  href?: string;
}

export interface BatchTileCategory {
  key: string;
  label: string;
  count: number;
  total?: number;
  tone: BatchTone;
  batches: BatchSummary[];
}

export const DEMAND_JENIS_LABEL: Record<DemandOriginType, string> = {
  VokasiEnded: "Vokasi Ended",
  PkwtTerminate: "PKWT Terminate",
  Project: "Project",
  TaktUp: "Takt Up",
  Resign: "Resign",
  Pension: "Pensiun",
  PensionDini: "Pensiun Dini",
  GST: "GST",
  Unfit: "Unfit",
  Others: "Others",
  Manual: "Manual",
};

/** Every tile and batch counts MP still to fulfil (not yet verified), out
 * of the demand it has. Vokasi counts from the month its batch ends, and
 * No Replace has nothing to fill, so neither is in the total. Batches with
 * nothing left are not listed. */
export function buildDemandBatchCategories(demands: Demand[], projects: Project[], taktCases: TaktCase[]): BatchTileCategory[] {
  const active = demands.filter((d) => d.replacement_status !== "No Replace" && isDemandDue(d));
  const isOpen = (d: Demand) => d.status !== "Fulfilled";

  function batchesOf(
    items: Demand[],
    keyOf: (d: Demand) => string,
    describe: (key: string) => { label: string; meta?: string; href?: string },
    order: (a: string, b: string) => number = () => 0
  ) {
    const map = new Map<string, Demand[]>();
    for (const d of items) {
      const key = keyOf(d);
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return Array.from(map.entries())
      .map(([key, list]) => ({ id: key, ...describe(key), count: list.filter(isOpen).length, total: list.length }))
      .filter((b) => b.count > 0)
      .sort((a, b) => order(a.id, b.id));
  }

  function category(
    key: string,
    label: string,
    tone: BatchTileCategory["tone"],
    items: Demand[],
    batches: BatchTileCategory["batches"]
  ) {
    return { key, label, tone, count: items.filter(isOpen).length, total: items.length, batches };
  }

  const byMonthDesc = (a: string, b: string) => b.localeCompare(a);
  const monthLabel = (prefix: string, month: string) =>
    month === "-" ? prefix : `${prefix} — ${format(new Date(`${month}-01T00:00:00`), "MMM yyyy")}`;

  const projectDemands = active.filter((d) => d.origin_type === "Project");
  const taktUpDemands = active.filter((d) => d.origin_type === "TaktUp");
  const pkwtDemands = active.filter((d) => d.origin_type === "PkwtTerminate");
  const vokasiDemands = active.filter((d) => d.origin_type === "VokasiEnded");
  const lainnyaTypes: DemandOriginType[] = ["Resign", "Pension", "PensionDini", "GST", "Unfit", "Others", "Manual"];
  const lainnyaDemands = active.filter((d) => lainnyaTypes.includes(d.origin_type));

  return [
    category(
      "project",
      "Project",
      "blue",
      projectDemands,
      batchesOf(
        projectDemands,
        (d) => d.origin_ref,
        (ref) => {
          const p = projects.find((x) => x.id === ref);
          return {
            label: p?.name ?? "Project",
            meta: p ? `SOP ${fmtDate(p.start_date)}` : undefined,
            href: p ? `/projects/${p.id}` : "/projects",
          };
        }
      )
    ),
    category(
      "taktup",
      "Takt Up",
      "blue",
      taktUpDemands,
      batchesOf(
        taktUpDemands,
        (d) => d.origin_ref,
        (ref) => {
          const t = taktCases.find((x) => x.id === ref);
          return { label: t ? `Takt Up — ${t.plant}` : "Takt Up", meta: t ? fmtDate(t.date) : undefined };
        }
      )
    ),
    category(
      "pkwt",
      "PKWT",
      "amber",
      pkwtDemands,
      batchesOf(
        pkwtDemands,
        (d) => demandTargetDate(d).slice(0, 7) || "-",
        (m) => ({ label: monthLabel("Enrollment PKWT", m) }),
        byMonthDesc
      )
    ),
    category(
      "vokasi",
      "Vokasi",
      "violet",
      vokasiDemands,
      batchesOf(
        vokasiDemands,
        (d) => demandTargetDate(d).slice(0, 7) || "-",
        (m) => ({ label: monthLabel("Vokasi Ended", m) }),
        byMonthDesc
      )
    ),
    category(
      "lainnya",
      "Lainnya",
      "slate",
      lainnyaDemands,
      batchesOf(
        lainnyaDemands,
        (d) => d.origin_type,
        (type) => ({ label: DEMAND_JENIS_LABEL[type as DemandOriginType] })
      )
    ),
  ];
}

export const SUPPLY_SOURCE_LABELS: Record<UtilPoolSource, string> = {
  ProjectFinish: "Project Selesai",
  TaktDown: "Takt Down",
  Kaizen: "Kaizen",
};

/** Jenis as shown to people: Kaizen splits by the labor group it was
 * declared under (A/F vs B/C); entries recorded before that existed stay
 * plain "Kaizen". */
export function jenisOf(e: UtilPoolEntry): string {
  if (e.source !== "Kaizen") return SUPPLY_SOURCE_LABELS[e.source];
  const group = kaizenLaborGroupOf(e.source_label);
  return group ? `Kaizen Labor ${group}` : "Kaizen";
}

/** ProjectFinish/Kaizen entries have no single owning record to group by —
 * source_label (e.g. "Kaizen 2026 Labor A/F - Assembly (activity)") is the closest
 * thing to a batch id, and there's no dedicated Edit/Hapus page for either,
 * so no href. Takt Down does have an owning TaktCase (and a real Edit/Hapus
 * page at /takt) — grouped by case id instead, since several Takt Down
 * cases at the same plant would otherwise collide on the same source_label
 * ("Takt Down Plant 1"). */
function tileByJenis(entries: UtilPoolEntry[], jenis: string, tone: BatchTileCategory["tone"]): BatchTileCategory {
  const sourceEntries = entries.filter((e) => jenisOf(e) === jenis);
  const openEntries = sourceEntries.filter((e) => e.status === "Open");
  const groups = new Map<string, UtilPoolEntry[]>();
  for (const e of sourceEntries) {
    const list = groups.get(e.source_label) ?? [];
    list.push(e);
    groups.set(e.source_label, list);
  }
  const batches = Array.from(groups.entries())
    .map(([label, list]) => ({
      id: label,
      label,
      meta: `${list.filter((e) => e.status === "Assigned").length} diutilize dari ${list.length}`,
      count: list.filter((e) => e.status === "Open").length,
      total: list.length,
    }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);
  return { key: jenis, label: jenis, count: openEntries.length, total: sourceEntries.length, tone, batches };
}

function tileForTaktDown(entries: UtilPoolEntry[], taktCases: TaktCase[]): BatchTileCategory {
  const downCases = taktCases.filter((c) => c.category === "down");
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const batches = downCases
    .map((c) => {
      const linked = c.released_pool_ids.map((id) => entryById.get(id)).filter((e): e is UtilPoolEntry => Boolean(e));
      return {
        id: c.id,
        label: `Takt Down — ${c.plant}`,
        meta: fmtDate(c.date),
        count: linked.filter((e) => e.status === "Open").length,
        total: linked.length,
        href: `/takt/${c.id}`,
      };
    })
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);
  const totalOpen = batches.reduce((sum, b) => sum + b.count, 0);
  const total = entries.filter((e) => e.source === "TaktDown").length;
  return { key: "TaktDown", label: SUPPLY_SOURCE_LABELS.TaktDown, count: totalOpen, total, tone: "blue", batches };
}

export function buildSupplyBatchCategories(entries: UtilPoolEntry[], taktCases: TaktCase[]): BatchTileCategory[] {
  const tiles = [
    tileForTaktDown(entries, taktCases),
    tileByJenis(entries, SUPPLY_SOURCE_LABELS.ProjectFinish, "violet"),
    tileByJenis(entries, "Kaizen Labor A/F", "green"),
    tileByJenis(entries, "Kaizen Labor B/C", "green"),
  ];
  // Pre-labor-group Kaizen entries only get a tile while any still exist.
  const legacyKaizen = tileByJenis(entries, "Kaizen", "green");
  return legacyKaizen.batches.length > 0 ? [...tiles, legacyKaizen] : tiles;
}
