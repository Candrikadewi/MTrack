// Core domain types for M-TRACK — Manpower Tracking Application
// See MTRACK_SPEC.md §3 for the conceptual data model this mirrors.

export type StatusKontrak = "Permanen" | "Kontrak 1.1" | "Kontrak 1.2" | "Kontrak 2" | "AKTI";

export type Gender = "L" | "P";

export type MpStatusKategori = "Vokasi" | "PKWT" | "Permanen" | "AKTI";

/** Known Labor Type codes (Dashboard §Komposisi by Labor Type). Employee/Vokasi
 * records store labor_type as free text — this is the recognized set used for
 * chart grouping; anything else is bucketed as "Other". */
export const LABOR_TYPES = ["A", "B1", "B2", "B3", "B4", "C1", "C2", "D", "E1", "E2", "F", "T"] as const;
export type LaborType = (typeof LABOR_TYPES)[number];

// ---------------------------------------------------------------------------
// 3.1 / 3.2 — ZPAR Snapshot & Employee Record
// ---------------------------------------------------------------------------

export interface EmployeeRecord {
  noreg: string;
  nama: string;
  labor_type: string;
  tgl_masuk: string; // ISO date
  status_kontrak: StatusKontrak;
  eg: string; // employment group, filtered to "Active" at parse time
  directorat: string;
  division: string;
  dept: string;
  section: string;
  line: string;
  tgl_lahir: string;
  gender: Gender;
  plant: string; // derived from division
  posisi_struktural: string; // ZPAR "Posisi (Struktural)" column, free text
}

/** Dashboard §Total Manpower position-breakdown order & abbreviation, keyed by
 * the raw posisi_struktural text (case-insensitive substring match). */
export const POSISI_STRUKTURAL_GROUPS: { match: string; label: string }[] = [
  { match: "department head", label: "DpH" },
  { match: "master", label: "Master" },
  { match: "senior officer", label: "SO" },
  { match: "section head", label: "SH" },
  { match: "staff", label: "Staff" },
  { match: "group leader", label: "GL" },
  { match: "team leader", label: "TL" },
  { match: "group expert", label: "GX" },
  { match: "team expert", label: "TX" },
  { match: "team member", label: "TM" },
];

export interface ZparSnapshot {
  id: string;
  period: string; // YYYY-MM
  filename: string;
  upload_date: string; // ISO datetime
  is_active: boolean;
  employees: EmployeeRecord[];
}

// ---------------------------------------------------------------------------
// 3.3 — Vokasi Record (cumulative, cross-snapshot)
// ---------------------------------------------------------------------------

export type VokasiStatusSaatIni = "Active" | "Overlapping" | "Need Replace" | "Ended";

export interface VokasiRecord {
  id: string;
  noreg: string;
  nama: string;
  batch: string;
  div: string;
  dept: string; // shop/dept
  lokasi: string;
  tgl_masuk: string; // tanggal masuk vokasi
  tgl_ended: string;
  utilisasi: string;
  status_saat_ini: VokasiStatusSaatIni;
  gender: Gender;
  labor_type: string;
  upload_date: string; // metadata: when this batch record was uploaded
}

// ---------------------------------------------------------------------------
// 3.4 — PKWT Review (generated per period from EmployeeRecord)
// ---------------------------------------------------------------------------

export type ReviewResult = "" | "Continue" | "Terminate";

export interface PkwtReview {
  id: string;
  noreg: string;
  nama: string;
  status_kontrak: StatusKontrak;
  div: string;
  dept: string;
  tgl_masuk: string;
  tgl_review: string; // computed
  review_result: ReviewResult;
  demand_id?: string; // set once Terminate creates a Demand
  labor_type: string;
}

// ---------------------------------------------------------------------------
// 3.5 — Demand (centralized need pool)
// ---------------------------------------------------------------------------

export type DemandCategory = "Vokasi" | "PKWT";

export type DemandOriginType =
  | "VokasiEnded"
  | "PkwtTerminate"
  | "Project"
  | "TaktUp"
  | "Resign"
  | "Pension"
  | "GST"
  | "Unfit"
  | "Others"
  | "Manual";

export type DemandStatus = "Open" | "Fulfilled";

export type FsStatus = "Need FS" | "No Need FS" | "";

/** Demand Supply "Source" — how a demand's vacancy actually gets filled.
 * "PKWT New Hire" only appears as an option on the PKWT tab; "Vokasi New
 * Hire" appears on both tabs (see effectiveDemandCategory in enrollment.ts)
 * since a PKWT vacancy can be backfilled from the Vokasi pipeline. */
