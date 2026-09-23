// Client-side parsing for Upload Center (ZPAR & Vokasi files).
// Accepts .xlsx/.xls/.csv — first sheet, first row = headers, flexible aliasing
// so real-world exports with slightly different column names still parse.
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { computeVokasiEndedDate } from "./engine/compute";
import type { EmployeeRecord, Gender, PlantUnit, StatusKontrak, VokasiRecord } from "./types";

async function sheetToRows(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
}

/** Collapses whitespace/parens differences ("Posisi (Struktural)" vs "posisi
 * struktural" vs "Posisi(Struktural) ") so real-world header formatting
 * quirks don't break column matching. */
function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/[\s()]+/g, "");
}

function findValue(row: Record<string, unknown>, aliases: string[]): string {
  const keys = Object.keys(row);
  const normalizedAliases = aliases.map(normalizeHeader);
  for (const alias of normalizedAliases) {
    const key = keys.find((k) => normalizeHeader(k) === alias);
    if (key !== undefined && row[key] !== "") return String(row[key]);
  }
  return "";
}

function toIsoDate(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return format(value, "yyyy-MM-dd");
  const s = String(value).trim();
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return format(parsed, "yyyy-MM-dd");
  return s;
}

function normalizeStatusKontrak(raw: string): StatusKontrak | null {
  const s = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s.includes("perman")) return "Permanen";
  if (s.includes("akti")) return "AKTI";
  if (s.includes("1.1") || s.includes("1,1")) return "Kontrak 1.1";
  if (s.includes("1.2") || s.includes("1,2")) return "Kontrak 1.2";
  if (s.includes("2")) return "Kontrak 2";
  if (s.includes("kontrak") || s.includes("pkwt")) return "Kontrak 1.1";
  return null;
}

function normalizeGender(raw: string): Gender {
  const s = raw.toLowerCase().trim();
  if (s.startsWith("p") || s.startsWith("f")) return "P";
  return "L";
}

function normalizeLaborType(raw: string): string {
  return raw.trim().toUpperCase();
}

const PERS_AREA_ALIASES = ["pers area", "personnel area", "pers. area", "area kerja", "area"];

/** Area segregation — see PlantUnit's doc comment. Matches are
 * substring-based on the normalized (lowercased, whitespace-collapsed) raw
 * value, so "Karawang 1", "KARAWANG1", "Krw 1" etc. all resolve the same
 * way; anything that doesn't mention one of the six known areas returns
 * null. This is purely a tag for the Demand menu's ratio widgets to scope
 * by (default scope = Vehicle Plant + Labor A) — it never excludes a row
 * from the upload itself; ZPAR/Vokasi data outside these five areas is
 * still real headcount and stays in the dataset. */
export function mapPersAreaToPlant(persArea: string): PlantUnit | null {
  const s = persArea.toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  const has = (...needles: string[]) => needles.some((n) => s.includes(n));
  if (has("karawang 1", "karawang1", "krw 1", "krw1")) return "Vehicle Plant";
  if (has("karawang 2", "karawang2", "krw 2", "krw2")) return "Vehicle Plant";
  if (has("karawang 3", "karawang3", "krw 3", "krw3")) return "Unit KRW Plant";
  if (has("sunter 1", "sunter1", "str 1", "str1")) return "Unit STR Plant";
  if (has("sunter 2", "sunter2", "str 2", "str2")) return "Unit STR Plant";
  return null;
}

export interface SkipBreakdown {
  /** Reason label -> row count. Rows counted here are genuinely excluded
   * from the upload. */
  reasons: Record<string, number>;
  /** Informational only — rows here are NOT excluded, just flagged: their
   * Pers Area didn't resolve to one of the five known areas, so they won't
   * count toward Demand's default (Vehicle Plant + Labor A) ratio scope. */
  unmatchedPersAreaCount: number;
  unmatchedPersAreaValues: string[];
}

function emptySkipBreakdown(): SkipBreakdown {
  return { reasons: {}, unmatchedPersAreaCount: 0, unmatchedPersAreaValues: [] };
}

function addReason(b: SkipBreakdown, reason: string) {
  b.reasons[reason] = (b.reasons[reason] ?? 0) + 1;
}

export interface ZparParseResult {
  employees: EmployeeRecord[];
  totalRows: number;
  skipped: number;
  skipBreakdown: SkipBreakdown;
}

