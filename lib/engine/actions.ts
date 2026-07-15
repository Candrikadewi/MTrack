// Orchestration / mutating business logic — the "engine" that keeps the
// Demand Pool, Enrollment, Project/Takt, and Utilization Pool consistent.
// See MTRACK_SPEC.md §11 (data flow) and §12 (business rules reference).
import { genId } from "../storage";
import {
  demandStore,
  pkwtReviewStore,
  projectStore,
  taktStore,
  utilPoolStore,
  vokasiStore,
  getActiveSnapshot,
} from "../repo";
import { createClient } from "../supabase/client";
import { pushToast } from "../toast";
import { computeFsStatus, computeReviewDate, sisaHari, today } from "./compute";
import type {
  Demand,
  DemandCategory,
  DemandOriginType,
  EmployeeRecord,
  EmploymentStatus,
  MpStatusKategori,
  PkwtReview,
  Project,
  ProjectMpNeedRow,
  ReplacementStatus,
  ReviewResult,
  TaktCase,
  UtilPoolEntry,
  VokasiRecord,
} from "../types";

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
  return emp.status_kontrak === "Permanen" ? "Permanen" : "Kontrak";
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

export function createDemandsFromProjectRow(project: Project, row: ProjectMpNeedRow): Demand[] {
  return expandRowToDemands(row, "Project", project.id, project.name);
}

export function createDemandsFromTaktRow(takt: TaktCase, row: ProjectMpNeedRow): Demand[] {
  return expandRowToDemands(
    row,
    "TaktUp",
    takt.id,
    `Takt Up ${takt.plant} — ${row.division} — ${row.dept}`
  );
}

/** Ensures every VokasiRecord with a tgl_ended has exactly one Vokasi-category Demand. */
export function ensureVokasiEndedDemands(): void {
  const demands = demandStore.list();
  const existingRefs = new Set(demands.filter((d) => d.origin_type === "VokasiEnded").map((d) => d.origin_ref));
  const toCreate: Demand[] = [];
  for (const v of vokasiStore.list()) {
    if (!v.tgl_ended || existingRefs.has(v.id)) continue;
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
      })
    );
  }
  if (toCreate.length) demandStore.insertMany(toCreate);
}

