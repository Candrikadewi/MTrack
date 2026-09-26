// Core domain types for CAMP — Centralized Access for Manpower Planning.
// The shape of every record the app reads and writes (see PRODUCT.md for
// what each one means to the business).

export type StatusKontrak =
  | "Permanen"
  | "Kontrak 1.1"
  | "Kontrak 1.2"
  | "Kontrak 2"
  | "Kontrak Profesi"
  | "Prolongation"
  | "Expatriate"
  | "Incoming ICT"
  | "Outgoing ICT"
  | "AKTI";

/** Only these stages go through the PKWT Continue/Terminate review cycle. */
export const KONTRAK_REVIEW_STATUSES: readonly StatusKontrak[] = ["Kontrak 1.1", "Kontrak 1.2", "Kontrak 2"];

/** Which side of the Permanen : Kontrak ratio a ZPAR status counts toward.
 * Kontrak Profesi, Prolongation, Expatriate and ICT count as Permanen (user
 * decision); only the reviewed PKWT stages and AKTI count as Kontrak. This
 * is ratio grouping only — retirement still applies to literal "Permanen". */
export function isPermanenForRatio(status: StatusKontrak): boolean {
  return status !== "AKTI" && !KONTRAK_REVIEW_STATUSES.includes(status);
}

export type Gender = "L" | "P";

export type MpStatusKategori = "Vokasi" | "PKWT" | "Permanen" | "AKTI";

/** Area segregation derived from ZPAR/Vokasi's "Pers Area" column at parse
 * time (see mapPersAreaToPlant in lib/parseFile.ts) — Vehicle Plant =
 * Karawang 1 & 2, Unit KRW Plant = Karawang 3, Unit STR Plant = Sunter 1 & 2,
 * Head Office = any other non-empty Pers Area. Unrelated to the `Plant` type
 * below, which is Takt Up/Down's own manual "Plant 1"/"Plant 2" selection. */
export const PLANT_UNITS = ["Vehicle Plant", "Unit KRW Plant", "Unit STR Plant", "Head Office"] as const;
export type PlantUnit = (typeof PLANT_UNITS)[number];

/** Known Labor Type codes (Dashboard §Komposisi by Labor Type). Employee/Vokasi
 * records store labor_type as free text — this is the recognized set used for
 * chart grouping; anything else is bucketed as "Other". */
export const LABOR_TYPES = ["A", "B1", "B2", "B3", "B4", "C1", "C2", "D", "E1", "E2", "F", "T"] as const;
export type LaborType = (typeof LABOR_TYPES)[number];

/** Kaizen supply is declared per labor group: "A/F" covers codes A and F,
 * "B/C" covers B1–B4 and C1–C2. Matched on the code's leading letter so a
 * free-text value like "b3" still lands in the right group. */
export const KAIZEN_LABOR_GROUPS = ["A/F", "B/C"] as const;
export type KaizenLaborGroup = (typeof KAIZEN_LABOR_GROUPS)[number];

export function inKaizenLaborGroup(group: KaizenLaborGroup, laborType: string): boolean {
  const letter = laborType.trim().charAt(0).toUpperCase();
  return group === "A/F" ? letter === "A" || letter === "F" : letter === "B" || letter === "C";
}

/** Which labor group a Kaizen Supply Pool entry was released under — read
 * back from its source_label (see createKaizenSupply). Null for entries
 * recorded before the labor group existed. */
export function kaizenLaborGroupOf(sourceLabel: string): KaizenLaborGroup | null {
  const m = sourceLabel.match(/Labor (A\/F|B\/C)/);
  return m ? (m[1] as KaizenLaborGroup) : null;
}

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
  /** Derived from ZPAR "Pers Area" — see mapPersAreaToPlant. Empty only when
   * Pers Area itself is empty; the employee is still included, just outside
   * Demand's default ratio scope (Vehicle Plant · Labor A). */
  plant: PlantUnit | "";
  posisi_struktural: string; // ZPAR "Posisi (Struktural)" column, free text
  /** Values of non-schema columns the admin marked "Pakai" in Upload Center
   * (column name -> raw value). */
  extra?: Record<string, string>;
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
  dept: string;
  /** Vokasi Reguler placement area (ASSEMBLY, TOSO, ...), standardized —
   * Div/Dept derive from Shop + Lokasi. "" for records uploaded before
   * migration_14. */
  shop: string;
  lokasi: string;
  plant: PlantUnit | ""; // derived from Vokasi's "Pers Area" — see mapPersAreaToPlant; "" if Pers Area is empty
  tgl_masuk: string; // tanggal masuk vokasi
  tgl_ended: string;
  utilisasi: string;
  status_saat_ini: VokasiStatusSaatIni;
  gender: Gender;
  labor_type: string;
  upload_date: string; // metadata: when this batch record was uploaded
  /** Values of non-schema columns the admin marked "Pakai" in Upload Center. */
  extra?: Record<string, string>;
}

