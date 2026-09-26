// Filling a demand: mapping a candidate, No Replace, the fulfilment date, verification
// (contract signed / assigned) and the shop's confirmation.
import { demandStore } from "../../repo";
import { createClient } from "../../supabase/client";
import { pushToast } from "../../toast";
import { computeFsStatus } from "../compute";
import type { EmploymentStatus, ReplacementStatus } from "../../types";
import { getActiveEmployeeByNoreg, getVokasiByNoreg, getEmploymentStatus } from "./people";
import { syncProjectSeatDemands } from "./projects";

/**
 * Routed through the `set_demand_replacement` Postgres RPC (see
 * supabase/schema.sql) — Admin may fill any category, Shop only PKWT — so
 * the rule holds even if the UI is bypassed. The local cache updates
 * shortly after via the realtime subscription.
 *
 * `replacementStatus` only applies to the Kontrak (PKWT) tab's "PKWT New
 * Hire / MP Excess / MP Back Up" flow; the Vokasi tab leaves it "".
 */
export function setDemandReplacementByNoreg(demandId: string, noreg: string, replacementStatus: ReplacementStatus = ""): void {
  const demand = demandStore.get(demandId);
  if (!demand) return;

  let nama = "";
  let dept = "";
  let batch = "";
  let tglMasuk: string | null = null;
  let fs_status = "";
  let employmentStatus: EmploymentStatus = "";

  if (noreg) {
    const vokasi = getVokasiByNoreg(noreg);
    const emp = vokasi ? undefined : getActiveEmployeeByNoreg(noreg);
    nama = vokasi?.nama ?? emp?.nama ?? "";
    dept = vokasi?.dept ?? emp?.dept ?? "";
    batch = vokasi?.batch ?? "";
    tglMasuk = vokasi?.tgl_masuk ?? emp?.tgl_masuk ?? null;
    fs_status = computeFsStatus(replacementStatus, demand.dept, dept, vokasi?.tgl_ended);
    // A PKWT New Hire is Kontrak even when mapped with their Vokasi noreg.
    employmentStatus = replacementStatus === "PKWT New Hire" ? "Kontrak" : getEmploymentStatus(noreg);
  }

  const supabase = createClient();
  supabase
    .rpc("set_demand_replacement", {
      p_demand_id: demandId,
      p_replacement_status: replacementStatus,
      p_noreg: noreg,
      p_nama: nama,
      p_batch: batch,
      p_tgl_masuk: tglMasuk,
      p_dept: dept,
      p_fs_status: fs_status,
      p_employment_status: employmentStatus,
      p_no_replace_reason: "",
    })
    .then((res: { error: { message: string } | null }) => {
      if (res.error) {
        console.error("set_demand_replacement failed:", res.error.message);
        pushToast(`Gagal menyimpan replacement: ${res.error.message}`);
        return;
      }
      demandStore.refetch();
    });
}

/** Kontrak tab "No Replace" path — clears any replacement info, records the reason. */
export function setDemandNoReplace(demandId: string, reason: string): void {
  const supabase = createClient();
  supabase
    .rpc("set_demand_replacement", {
      p_demand_id: demandId,
      p_replacement_status: "No Replace",
      p_noreg: "",
      p_nama: "",
      p_batch: "",
      p_tgl_masuk: null,
      p_dept: "",
      p_fs_status: "",
      p_employment_status: "",
      p_no_replace_reason: reason,
    })
    .then((res: { error: { message: string } | null }) => {
      if (res.error) {
        console.error("set_demand_replacement (no replace) failed:", res.error.message);
        pushToast(`Gagal menyimpan replacement: ${res.error.message}`);
        return;
      }
      demandStore.refetch();
    });
}

export function setDemandFulfillDate(demandId: string, date: string): void {
  demandStore.update(demandId, { fulfill_date: date });
}

/**
 * Supply-Demand: confirms a mapped candidate actually signed contract (new
 * hire) or was officially assigned to the destination department (MP Back
 * Up/Excess) — separate from `setDemandReplacementByNoreg`, which only maps
 * who the candidate is. Passing an empty date un-confirms it. Routed through
 * `confirm_demand_fulfillment` (see supabase/migration_4.sql) so the same
 * admin/shop-PKWT rule as replacement-mapping is enforced server-side.
 */
export function confirmDemandFulfillment(demandId: string, confirmedDate: string): void {
  const previous = demandStore.get(demandId);
  if (!previous) return;
  demandStore.patchLocal(demandId, {
    fulfillment_confirmed_date: confirmedDate,
    status: confirmedDate ? "Fulfilled" : "Open",
  });
  const supabase = createClient();
  supabase
    .rpc("confirm_demand_fulfillment", { p_demand_id: demandId, p_confirmed_date: confirmedDate || null })
    .then((res: { error: { message: string } | null }) => {
      if (res.error) {
        console.error("confirm_demand_fulfillment failed:", res.error.message);
        demandStore.patchLocal(demandId, {
          fulfillment_confirmed_date: previous.fulfillment_confirmed_date,
          status: previous.status,
        });
        pushToast(`Gagal verifikasi: ${res.error.message}`);
        return;
      }
      // A verified fill may extend a project seat's chain.
      if (confirmedDate) syncProjectSeatDemands();
      demandStore.refetch();
    });
}

/**
 * Supply-Demand: shop floor confirms the replacement candidate has actually
 * reported for duty — separate from `confirmDemandFulfillment` (Sign
 * Kontrak/Assigned), which only reflects the HR/admin paperwork step.
 * Passing an empty date un-confirms it. Routed through
 * `confirm_shop_receipt` (see supabase/migration_5.sql) so the same
 * admin/shop-PKWT rule as replacement-mapping is enforced server-side. Does
 * not touch `status`/`fulfillment_confirmed_date` — the granular
 * Open/DELAY/Need Replace ASAP/Fulfilled Ontime/Fulfilled but Delay label is
 * derived client-side (see `supplyDemandStatus` in compute.ts).
 */
export function confirmShopReceipt(demandId: string, confirmedDate: string): void {
  const previous = demandStore.get(demandId);
  if (!previous) return;
  demandStore.patchLocal(demandId, { shop_confirmed_date: confirmedDate });
  const supabase = createClient();
  supabase
    .rpc("confirm_shop_receipt", { p_demand_id: demandId, p_confirmed_date: confirmedDate || null })
    .then((res: { error: { message: string } | null }) => {
      if (res.error) {
        console.error("confirm_shop_receipt failed:", res.error.message);
        demandStore.patchLocal(demandId, { shop_confirmed_date: previous.shop_confirmed_date });
        pushToast(`Gagal konfirmasi shop: ${res.error.message}`);
        return;
      }
      demandStore.refetch();
    });
}