export type ReplacementStatus = "" | "PKWT New Hire" | "Vokasi New Hire" | "MP Excess" | "MP Back Up" | "No Replace";

/** Employment status of the replacement candidate — auto-derived from where the noreg was found. */
export type EmploymentStatus = "" | "Kontrak" | "Permanen" | "Vokasi";

export interface Demand {
  id: string;
  category: DemandCategory;
  origin_type: DemandOriginType;
  origin_ref: string; // id of source record (project/takt/pkwt review/vokasi record)
  origin_label?: string; // human readable label for the origin (project name, or "Others" custom reason)

  outgoing_noreg: string;
  outgoing_nama: string;
  outgoing_label: string; // used INSTEAD of noreg/nama for Project/TaktUp origins

  div: string;
  dept: string;

  tgl_masuk_outgoing: string;
  tgl_ended_outgoing: string; // vokasi ended date OR pkwt review date

  fulfill_date: string; // target date replacement should start

  replacement_status: ReplacementStatus;
  no_replace_reason: string; // set when replacement_status = "No Replace"

  replacement_noreg: string;
  replacement_nama: string;
  replacement_batch: string;
  replacement_tgl_masuk: string;
  replacement_dept: string; // department of the replacement (for fs_status)
  replacement_employment_status: EmploymentStatus;

  fs_status: FsStatus; // computed once a replacement source is known

  status: DemandStatus;
  /** When the candidate mapping actually became official — contract signed
   * (new hire) or officially assigned to destination dept (MP Back Up/
   * Excess). This, not just having a name filled in, is what makes `status`
   * "Fulfilled". Empty until confirmed. */
  fulfillment_confirmed_date: string;

  /** Shop floor confirms the replacement has actually reported for duty —
   * separate from `fulfillment_confirmed_date` (HR/admin contract-sign or
   * assignment step). Empty until confirmed. Drives the granular
   * Open/DELAY/Need Replace ASAP/Fulfilled Ontime/Fulfilled but Delay status
   * shown on the Supply-Demand page (see `supplyDemandStatus` in compute.ts). */
  shop_confirmed_date: string;

  created_at: string;
}

// ---------------------------------------------------------------------------
// 3.6 — Project
// ---------------------------------------------------------------------------

export type ProjectStatus = "Ongoing" | "Finish";

export type MpRole = "Proses" | "Backup";

export interface ProjectMpNeedRow {
  id: string;
  division: string;
  dept: string;
  status_mp: MpStatusKategori;
  mp_role: MpRole;
  qty: number;
  fulfill_date: string;
}

export interface Project {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: ProjectStatus;
  rows: ProjectMpNeedRow[];
  demand_ids: string[];
}

// ---------------------------------------------------------------------------
// 3.7 — Takt Case
// ---------------------------------------------------------------------------

export type Plant = "Plant 1" | "Plant 2";
export type TaktCategory = "up" | "down";

export interface TaktDownPerson {
  noreg: string;
  nama: string;
  type: MpStatusKategori;
  div: string;
  dept: string;
}

export interface TaktCase {
  id: string;
  plant: Plant;
  date: string;
  category: TaktCategory;
  takt_before: number;
  takt_after: number;
  // "up" inputs
  need_rows?: ProjectMpNeedRow[];
  demand_ids: string[];
  // "down" inputs
  released_persons?: TaktDownPerson[];
  released_pool_ids: string[];
}

// ---------------------------------------------------------------------------
// 3.8 — Utilization Pool Entry
// ---------------------------------------------------------------------------

export type UtilPoolSource = "ProjectFinish" | "TaktDown" | "Kaizen";
export type UtilPoolStatus = "Open" | "Assigned" | "Released";

export interface UtilPoolEntry {
  id: string;
  noreg: string;
  nama: string;
  type: MpStatusKategori;
  source: UtilPoolSource;
  source_label: string;
  prev_div: string;
  prev_dept: string;
  entered_pool_date: string;
  contract_end: string | null; // null if Permanen
  status: UtilPoolStatus;
  action_note: string;
}

// ---------------------------------------------------------------------------
// 3.9 — Handover Form
// ---------------------------------------------------------------------------

export type HandoverStatus = "Draft" | "Completed";

export interface HandoverRow {
  id: string;
  no: number;
  tipe_movement: string;
  outgoing: string;
  incoming: string;
  labor_type: string;
  alasan: string;
  tanggal: string;
  demand_id?: string;
}

export interface HandoverForm {
  id: string;
  dept: string;
  period: string; // YYYY-MM
  status: HandoverStatus;
  rows: HandoverRow[];
  created_at: string;
}