/** A confirmed correction for a non-standard raw value (e.g. Vokasi SHOP
 * "ASSEMMBLY" → "ASSEMBLY"), asked once then reused (migration_14).
 * mapped_value "" = not a valid value, skip those rows. */
export interface ValueMapping {
  id: string;
  dataset: "zpar" | "vokasi";
  field: string;
  raw_value: string;
  normalized_raw: string;
  mapped_value: string;
  decided_at: string;
}

/** An admin's standing decision about a column outside the known upload
 * schema — asked once per dataset + column, then applied to every later
 * upload (see migration_13). */
export interface ColumnDecision {
  id: string;
  dataset: "zpar" | "vokasi";
  column_name: string;
  /** Header normalized for matching (case/space/paren-insensitive). */
  normalized: string;
  decision: "use" | "ignore";
  decided_at: string;
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
  | "PensionDini"
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

/** Jenis MP on a project need-row. MP Project and MP Backup leave with the
 * project: when it ends, whoever holds the seat and still has contract left
 * goes to Supply Pool as MP Excess. MP Setting stays in the shop for good
 * (its seat keeps the normal replacement cycle after the project). "Proses"
 * is the old stored name for MP Project. */
export type MpRole = "Project" | "Backup" | "Setting" | "Proses";

export const MP_ROLE_OPTIONS: { value: Exclude<MpRole, "Proses">; label: string }[] = [
  { value: "Project", label: "MP Project" },
  { value: "Backup", label: "MP Backup" },
  { value: "Setting", label: "MP Setting" },
];

export function mpRoleLabel(role: MpRole | undefined): string {
  if (role === "Backup") return "MP Backup";
  if (role === "Setting") return "MP Setting";
  return "MP Project";
}

export function releasedAtProjectEnd(role: MpRole | undefined): boolean {
  return role !== "Setting";
}

/** Contract length per MP status, for counting how many times a project
 * seat has to be filled. Permanen/AKTI have no fixed cycle here. */
export const CONTRACT_MONTHS: Partial<Record<MpStatusKategori, number>> = { Vokasi: 6, PKWT: 24 };

export interface ProjectMpNeedRow {
  id: string;
  division: string;
  dept: string;
  status_mp: MpStatusKategori;
  mp_role: MpRole;
  qty: number;
  fulfill_date: string;
  /** Demands expanded from this row (stored inside projects.rows). Older
   * projects don't have it; see projectRowOfDemand for the fallback. */
  demand_ids?: string[];
  /** When this row's MP is released (holders still under contract become MP
   * Excess). no_release: the seat stays and keeps being refilled like
   * regular enrollment. Rows from before per-row release have neither; see
   * rowReleaseDate. */
  release_date?: string;
  no_release?: boolean;
  /** Set once the release has been processed (autoProjectFinishCheck). */
  released?: boolean;
}

/** A row's release date, or null when it is never released. Older rows
 * fall back to the project end for MP Project/Backup. */
export function rowReleaseDate(row: ProjectMpNeedRow, project: Pick<Project, "end_date">): string | null {
  if (row.no_release) return null;
  if (row.release_date) return row.release_date;
  if (row.no_release === undefined && releasedAtProjectEnd(row.mp_role)) return project.end_date || null;
  return null;
}

/** projects.end_date is not null in the database: the latest release date,
 * or the SOP date when every row is No Release. */
export function projectEndDate(rows: Pick<ProjectMpNeedRow, "release_date" | "no_release">[], sopDate: string): string {
  const dates = rows.filter((r) => !r.no_release && r.release_date).map((r) => r.release_date as string);
  return dates.length ? dates.sort().at(-1)! : sopDate;
}

export interface Project {
  id: string;
  name: string;
  /** Tanggal SOP of the project. */
  start_date: string;
  /** Derived: the latest row release date (see projectEndDate). */
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

/** A shop's planned Takt Down composition — how many of each MP status a
 * division/department is releasing and when — recorded before anyone maps
 * actual names against it. One Takt Down case commonly spans several shops,
 * each with its own status mix, so this is a list of rows, one per shop ×
 * status combination. release_date drives entered_pool_date on the Supply
 * Pool entries created from this row (see createTaktDown), the same way
 * ProjectMpNeedRow.fulfill_date drives each Demand it expands into. MP
 * Role (Proses/Backup) is deliberately not part of this — that distinction
 * only applies to Project rows. */
export interface TaktDownPlanRow {
  id: string;
  division: string;
  dept: string;
  status_mp: MpStatusKategori;
  qty: number;
  release_date: string;
}

export interface TaktDownPerson {
  noreg: string;
  nama: string;
  type: MpStatusKategori;
  div: string;
  dept: string;
  /** Plan row this person was picked for, when picked from a specific row
   * (needed when two rows share division/dept/status — e.g. two Kaizen
   * activities in one department). */
  plan_row_id?: string;
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
  // "down" inputs — plan_rows is the per-shop/status/role quantity plan,
  // released_persons is the actual name-by-name mapping against it; both
  // stay editable after the case is created (see updateTaktDown).
  plan_rows?: TaktDownPlanRow[];
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