export async function parseZparFile(file: File): Promise<ZparParseResult> {
  const rows = await sheetToRows(file);
  const employees: EmployeeRecord[] = [];
  const skipBreakdown = emptySkipBreakdown();
  const unmatchedPersAreaSet = new Set<string>();

  for (const row of rows) {
    const egRaw = findValue(row, ["eg", "employee group", "employment group"]).toLowerCase();
    const eg = egRaw || "active";
    if (eg && !eg.includes("active") && eg !== "a") {
      addReason(skipBreakdown, "EG tidak aktif");
      continue;
    }
    const statusRaw = findValue(row, ["status kontrak", "status_kontrak", "contract status", "status"]);
    const status_kontrak = normalizeStatusKontrak(statusRaw);
    if (!status_kontrak) {
      addReason(skipBreakdown, "Status Kontrak tidak dikenali");
      continue;
    }
    const persAreaRaw = findValue(row, PERS_AREA_ALIASES);
    const plant = mapPersAreaToPlant(persAreaRaw);
    if (!plant) {
      skipBreakdown.unmatchedPersAreaCount++;
      unmatchedPersAreaSet.add(persAreaRaw || "(kosong)");
    }
    const division = findValue(row, ["division", "divisi"]);
    employees.push({
      noreg: findValue(row, ["noreg", "no reg", "nik", "employee id", "emp id", "id"]),
      nama: findValue(row, ["nama", "name", "nama lengkap", "employee name"]),
      labor_type: normalizeLaborType(findValue(row, ["labor type", "labor_type", "tipe tenaga kerja"])),
      tgl_masuk: toIsoDate(findValue(row, ["tgl masuk", "tanggal masuk", "hire date", "joining date", "tmt"])),
      status_kontrak,
      eg: "Active",
      directorat: findValue(row, ["directorat", "direktorat", "directorate"]),
      division,
      dept: findValue(row, ["dept", "department", "departemen"]),
      section: findValue(row, ["section", "seksi"]),
      line: findValue(row, ["line"]),
      tgl_lahir: toIsoDate(findValue(row, ["tgl lahir", "tanggal lahir", "birth date", "dob"])),
      gender: normalizeGender(findValue(row, ["gender", "jk", "jenis kelamin", "sex"])),
      plant: plant ?? "",
      posisi_struktural: findValue(row, [
        "posisi (struktural)",
        "posisi struktural",
        "posisi",
        "jabatan struktural",
        "jabatan",
        "structural position",
        "position",
      ]),
    });
  }
  skipBreakdown.unmatchedPersAreaValues = Array.from(unmatchedPersAreaSet).sort();
  const skipped = rows.length - employees.length;
  return { employees, totalRows: rows.length, skipped, skipBreakdown };
}

export interface VokasiParseResult {
  records: Omit<VokasiRecord, "id" | "batch" | "upload_date">[];
  totalRows: number;
  skipped: number;
  skipBreakdown: SkipBreakdown;
}

export async function parseVokasiFile(file: File, defaultTglMasuk: string): Promise<VokasiParseResult> {
  const rows = await sheetToRows(file);
  const records: Omit<VokasiRecord, "id" | "batch" | "upload_date">[] = [];
  const skipBreakdown = emptySkipBreakdown();
  const unmatchedPersAreaSet = new Set<string>();

  for (const row of rows) {
    const persAreaRaw = findValue(row, PERS_AREA_ALIASES);
    const plant = mapPersAreaToPlant(persAreaRaw);
    if (!plant) {
      skipBreakdown.unmatchedPersAreaCount++;
      unmatchedPersAreaSet.add(persAreaRaw || "(kosong)");
    }
    const tglMasuk = toIsoDate(findValue(row, ["tgl masuk", "tanggal masuk"])) || defaultTglMasuk;
    records.push({
      noreg: findValue(row, ["noreg", "no reg", "nik", "id"]),
      nama: findValue(row, ["nama", "name"]),
      div: findValue(row, ["div", "division", "divisi"]),
      dept: findValue(row, ["dept", "shop", "department", "departemen"]),
      lokasi: findValue(row, ["lokasi", "location"]),
      plant: plant ?? "",
      tgl_masuk: tglMasuk,
      // Business rule: Vokasi selalu 6 bulan − 1 hari dari tgl_masuk, bukan dari file upload.
      tgl_ended: computeVokasiEndedDate(tglMasuk),
      utilisasi: findValue(row, ["utilisasi", "utilization"]),
      status_saat_ini: "Active" as const,
      gender: normalizeGender(findValue(row, ["gender", "jk", "jenis kelamin", "sex"])),
      labor_type: normalizeLaborType(findValue(row, ["labor type", "labor_type", "tipe tenaga kerja"])),
    });
  }
  skipBreakdown.unmatchedPersAreaValues = Array.from(unmatchedPersAreaSet).sort();
  return { records, totalRows: rows.length, skipped: rows.length - records.length, skipBreakdown };
}
