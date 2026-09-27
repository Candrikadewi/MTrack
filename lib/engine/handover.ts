import { genId } from "../storage";
import { demandStore, handoverStore } from "../repo";
import type { HandoverForm, HandoverRow } from "../types";
import { beforeWorkingSet, monthBounds } from "../history";

function movementPeriod(demandTgl: string, fulfillDate: string): string {
  const src = demandTgl || fulfillDate;
  return src ? src.slice(0, 7) : "";
}

/** A handover form for a department and month from its fulfilled demands.
 * A month older than the working set is read from the database first. */
export async function buildHandoverForm(dept: string, period: string): Promise<HandoverForm> {
  if (!demandStore.complete() && beforeWorkingSet(period)) {
    const { start, end } = monthBounds(period);
    await demandStore.fetchWhere((q) =>
      q
        .eq("dept", dept)
        .eq("status", "Fulfilled")
        .or(
          `and(tgl_ended_outgoing.gte.${start},tgl_ended_outgoing.lte.${end}),and(fulfill_date.gte.${start},fulfill_date.lte.${end})`
        )
    );
  }
  const rows: HandoverRow[] = demandStore
    .list()
    .filter((d) => d.status === "Fulfilled" && d.dept === dept && movementPeriod(d.tgl_ended_outgoing, d.fulfill_date) === period)
    .map((d, idx) => ({
      id: genId("hrow"),
      no: idx + 1,
      tipe_movement: d.category === "Vokasi" ? "Vokasi Ended" : "PKWT Terminate",
      outgoing: d.outgoing_nama || d.outgoing_label,
      incoming: d.replacement_nama,
      labor_type: d.category,
      alasan: d.origin_type,
      tanggal: d.fulfill_date || d.tgl_ended_outgoing,
      demand_id: d.id,
    }));

  const form: HandoverForm = {
    id: genId("handover"),
    dept,
    period,
    status: "Draft",
    rows,
    created_at: new Date().toISOString(),
  };
  handoverStore.insert(form);
  return form;
}

export function finalizeHandoverForm(id: string): void {
  handoverStore.update(id, { status: "Completed" });
}
