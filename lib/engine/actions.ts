// Orchestration / mutating business logic — the "engine" that keeps the
// Demand Pool, Enrollment, Project/Takt, and Utilization Pool consistent.
// See MTRACK_SPEC.md §11 (data flow) and §12 (business rules reference).
import { addDays, format, parseISO } from "date-fns";
import { genId } from "../storage";
import { demandTargetDate } from "./enrollment";
import {
  demandStore,
  pkwtReviewStore,
  projectStore,
  taktStore,
  utilPoolStore,
  valueMappingStore,
  vokasiStore,
  zparStore,
  getActiveSnapshot,
} from "../repo";
import { createClient } from "../supabase/client";
import { pushToast } from "../toast";
import { computeFsStatus, computeReviewDate, sisaHari, today } from "./compute";
import { KONTRAK_REVIEW_STATUSES, isPermanenForRatio, projectEndDate, rowReleaseDate } from "../types";
import type {
  Demand,
  DemandCategory,
  DemandOriginType,
  EmployeeRecord,
  EmploymentStatus,
  KaizenLaborGroup,
  MpStatusKategori,
  PkwtReview,
  Project,
  ProjectMpNeedRow,
  ReplacementStatus,
  ReviewResult,
  TaktCase,
  TaktDownPerson,
  TaktDownPlanRow,
  UtilPoolEntry,
  VokasiRecord,
} from "../types";

// ---------------------------------------------------------------------------
// Upload Center — scoped delete (per snapshot / per batch, not "delete all")
// ---------------------------------------------------------------------------

export interface DeleteResult {
  ok: boolean;
  error?: string;
}

/** Refuses to delete the Active snapshot — every other page reads from it,
 * so silently leaving nothing active (or auto-picking a replacement) would
 * be a worse surprise than just asking the admin to activate another
 * period first. */
export function deleteZparSnapshot(id: string): DeleteResult {
  const snapshot = zparStore.get(id);
  if (!snapshot) return { ok: false, error: "Snapshot tidak ditemukan." };
  if (snapshot.is_active) {
    return { ok: false, error: "Tidak bisa menghapus snapshot yang sedang Active — aktifkan periode lain dulu." };
  }
  zparStore.remove(id);
  return { ok: true };
}

/** Refuses to delete a Vokasi batch once any of its records already
 * produced a VokasiEnded demand (ensureVokasiEndedDemands) — deleting the
 * source record out from under a live demand would orphan it. */
export function deleteVokasiBatch(batch: string): DeleteResult {
  const records = vokasiStore.list().filter((v) => v.batch === batch);
  if (records.length === 0) return { ok: false, error: "Batch tidak ditemukan." };
  const recordIds = new Set(records.map((r) => r.id));
  pruneStaleVokasiDemands();
  const hasLinkedDemand = demandStore.list().some((d) => d.origin_type === "VokasiEnded" && recordIds.has(d.origin_ref));
  if (hasLinkedDemand) {
    return { ok: false, error: "Batch ini sudah menghasilkan demand replacement, tidak bisa dihapus." };
  }
  for (const r of records) vokasiStore.remove(r.id);
  return { ok: true };
}

export function mapMpStatusToDemandCategory(status: MpStatusKategori): DemandCategory {
  return status === "Vokasi" ? "Vokasi" : "PKWT";
}

export function getActiveEmployeeByNoreg(noreg: string): EmployeeRecord | undefined {
  const snap = getActiveSnapshot();
  return snap?.employees.find((e) => e.noreg === noreg);
}

export function getVokasiByNoreg(noreg: string): VokasiRecord | undefined {
  const matches = vokasiStore.list().filter((v) => v.noreg === noreg);
  if (matches.length === 0) return undefined;
  return matches.sort((a, b) => b.upload_date.localeCompare(a.upload_date))[0];
}

/** Employment status of a noreg — Vokasi db takes precedence, else derived from ZPAR contract status. */
export function getEmploymentStatus(noreg: string): EmploymentStatus {
  if (!noreg) return "";
  if (getVokasiByNoreg(noreg)) return "Vokasi";
  const emp = getActiveEmployeeByNoreg(noreg);
  if (!emp) return "";
  return isPermanenForRatio(emp.status_kontrak) ? "Permanen" : "Kontrak";
}

// ---------------------------------------------------------------------------
// Demand creation
// ---------------------------------------------------------------------------

