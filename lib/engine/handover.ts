import { genId } from "../storage";
import { demandStore, handoverStore } from "../repo";
import type { HandoverForm, HandoverRow } from "../types";

function movementPeriod(demandTgl: string, fulfillDate: string): string {
  const src = demandTgl || fulfillDate;
  return src ? src.slice(0, 7) : "";
}

export function buildHandoverForm(dept: string, period: string): HandoverForm {
  const rows: HandoverRow[] = demandStore
    .list()
    .filter(
      (d) =>
        d.status === "Fulfilled" &&
        d.dept === dept &&
        movementPeriod(d.tgl_ended_outgoing, d.fulfill_date) === period
    )
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
