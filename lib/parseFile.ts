// Client-side parsing for Upload Center (ZPAR & Vokasi files).
// Accepts .xlsx/.xls/.csv — first sheet, first row = headers, flexible aliasing
// so real-world exports with slightly different column names still parse.
import * as XLSX from "xlsx";
import { format } from "date-fns";
import type { EmployeeRecord, Gender, StatusKontrak, VokasiRecord } from "./types";

async function sheetToRows(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
}

function findValue(row: Record<string, unknown>, aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const key = keys.find((k) => k.trim().toLowerCase() === alias);
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

export function derivePlant(division: string): string {
  const d = division.toLowerCase();
  if (d.includes("2")) return "Plant 2";
  return "Plant 1";
}

export interface ZparParseResult {
  employees: EmployeeRecord[];
  totalRows: number;
  skipped: number;
}

export async function parseZparFile(file: File): Promise<ZparParseResult> {
  const rows = await sheetToRows(file);
  const employees: EmployeeRecord[] = [];
  let skipped = 0;

  for (const row of rows) {
    const egRaw = findValue(row, ["eg", "employee group", "employment group"]).toLowerCase();
    const eg = egRaw || "active";
    if (eg && !eg.includes("active") && eg !== "a") {
      skipped++;
      continue;
    }
    const statusRaw = findValue(row, ["status kontrak", "status_kontrak", "contract status", "status"]);
    const status_kontrak = normalizeStatusKontrak(statusRaw);
    if (!status_kontrak) {
      skipped++;
      continue;
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
      plant: derivePlant(division),
    });
  }
  return { employees, totalRows: rows.length, skipped };
}

export interface VokasiParseResult {
  records: Omit<VokasiRecord, "id" | "batch" | "upload_date">[];
  totalRows: number;
}

export async function parseVokasiFile(file: File, defaultTglMasuk: string): Promise<VokasiParseResult> {
  const rows = await sheetToRows(file);
  const records = rows.map((row) => {
    const tglMasuk = toIsoDate(findValue(row, ["tgl masuk", "tanggal masuk"])) || defaultTglMasuk;
    return {
      noreg: findValue(row, ["noreg", "no reg", "nik", "id"]),
      nama: findValue(row, ["nama", "name"]),
      div: findValue(row, ["div", "division", "divisi"]),
      dept: findValue(row, ["dept", "shop", "department", "departemen"]),
      lokasi: findValue(row, ["lokasi", "location"]),
      tgl_masuk: tglMasuk,
      tgl_ended: toIsoDate(findValue(row, ["tgl ended", "tanggal ended", "end date", "ended"])),
      utilisasi: findValue(row, ["utilisasi", "utilization"]),
      status_saat_ini: "Active" as const,
      gender: normalizeGender(findValue(row, ["gender", "jk", "jenis kelamin", "sex"])),
      labor_type: normalizeLaborType(findValue(row, ["labor type", "labor_type", "tipe tenaga kerja"])),
    };
  });
  return { records, totalRows: rows.length };
}