function baseDemand(overrides: Partial<Demand>): Demand {
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

function monthStartKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Supply Pool sources that release a person for good — a Vokasi released
 * this way leaves naturally at the end of their batch, so their seat is not
 * backfilled. */
const NATURAL_RELEASE_SOURCES: UtilPoolEntry["source"][] = ["TaktDown", "Kaizen"];

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
function applyVokasiNaturalRelease(entry: UtilPoolEntry): void {
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
function revertVokasiNaturalRelease(noreg: string, removedEntryId: string): void {
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

function removePoolEntry(entry: UtilPoolEntry): void {
  utilPoolStore.remove(entry.id);
  if (entry.type === "Vokasi" && NATURAL_RELEASE_SOURCES.includes(entry.source)) {
    revertVokasiNaturalRelease(entry.noreg, entry.id);
  }
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

// ---------------------------------------------------------------------------
// PKWT Review generation & terminate -> demand
// ---------------------------------------------------------------------------

export interface PkwtReviewRun {
  /** Active snapshot period the run read, or null when none is active. */
  period: string | null;
  /** Kontrak 1.1 / 1.2 / 2 employees in that snapshot. */
  eligible: number;
  /** Of those, how many have no readable Tgl Masuk (no review date). */
  noTglMasuk: number;
  created: number;
  error?: string;
}

/** Creates the PKWT review for every Kontrak 1.1/1.2/2 employee of the
 * active snapshot that doesn't have one yet (idempotent). Resolves once
 * Supabase has the rows; an insert failure is surfaced as a toast instead
 * of only reaching the console, since it otherwise leaves the review chart
 * empty with no hint why. */
export async function generatePkwtReviews(): Promise<PkwtReviewRun> {
  const snap = getActiveSnapshot();
  if (!snap) return { period: null, eligible: 0, noTglMasuk: 0, created: 0 };
  const existing = new Set(pkwtReviewStore.list().map((r) => `${r.noreg}|${r.tgl_review}`));
  const toCreate: PkwtReview[] = [];
  let eligible = 0;
  let noTglMasuk = 0;
  for (const emp of snap.employees) {
    if (!KONTRAK_REVIEW_STATUSES.includes(emp.status_kontrak)) continue;
    eligible++;
    // A blank/unreadable Tgl Masuk has no review date — skipping it keeps one
    // bad row from throwing (date-fns) or failing the whole batch insert
    // (Postgres rejects "" for a date column).
    const tgl_review = computeReviewDate(emp.tgl_masuk, emp.status_kontrak);
    if (!tgl_review) {
      noTglMasuk++;
      continue;
    }
    const key = `${emp.noreg}|${tgl_review}`;
    if (existing.has(key)) continue; // keep as-is (preserves review_result / demand_id)
    existing.add(key);
    toCreate.push({
      id: genId("pkwtrev"),
      noreg: emp.noreg,
      nama: emp.nama,
      status_kontrak: emp.status_kontrak,
      div: emp.division,
      dept: emp.dept,
      tgl_masuk: emp.tgl_masuk,
      tgl_review,
      review_result: "" as ReviewResult,
      labor_type: emp.labor_type,
    });
  }
  const base = { period: snap.period, eligible, noTglMasuk };
  if (toCreate.length === 0) return { ...base, created: 0 };
  // One insertMany call, not one insert per employee: hundreds of
  // concurrent requests risked partial failures (see set_review_result).
  const error = await pkwtReviewStore.insertManyPersisted(toCreate);
  if (error) {
    pkwtReviewStore.refetch();
    pushToast(`Gagal membuat review PKWT: ${error}`);
    return { ...base, created: 0, error };
  }
  return { ...base, created: toCreate.length };
}

/**
 * Routed through the `set_review_result` Postgres RPC (see supabase/schema.sql)
 * so the Admin/HR-only rule is enforced in the database, not just the UI.
 * Applies an optimistic local update immediately (the RPC bypasses the
 * generic Store.update() write path, so without this the UI only reflects
 * the change once a realtime event arrives) and reverts + surfaces the
 * error if the RPC itself is rejected (e.g. a role/permission mismatch).
 */
export function setReviewResult(reviewId: string, result: ReviewResult): void {
  const previous = pkwtReviewStore.get(reviewId)?.review_result;
  pkwtReviewStore.update(reviewId, { review_result: result });
  const supabase = createClient();
  supabase
    .rpc("set_review_result", { p_review_id: reviewId, p_result: result })
    .then((res: { error: { message: string } | null }) => {
      if (res.error) {
        console.error("set_review_result failed:", res.error.message);
        pkwtReviewStore.update(reviewId, { review_result: previous ?? "" });
        pushToast(`Gagal menyimpan review result: ${res.error.message}`);
        return;
      }
      // On Terminate, the RPC creates a new Demand server-side — the client
      // never inserted it locally, so without this the new "PKWT Demand" row
      // only shows up once/if a realtime event arrives. Re-fetch instead of
      // waiting on that.
      if (result === "Terminate") demandStore.refetch();
    });
}

// ---------------------------------------------------------------------------
// Replacement linking (Enrollment)
// ---------------------------------------------------------------------------

/**
 * Routed through the `set_demand_replacement` Postgres RPC (see
 * supabase/schema.sql) — Admin may fill any category, Shop only PKWT — so
 * the rule holds even if the UI is bypassed. The local cache updates
 * shortly after via the realtime subscription.
 *
 * `replacementStatus` only applies to the Kontrak (PKWT) tab's "PKWT New
 * Hire / MP Excess / MP Back Up" flow; the Vokasi tab leaves it "".
 */
export function setDemandReplacementByNoreg(
  demandId: string,
  noreg: string,
  replacementStatus: ReplacementStatus = ""
): void {
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
  demandStore.update(demandId, { shop_confirmed_date: confirmedDate });
  const supabase = createClient();
  supabase
    .rpc("confirm_shop_receipt", { p_demand_id: demandId, p_confirmed_date: confirmedDate || null })
    .then((res: { error: { message: string } | null }) => {
      if (res.error) {
        console.error("confirm_shop_receipt failed:", res.error.message);
        demandStore.update(demandId, { shop_confirmed_date: previous.shop_confirmed_date });
        pushToast(`Gagal konfirmasi shop: ${res.error.message}`);
        return;
      }
      demandStore.refetch();
    });
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

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

/** Best-effort contract end date for a person, used for Util Pool eligibility & display. */
export function estimateContractEnd(noreg: string, type: MpStatusKategori): string | null {
  if (type === "Permanen") return null;
  const vokasi = getVokasiByNoreg(noreg);
  if (vokasi?.tgl_ended) return vokasi.tgl_ended;
  const emp = getActiveEmployeeByNoreg(noreg);
  if (emp && !isPermanenForRatio(emp.status_kontrak)) {
    return computeReviewDate(emp.tgl_masuk, emp.status_kontrak) || null;
  }
  return null;
}

/** Registers a project from its name, Tanggal SOP and MP need-rows. Each
 * row carries its own release (date or No Release); end_date is derived. */
export function createProject(input: {
  name: string;
  sop_date: string;
  rows: Omit<ProjectMpNeedRow, "id">[];
}): Project {
  const project: Project = {
    id: genId("project"),
    name: input.name,
    start_date: input.sop_date,
    end_date: projectEndDate(input.rows, input.sop_date),
    status: "Ongoing",
    rows: input.rows.map((r) => ({ ...r, id: genId("row") })),
    demand_ids: [],
  };
  projectStore.insert(project);
  const rows = project.rows.map((row) => ({ ...row, demand_ids: createDemandsFromProjectRow(project, row).map((d) => d.id) }));
  return projectStore.update(project.id, { rows, demand_ids: rows.flatMap((r) => r.demand_ids) })!;
}

/** The need-row a project demand was expanded from. Rows record their own
 * demand ids; older projects predate that, so fall back to the first row
 * with the same division, department and MP status. */
export function projectRowOfDemand(project: Project, demand: Demand): ProjectMpNeedRow | undefined {
  return (
    project.rows.find((r) => r.demand_ids?.includes(demand.id)) ??
    project.rows.find(
      (r) => !r.demand_ids && r.division === demand.div && r.dept === demand.dept && mapMpStatusToDemandCategory(r.status_mp) === demand.category
    )
  );
}

/** Everyone who has held one project seat, in order: the person mapped to
 * the project demand, then whoever filled the replacement demand raised
 * when that person's contract ended (Vokasi Ended / PKWT Terminate), and so
 * on. Only verified (Fulfilled) fills count. */
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
function holderNoregs(d: Demand): string[] {
  if (!isRehiredAlumnus(d)) return [d.replacement_noreg];
  const linked = linkedZparNoreg(d.replacement_noreg);
  return linked && linked !== d.replacement_noreg ? [d.replacement_noreg, linked] : [d.replacement_noreg];
}

export function projectSeatOccupants(seat: Demand, demands: Demand[] = demandStore.list()): Demand[] {
  const chain: Demand[] = [];
  const seen = new Set<string>();
  let current: Demand | undefined = seat;
  while (current && current.status === "Fulfilled" && current.replacement_noreg && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    const rehired = isRehiredAlumnus(current);
    const noregs = holderNoregs(current);
    // A rehired alumnus is replaced when their PKWT review ends in
    // Terminate — under the new noreg — never via their old Vokasi record.
    current = demands.find(
      (d) =>
        noregs.includes(d.outgoing_noreg) &&
        (d.origin_type === "PkwtTerminate" || (d.origin_type === "VokasiEnded" && !rehired))
    );
  }
  return chain;
}

const pendingProjectNoReplace = new Set<string>();

/** Keeps the replacement demands of project seats in line with each row's
 * release. When a Vokasi holding a seat ends before the row's release date,
 * their Vokasi Ended demand is the seat's next fill (labelled with the
 * project). When they end on/after it, the seat is not refilled, so that
 * demand becomes No Replace. No Release rows keep the regular cycle.
 * Idempotent; call when demands or projects may have changed. */
export function syncProjectSeatDemands(): void {
  const demands = demandStore.list();
  for (const project of projectStore.list()) {
    const label = `Project ${project.name}`;
    for (const seat of demands.filter((d) => d.origin_type === "Project" && d.origin_ref === project.id)) {
      const row = projectRowOfDemand(project, seat);
      const releaseDate = row ? rowReleaseDate(row, project) : null;
      for (const holder of projectSeatOccupants(seat, demands)) {
        if (isRehiredAlumnus(holder)) continue;
        const next = demands.find((d) => d.origin_type === "VokasiEnded" && d.outgoing_noreg === holder.replacement_noreg);
        if (!next) continue;
        if (!next.outgoing_label) demandStore.update(next.id, { outgoing_label: label });
        if (
          releaseDate &&
          next.tgl_ended_outgoing >= releaseDate &&
          next.replacement_status !== "No Replace" &&
          !next.fulfillment_confirmed_date &&
          !pendingProjectNoReplace.has(next.id)
        ) {
          pendingProjectNoReplace.add(next.id);
          setDemandNoReplace(next.id, `Rilis projek ${project.name} ${releaseDate}`);
        }
      }
    }
  }
}

export function projectSuppliedCount(project: Project): number {
  return demandStore.list().filter((d) => project.demand_ids.includes(d.id) && d.status === "Fulfilled").length;
}

/** Edit-after-registration: name/Tanggal SOP only — rows/demands are handled
 * by addProjectRow / increaseProjectRowQty / updateProjectRowRelease below,
 * which never delete or shrink existing demand records (only additive
 * changes are safe post-registration). */
export function updateProjectDetails(projectId: string, input: { name?: string; sop_date?: string }): void {
  const project = projectStore.get(projectId);
  if (!project) return;
  const sop = input.sop_date ?? project.start_date;
  projectStore.update(projectId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    start_date: sop,
    end_date: projectEndDate(project.rows, sop),
  });
}

/** Changes a registered row's release (date or No Release) until it has
 * actually been released, then re-syncs its seats' replacement demands. */
export function updateProjectRowRelease(projectId: string, rowId: string, release: { release_date: string; no_release: boolean }): void {
  const project = projectStore.get(projectId);
  const row = project?.rows.find((r) => r.id === rowId);
  if (!project || !row || row.released) return;
  if (row.no_release === release.no_release && (row.release_date ?? "") === release.release_date) return;
  const rows = project.rows.map((r) => (r.id === rowId ? { ...r, ...release } : r));
  projectStore.update(projectId, { rows, end_date: projectEndDate(rows, project.start_date) });
  syncProjectSeatDemands();
}

/** Adds a brand-new MP need row to an already-registered project, expanding
 * it into demand records immediately (same as at creation time). Always
 * re-reads the project from the store so sequential calls in a loop don't
 * clobber each other's row/demand_ids updates. */
export function addProjectRow(projectId: string, row: Omit<ProjectMpNeedRow, "id">): void {
  const project = projectStore.get(projectId);
  if (!project) return;
  const newRow: ProjectMpNeedRow = { ...row, id: genId("row") };
  const created = createDemandsFromProjectRow({ ...project, rows: [...project.rows, newRow] }, newRow);
  const updatedRows = [...project.rows, { ...newRow, demand_ids: created.map((d) => d.id) }];
  projectStore.update(projectId, { rows: updatedRows, demand_ids: [...project.demand_ids, ...created.map((d) => d.id)] });
}

/** Increases an existing row's qty, creating demand records only for the
 * delta. Decreasing qty is intentionally not supported here — it would mean
 * silently deleting demand records that may already be Fulfilled. */
export function increaseProjectRowQty(projectId: string, rowId: string, newQty: number): void {
  const project = projectStore.get(projectId);
  if (!project) return;
  const row = project.rows.find((r) => r.id === rowId);
  if (!row || newQty <= row.qty) return;
  const delta = newQty - row.qty;
  const created = expandRowToDemands({ ...row, qty: delta }, "Project", project.id, project.name);
  const updatedRows = project.rows.map((r) =>
    r.id === rowId ? { ...r, qty: newQty, ...(r.demand_ids ? { demand_ids: [...r.demand_ids, ...created.map((d) => d.id)] } : {}) } : r
  );
  projectStore.update(projectId, { rows: updatedRows, demand_ids: [...project.demand_ids, ...created.map((d) => d.id)] });
}

/**
 * Deletes a project. Same safety invariant as deleteTaktDown: a demand it
 * generated that's still Open (no candidate mapped yet) is cleaned up with
 * it, but one already Fulfilled is left standing on its own — deleting the
 * project never erases a real, already-completed assignment.
 */
export function deleteProject(projectId: string): boolean {
  const project = projectStore.get(projectId);
  if (!project) return false;

  for (const demandId of project.demand_ids) {
    const demand = demandStore.get(demandId);
    if (demand && isEditableDemand(demand)) demandStore.remove(demandId);
  }
  projectStore.remove(projectId);
  return true;
}

// ---------------------------------------------------------------------------
// Editing / deleting registered inputs (Project, Takt Up, Manual, Kaizen)
// ---------------------------------------------------------------------------

/** A demand nobody has acted on yet — no candidate, nothing verified or
 * received. Only these are reshaped or removed when an input is edited or
 * deleted; anything in progress stays as it is. */
export function isEditableDemand(d: Demand): boolean {
  return d.status !== "Fulfilled" && !d.replacement_noreg && !d.fulfillment_confirmed_date && !d.shop_confirmed_date;
}

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
function reconcileNeedRows(
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
      if (locked > 0) return { ok: false, error: `Baris ${describe(prev)} sudah punya ${locked} kandidat/pemenuhan, tidak bisa dihapus.` };
      continue;
    }
    if (next.qty < locked) return { ok: false, error: `Qty ${describe(prev)} minimal ${locked} (sudah punya kandidat/pemenuhan).` };
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

/** Full edit of a registered project: name, Tanggal SOP and every need
 * row (see reconcileNeedRows). Returns an error message when refused. */
export function updateProject(projectId: string, input: { name: string; sop_date: string; rows: NeedRowDraft[] }): string | null {
  const project = projectStore.get(projectId);
  if (!project) return "Project tidak ditemukan.";
  const rowsIn = input.rows.map((r) => {
    const prev = r.id ? project.rows.find((p) => p.id === r.id) : undefined;
    return prev?.released ? { ...r, release_date: prev.release_date, no_release: prev.no_release, released: true } : r;
  });
  const result = reconcileNeedRows(project.rows, project.demand_ids, rowsIn, "Project", project.id, () => input.name);
  if (!result.ok) return result.error;
  projectStore.update(projectId, {
    name: input.name,
    start_date: input.sop_date,
    end_date: projectEndDate(result.rows, input.sop_date),
    rows: result.rows,
    demand_ids: result.demandIds,
  });
  syncProjectSeatDemands();
  return null;
}

export function updateTaktUp(
  taktId: string,
  input: { plant: TaktCase["plant"]; date: string; takt_before: number; takt_after: number; rows: NeedRowDraft[] }
): string | null {
  const takt = taktStore.get(taktId);
  if (!takt || takt.category !== "up") return "Takt Up tidak ditemukan.";
  const result = reconcileNeedRows(takt.need_rows ?? [], takt.demand_ids, input.rows, "TaktUp", takt.id, (row) =>
    `Takt Up ${input.plant} - ${row.division} - ${row.dept}`
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

const KAIZEN_LABEL = /^Kaizen (\d{4}) Labor (\S+) - (.*) \((.*)\)$/;

/** Parts of a Kaizen batch label ("Kaizen 2026 Labor A/F - Div (activity)"). */
export function parseKaizenLabel(label: string): { year: string; group: string; div: string; activity: string } | null {
  const m = KAIZEN_LABEL.exec(label);
  return m ? { year: m[1], group: m[2], div: m[3], activity: m[4] } : null;
}

/** Renames a Kaizen batch's activity and moves its release date. People
 * already utilized keep their entry as it is, except for the label, so the
 * batch stays one group. */
export function updateKaizenBatch(label: string, input: { activity: string; releaseDate: string }): string | null {
  const parts = parseKaizenLabel(label);
  if (!parts) return "Batch Kaizen tidak dikenali.";
  const entries = utilPoolStore.list().filter((e) => e.source === "Kaizen" && e.source_label === label);
  if (entries.length === 0) return "Batch Kaizen tidak ditemukan.";
  const nextLabel = `Kaizen ${input.releaseDate.slice(0, 4) || parts.year} Labor ${parts.group} - ${parts.div} (${input.activity})`;
  for (const e of entries) {
    utilPoolStore.update(e.id, {
      source_label: nextLabel,
      ...(e.status === "Open" && input.releaseDate ? { entered_pool_date: input.releaseDate } : {}),
    });
  }
  return null;
}

/** Takes one person back out of a Kaizen batch while still Open. */
export function removeKaizenPerson(entryId: string): string | null {
  const e = utilPoolStore.get(entryId);
  if (!e || e.source !== "Kaizen") return "Data tidak ditemukan.";
  if (e.status !== "Open") return "Sudah diutilize, tidak bisa dihapus.";
  removePoolEntry(e);
  return null;
}

/** Deletes a Kaizen batch: Open people are removed; anyone already
 * utilized stays in the pool. Returns how many were kept. */
export function deleteKaizenBatch(label: string): number {
  let kept = 0;
  for (const e of utilPoolStore.list().filter((x) => x.source === "Kaizen" && x.source_label === label)) {
    if (e.status === "Open") removePoolEntry(e);
    else kept++;
  }
  return kept;
}

/** §7 / §12 project releases, run when Demand/Supply/Project pages open
 * (admin). Each row is released on its own date: whoever holds each of its
 * seats at that point (the last verified fill in the seat's chain) goes to
 * Supply Pool as MP Excess if their contract is still running. No Release
 * rows are never released — they carry on as regular enrollment.
 *
 * A project counts as Finish (History) once nothing about it is pending in
 * either menu: every release date has passed, every demand it raised is
 * fulfilled (or No Replace), and everyone it released has been utilized. */
export function autoProjectFinishCheck(): void {
  // Releasing marks rows as done for good — never do it against a cache
  // that hasn't loaded yet (it would release nobody and still mark them).
  const needed = [projectStore, demandStore, utilPoolStore, vokasiStore, zparStore, valueMappingStore];
  needed.forEach((store) => store.init());
  if (!needed.every((store) => store.ready())) return;
  const demands = demandStore.list();
  linkRehiredAlumni();
  syncRehiredPoolEntries();
  for (const project of projectStore.list()) {
    const seats = demands.filter((d) => project.demand_ids.includes(d.id));

    let releasedAny = false;
    let pushedAny = false;
    const rows = project.rows.map((row) => {
      const releaseDate = rowReleaseDate(row, project);
      if (!releaseDate || sisaHari(releaseDate) > 0) return row;
      // Released rows are re-checked too (releasing is idempotent): a holder
      // missed earlier — e.g. a rehired alumnus looked up under their old
      // Vokasi noreg — still lands in the pool.
      for (const seat of seats.filter((d) => projectRowOfDemand(project, d)?.id === row.id)) {
        if (releaseSeatHolder(project, seat, demands, releaseDate)) pushedAny = true;
      }
      if (row.released) return row;
      releasedAny = true;
      return { ...row, released: true };
    });
    if (releasedAny) projectStore.update(project.id, { rows });

    const allReleased = rows.every((r) => r.released || !rowReleaseDate(r, project));
    const allFulfilled = seats.every((d) => d.status === "Fulfilled" || d.replacement_status === "No Replace");
    const allUtilized = !utilPoolStore
      .list()
      .some((e) => e.source === "ProjectFinish" && e.source_label === project.name && e.status === "Open");
    const status = allReleased && allFulfilled && allUtilized ? "Finish" : "Ongoing";
    if (project.status !== status && (status === "Finish" || pushedAny)) projectStore.update(project.id, { status });
  }
  syncProjectSeatDemands();
}

const PENDING_NOREG_NOTE = "Noreg Vokasi — noreg ZPAR baru belum dikonfirmasi";

/** Puts a released seat's current holder into Supply Pool as MP Excess
 * while their contract still runs. A rehired alumnus is released as PKWT
 * under their new ZPAR noreg (their old Vokasi end date says nothing about
 * the PKWT contract); if the new ZPAR isn't in yet they go in under the old
 * noreg with a note, and syncRehiredPoolEntries swaps it later. Does
 * nothing if this project already released them. Returns whether an entry
 * was added. */
function releaseSeatHolder(project: Project, seat: Demand, demands: Demand[], releaseDate: string): boolean {
  const holder = projectSeatOccupants(seat, demands).at(-1);
  if (!holder) return false;
  const rehired = isRehiredAlumnus(holder);
  const emp = rehired ? findRehiredEmployee(holder.replacement_noreg) : getActiveEmployeeByNoreg(holder.replacement_noreg);
  const linked = rehired ? linkedZparNoreg(holder.replacement_noreg) : undefined;
  const noregs = [holder.replacement_noreg, ...(linked ? [linked] : []), ...(emp ? [emp.noreg] : [])];
  const alreadyIn = utilPoolStore
    .list()
    .some((e) => e.source === "ProjectFinish" && e.source_label === project.name && noregs.includes(e.noreg));
  if (alreadyIn) return false;

  let type: MpStatusKategori;
  let contractEnd: string | null;
  if (rehired) {
    type = emp && isPermanenForRatio(emp.status_kontrak) ? "Permanen" : "PKWT";
    contractEnd = emp && !isPermanenForRatio(emp.status_kontrak) ? computeReviewDate(emp.tgl_masuk, emp.status_kontrak) || null : null;
  } else {
    const employment = getEmploymentStatus(holder.replacement_noreg);
    type =
      employment === "Vokasi" || (!employment && (holder.replacement_status === "Vokasi New Hire" || holder.replacement_batch))
        ? "Vokasi"
        : employment === "Permanen"
          ? "Permanen"
          : "PKWT";
    contractEnd = estimateContractEnd(holder.replacement_noreg, type);
  }
  if (contractEnd !== null && sisaHari(contractEnd) < 0) return false;
  pushToUtilPool({
    noreg: emp?.noreg ?? holder.replacement_noreg,
    nama: emp?.nama ?? holder.replacement_nama,
    type,
    source: "ProjectFinish",
    source_label: project.name,
    prev_div: seat.div,
    prev_dept: seat.dept,
    contract_end: contractEnd,
    entered_pool_date: releaseDate,
    action_note: rehired && !emp ? PENDING_NOREG_NOTE : "",
  });
  return true;
}

/** Pool entries released under an alumnus' old Vokasi noreg switch to
 * their new ZPAR noreg, name and PKWT contract end once that ZPAR is in. */
function syncRehiredPoolEntries(): void {
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

// ---------------------------------------------------------------------------
// Takt Time
// ---------------------------------------------------------------------------

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
  const needRows = (takt.need_rows ?? []).map((row) => ({ ...row, demand_ids: createDemandsFromTaktRow(takt, row).map((d) => d.id) }));
  return taktStore.update(takt.id, { need_rows: needRows, demand_ids: needRows.flatMap((r) => r.demand_ids) })!;
}

/** The plan row a released person's composition matches (division + dept +
 * status), used to carry that row's planned release_date onto the Supply
 * Pool entry created for them — the same relationship
 * ProjectMpNeedRow.fulfill_date has to the Demands it expands into. Falls
 * back to the case's own date when a person doesn't line up with any row
 * (e.g. added via bulk/search without a matching plan entry). */
function releaseDateFor(person: TaktDownPerson, planRows: TaktDownPlanRow[], fallbackDate: string): string {
  const row = planRows.find(
    (r) => r.division === person.div && r.dept === person.dept && r.status_mp === person.type
  );
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

// ---------------------------------------------------------------------------
// Utilization Pool
// ---------------------------------------------------------------------------

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