export function createManualDemand(input: {
  category: DemandCategory;
  origin_type: Extract<DemandOriginType, "Resign" | "Pension" | "GST" | "Unfit" | "Others" | "Manual">;
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

export function generatePkwtReviews(): void {
  const snap = getActiveSnapshot();
  if (!snap) return;
  const existing = pkwtReviewStore.list();
  const kontrakTypes = new Set(["Kontrak 1.1", "Kontrak 1.2", "Kontrak 2"]);
  // Collected into one insertMany() call — firing one insert() per employee
  // (previously up to hundreds of concurrent requests) risked silent partial
  // failures where a review would show up locally (optimistic cache) but
  // never actually land in Supabase, later failing set_review_result with
  // "Review not found".
  const toCreate: PkwtReview[] = [];
  for (const emp of snap.employees) {
    if (!kontrakTypes.has(emp.status_kontrak)) continue;
    const tgl_review = computeReviewDate(emp.tgl_masuk, emp.status_kontrak);
    const prior = existing.find((r) => r.noreg === emp.noreg && r.tgl_review === tgl_review);
    if (prior) continue; // keep as-is (preserves review_result / demand_id)
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
  if (toCreate.length) pkwtReviewStore.insertMany(toCreate);
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
    fs_status = demand.category === "PKWT" ? computeFsStatus(demand.dept, dept, vokasi?.tgl_ended) : "";
    employmentStatus = getEmploymentStatus(noreg);
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

/** §4.2 auto-matching: new Vokasi batch upload -> fill Open Vokasi Demand of same dept. */
export function autoMatchVokasiBatch(newRecords: VokasiRecord[]): number {
  const usedNoreg = new Set(
    demandStore
      .list()
      .filter((d) => d.replacement_noreg)
      .map((d) => d.replacement_noreg)
  );
  const openDemands = demandStore
    .list()
    .filter((d) => d.category === "Vokasi" && d.status === "Open" && !d.replacement_noreg);

  let matched = 0;
  for (const demand of openDemands) {
    const candidate = newRecords.find((r) => r.dept === demand.dept && !usedNoreg.has(r.noreg));
    if (!candidate) continue;
    usedNoreg.add(candidate.noreg);
    setDemandReplacementByNoreg(demand.id, candidate.noreg);
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
  if (emp && emp.status_kontrak !== "Permanen") {
    return computeReviewDate(emp.tgl_masuk, emp.status_kontrak);
  }
  return null;
}

export function createProject(input: {
  name: string;
  start_date: string;
  end_date: string;
  rows: Omit<ProjectMpNeedRow, "id">[];
}): Project {
  const project: Project = {
    id: genId("project"),
    name: input.name,
    start_date: input.start_date,
    end_date: input.end_date,
    status: "Ongoing",
    rows: input.rows.map((r) => ({ ...r, id: genId("row") })),
    demand_ids: [],
  };
  projectStore.insert(project);
  const demandIds: string[] = [];
  for (const row of project.rows) {
    const created = createDemandsFromProjectRow(project, row);
    demandIds.push(...created.map((d) => d.id));
  }
  return projectStore.update(project.id, { demand_ids: demandIds })!;
}

export function projectSuppliedCount(project: Project): number {
  return demandStore.list().filter((d) => project.demand_ids.includes(d.id) && d.status === "Fulfilled").length;
}

/** Edit-after-registration: name/dates only — rows/demands are handled by
 * addProjectRow / increaseProjectRowQty below, which never delete or shrink
 * existing demand records (only additive changes are safe post-registration). */
export function updateProjectDetails(
  projectId: string,
  input: { name?: string; start_date?: string; end_date?: string }
): void {
  projectStore.update(projectId, input);
}

/** Adds a brand-new MP need row to an already-registered project, expanding
 * it into demand records immediately (same as at creation time). Always
 * re-reads the project from the store so sequential calls in a loop don't
 * clobber each other's row/demand_ids updates. */
export function addProjectRow(projectId: string, row: Omit<ProjectMpNeedRow, "id">): void {
  const project = projectStore.get(projectId);
  if (!project) return;
  const newRow: ProjectMpNeedRow = { ...row, id: genId("row") };
  const updatedRows = [...project.rows, newRow];
  const created = createDemandsFromProjectRow({ ...project, rows: updatedRows }, newRow);
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
  const updatedRows = project.rows.map((r) => (r.id === rowId ? { ...r, qty: newQty } : r));
  const created = expandRowToDemands({ ...row, qty: delta }, "Project", project.id, project.name);
  projectStore.update(projectId, { rows: updatedRows, demand_ids: [...project.demand_ids, ...created.map((d) => d.id)] });
}

/** §7 / §12 Auto Project Finish: run when Project Monitoring module is opened. */
export function autoProjectFinishCheck(): void {
  const projects = projectStore.list();
  for (const project of projects) {
    if (project.status !== "Ongoing") continue;
    if (sisaHari(project.end_date) >= 0) continue;
    projectStore.update(project.id, { status: "Finish" });

    const fulfilledDemands = demandStore
      .list()
      .filter((d) => project.demand_ids.includes(d.id) && d.status === "Fulfilled" && d.replacement_noreg);

    for (const d of fulfilledDemands) {
      const type: MpStatusKategori =
        d.category === "Vokasi" ? "Vokasi" : d.replacement_batch ? "Vokasi" : "PKWT";
      const contractEnd = estimateContractEnd(d.replacement_noreg, type);
      const stillValid = contractEnd === null || sisaHari(contractEnd) >= 0;
      if (!stillValid) continue;
      pushToUtilPool({
        noreg: d.replacement_noreg,
        nama: d.replacement_nama,
        type,
        source: "ProjectFinish",
        source_label: project.name,
        prev_dept: d.dept,
        contract_end: contractEnd,
      });
    }
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
  const demandIds: string[] = [];
  for (const row of takt.need_rows ?? []) {
    const created = createDemandsFromTaktRow(takt, row);
    demandIds.push(...created.map((d) => d.id));
  }
  return taktStore.update(takt.id, { demand_ids: demandIds })!;
}

export function createTaktDown(input: {
  plant: TaktCase["plant"];
  date: string;
  takt_before: number;
  takt_after: number;
  released_persons: { noreg: string; nama: string; type: MpStatusKategori; dept: string }[];
}): TaktCase {
  const takt: TaktCase = {
    id: genId("takt"),
    plant: input.plant,
    date: input.date,
    category: "down",
    takt_before: input.takt_before,
    takt_after: input.takt_after,
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
      prev_dept: p.dept,
      contract_end: contractEnd,
    });
    poolIds.push(entry.id);
  }
  return taktStore.update(takt.id, { released_pool_ids: poolIds })!;
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
  prev_dept: string;
  contract_end: string | null;
}): UtilPoolEntry {
  const entry: UtilPoolEntry = {
    id: genId("pool"),
    noreg: input.noreg,
    nama: input.nama,
    type: input.type,
    source: input.source,
    source_label: input.source_label,
    prev_dept: input.prev_dept,
    entered_pool_date: today().toISOString().slice(0, 10),
    contract_end: input.contract_end,
    status: "Open",
    action_note: "",
  };
  utilPoolStore.insert(entry);
  return entry;
}

export function assignPoolEntryToDemand(poolEntryId: string, demandId: string): void {
  const entry = utilPoolStore.get(poolEntryId);
  if (!entry) return;
  demandStore.update(demandId, {
    replacement_noreg: entry.noreg,
    replacement_nama: entry.nama,
    replacement_dept: entry.prev_dept,
    replacement_batch: "",
    status: "Fulfilled",
  });
  const demand = demandStore.get(demandId);
  if (demand?.category === "PKWT") {
    const fs_status = computeFsStatus(demand.dept, entry.prev_dept, undefined);
    demandStore.update(demandId, { fs_status });
  }
  utilPoolStore.update(poolEntryId, {
    status: "Assigned",
    action_note: `Assigned to demand ${demandId}`,
  });
}

export function naturalRelease(poolEntryId: string): void {
  utilPoolStore.update(poolEntryId, { status: "Released", action_note: "Natural Release" });
}
