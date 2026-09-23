// Client-side parsing for Upload Center (ZPAR & Vokasi files).
// Accepts .xlsx/.xls/.csv — first sheet, first row = headers, flexible aliasing
// so real-world exports with slightly different column names still parse.
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { computeVokasiEndedDate } from "./engine/compute";
import type { EmployeeRecord, Gender, PlantUnit, StatusKontrak, VokasiRecord } from "./types";

/** `raw: true` keeps CSV cells as text: SheetJS would otherwise guess dates
 * US-style, turning ZPAR's dd/mm/yyyy "04/07/1990" into 7 April and leaving
 * days above 12 as unparsed text. Real .xlsx date cells still arrive as
 * Date objects via cellDates. */
async function readSheet(file: File): Promise<{ rows: Record<string, unknown>[]; headers: string[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
  const headerRow = (XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false })[0] ?? []) as unknown[];
  return { rows, headers: headerRow.map((h) => String(h ?? "").trim()).filter(Boolean) };
}

/** Collapses whitespace/parens differences ("Posisi (Struktural)" vs "posisi
 * struktural" vs "Posisi(Struktural) ") and strips a UTF-8 BOM, so real-world
 * header formatting quirks (incl. ZPAR's trailing-space "MPP ") don't break
 * column matching. */
export function normalizeHeader(s: string): string {
  return s.replace(/\uFEFF/g, "").trim().toLowerCase().replace(/[\s()]+/g, "");
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

function isoFromParts(y: number, m: number, d: number): string {
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  const date = new Date(y, m - 1, d);
  if (date.getMonth() !== m - 1) return "";
  return format(date, "yyyy-MM-dd");
}

/** ZPAR dates are dd/mm/yyyy (day first, never US order); ISO yyyy-mm-dd
 * and real spreadsheet dates are accepted too. Anything else returns ""
 * so it's counted as unreadable instead of stored as garbage. */
function toIsoDate(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return isNaN(value.getTime()) ? "" : format(value, "yyyy-MM-dd");
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) return isoFromParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  return "";
}

/** ZPAR "Period" is mm.yyyy ("09.2026") → the app's yyyy-MM period key. */
function toPeriodKey(raw: string): string {
  const s = raw.trim();
  const my = s.match(/^(\d{1,2})[./-](\d{4})$/);
  if (my) return `${my[2]}-${my[1].padStart(2, "0")}`;
  const ym = s.match(/^(\d{4})[./-](\d{1,2})$/);
  if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}`;
  return "";
}

/** ZPAR "Status": Permanen, Kontrak 1.1/1.2/2, Kontrak Profesi, Expatriate,
 * Incoming/Outgoing ICT, Prolongation (see docs/data-schema.md). */
function normalizeStatusKontrak(raw: string): StatusKontrak | null {
  const s = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s.includes("perman")) return "Permanen";
  if (s.includes("akti")) return "AKTI";
  if (s.includes("profesi")) return "Kontrak Profesi";
  if (s.includes("prolong")) return "Prolongation";
  if (s.includes("expat")) return "Expatriate";
  if (s.includes("ict")) return s.includes("outgoing") ? "Outgoing ICT" : "Incoming ICT";
  if (s.includes("1.1") || s.includes("1,1")) return "Kontrak 1.1";
  if (s.includes("1.2") || s.includes("1,2")) return "Kontrak 1.2";
  if (s.includes("2")) return "Kontrak 2";
  if (s.includes("kontrak") || s.includes("pkwt")) return "Kontrak 1.1";
  return null;
}

/** ZPAR uses Male/Female, Vokasi uses PRIA/PEREMPUAN — "PRIA" starts with
 * "p", so matching on the first letter alone would read every man as
 * female. */
function normalizeGender(raw: string): Gender {
  const s = raw.toLowerCase().trim();
  if (s === "p" || s.startsWith("perempuan") || s.startsWith("wanita") || s.startsWith("female") || s.startsWith("f")) return "P";
  return "L";
}

function normalizeLaborType(raw: string): string {
  return raw.trim().toUpperCase();
}

const PERS_AREA_ALIASES = ["pers area", "personnel area", "pers. area", "area kerja", "area"];

/** Area segregation (docs/data-schema.md): Vehicle = Karawang 1 & 2, Unit
 * Karawang = Karawang 3, Unit Sunter = Sunter 1 & 2, everything else = Head
 * Office. Substring-based on the normalized value, so "KARAWANG1", "Krw 1"
 * etc. resolve the same way. Null only when Pers Area is empty. A tag for
 * the Demand ratio widgets' default scope — never excludes a row. */
export function mapPersAreaToPlant(persArea: string): PlantUnit | null {
  // "#"/"." stripped so Vokasi's "KARAWANG #1" reads like ZPAR's "Karawang 1".
  const s = persArea.toLowerCase().replace(/[#.]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const has = (...needles: string[]) => needles.some((n) => s.includes(n));
  if (has("karawang 1", "karawang1", "krw 1", "krw1")) return "Vehicle Plant";
  if (has("karawang 2", "karawang2", "krw 2", "krw2")) return "Vehicle Plant";
  if (has("karawang 3", "karawang3", "krw 3", "krw3")) return "Unit KRW Plant";
  if (has("sunter 1", "sunter1", "str 1", "str1")) return "Unit STR Plant";
  if (has("sunter 2", "sunter2", "str 2", "str2")) return "Unit STR Plant";
  return "Head Office";
}

export interface SkipBreakdown {
  /** Reason label -> row count. Rows counted here are genuinely excluded
   * from the upload. */
  reasons: Record<string, number>;
  /** Informational only — rows here are NOT excluded, just flagged: their
   * Pers Area was empty, so they have no area tag and won't count toward
   * Demand's default (Vehicle Plant + Labor A) ratio scope. */
  unmatchedPersAreaCount: number;
  unmatchedPersAreaValues: string[];
  /** Included rows per area tag, for eyeballing the segregation. */
  plantCounts: Record<string, number>;
  /** Informational data-quality flags (rows still included). */
  warnings: Record<string, number>;
}

function emptySkipBreakdown(): SkipBreakdown {
  return { reasons: {}, unmatchedPersAreaCount: 0, unmatchedPersAreaValues: [], plantCounts: {}, warnings: {} };
}

function addReason(b: SkipBreakdown, reason: string) {
  b.reasons[reason] = (b.reasons[reason] ?? 0) + 1;
}

function addWarning(b: SkipBreakdown, label: string) {
  b.warnings[label] = (b.warnings[label] ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// ZPAR column baseline (docs/data-schema.md) — used to flag month-to-month drift
// instead of failing on it.
// ---------------------------------------------------------------------------

const ZPAR_BASELINE_COLUMNS = [
  "No", "Period", "Noreg", "Posisi (struktural)", "Labor Type", "Tgl Masuk", "Status", "EG", "ESG", "Pers Area",
  "Directorat", "Division", "Department", "Section", "Line", "Group", "Tgl Lahir", "Gender", "Tingkat Pendidikan",
  "Nama", "Posisi", "Psubarea", "Org Unit", "Org Key", "Task (IT0019)", "Due Date Task", "Transaction", "Tgl Transaksi",
  "Reason Transaksi", "PE Bonus", "PE Salary", "PE Bonus Y-1", "PE Bonus Y-2", "PE Bonus Y-3", "PE Salary Y-1",
  "PE Salary Y-2", "PE Salary Y-3", "Family Status", "Nationality", "Jumlah Anak", "Kelompok Penyakit", "Jenis Penyakit",
  "Pemeriksa", "Kategori Penyakit", "Posisi Before", "Posisi (struktural) Before", "ESG Before", "Directorat Before",
  "Division Before", "Department Before", "Section Before", "Line Before", "Group Before", "Perusahaan ICT/Expat",
  "Posisi ICT/Expat",
];

/** Seen before and deliberately not used — reported, not alarmed on. */
const ZPAR_KNOWN_NON_STANDARD = ["Ket", "Pension", "MPP"];

const ZPAR_ALIASES = {
  noreg: ["noreg", "no reg", "nik", "employee id", "emp id"],
  nama: ["nama", "name", "nama lengkap", "employee name"],
  status: ["status kontrak", "status_kontrak", "contract status", "status"],
  eg: ["eg", "employee group", "employment group"],
  laborType: ["labor type", "labor_type", "tipe tenaga kerja"],
  tglMasuk: ["tgl masuk", "tanggal masuk", "hire date", "joining date", "tmt"],
  tglLahir: ["tgl lahir", "tanggal lahir", "birth date", "dob"],
  gender: ["gender", "jk", "jenis kelamin", "sex"],
  directorat: ["directorat", "direktorat", "directorate"],
  division: ["division", "divisi"],
  dept: ["department", "dept", "departemen"],
  section: ["section", "seksi"],
  line: ["line"],
  posisiStruktural: ["posisi (struktural)", "posisi struktural", "jabatan struktural", "structural position"],
  period: ["period", "periode"],
};

/** Columns the app actually reads, by the name shown to the uploader. */
const ZPAR_REQUIRED: { label: string; aliases: string[] }[] = [
  { label: "Noreg", aliases: ZPAR_ALIASES.noreg },
  { label: "Nama", aliases: ZPAR_ALIASES.nama },
  { label: "Status", aliases: ZPAR_ALIASES.status },
  { label: "EG", aliases: ZPAR_ALIASES.eg },
  { label: "Labor Type", aliases: ZPAR_ALIASES.laborType },
  { label: "Tgl Masuk", aliases: ZPAR_ALIASES.tglMasuk },
  { label: "Tgl Lahir", aliases: ZPAR_ALIASES.tglLahir },
  { label: "Gender", aliases: ZPAR_ALIASES.gender },
  { label: "Pers Area", aliases: PERS_AREA_ALIASES },
  { label: "Directorat", aliases: ZPAR_ALIASES.directorat },
  { label: "Division", aliases: ZPAR_ALIASES.division },
  { label: "Department", aliases: ZPAR_ALIASES.dept },
  { label: "Section", aliases: ZPAR_ALIASES.section },
  { label: "Line", aliases: ZPAR_ALIASES.line },
  { label: "Posisi (struktural)", aliases: ZPAR_ALIASES.posisiStruktural },
];

export interface ExtraColumn {
  name: string;
  normalized: string;
  /** Seen before per docs/data-schema.md (Ket, Pension, MPP) — defaults to
   * "ignore" until someone decides otherwise. */
  knownNonStandard: boolean;
}

export interface ColumnCheck {
  /** Columns the app reads that aren't in the file — data will be blank. */
  missingRequired: string[];
  /** Baseline columns absent this month (possible export problem). */
  missingBaseline: string[];
  /** Columns outside the schema — each needs a Pakai/Abaikan decision. */
  extra: ExtraColumn[];
}

function extraColumnsOf(headers: string[], isKnown: (normalized: string) => boolean, nonStandard: Set<string>): ExtraColumn[] {
  const seen = new Set<string>();
  const out: ExtraColumn[] = [];
  for (const name of headers) {
    const normalized = normalizeHeader(name);
    if (!normalized || isKnown(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({ name, normalized, knownNonStandard: nonStandard.has(normalized) });
  }
  return out;
}

/** Raw values of the extra columns for one row, keyed by column name. The
 * upload keeps only the ones marked "Pakai". */
function extraValues(row: Record<string, unknown>, extra: ExtraColumn[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (extra.length === 0) return out;
  const byNorm = new Map(Object.keys(row).map((k) => [normalizeHeader(k), k]));
  for (const col of extra) {
    const key = byNorm.get(col.normalized);
    const v = key !== undefined ? row[key] : "";
    if (v !== "" && v !== undefined && v !== null) out[col.name] = v instanceof Date ? format(v, "yyyy-MM-dd") : String(v);
  }
  return out;
}

/** Keeps only the extra values whose column was marked "Pakai". */
export function keepUsedExtra(extra: Record<string, string> | undefined, used: Set<string>): Record<string, string> | undefined {
  if (!extra) return undefined;
  const kept = Object.fromEntries(Object.entries(extra).filter(([name]) => used.has(normalizeHeader(name))));
  return Object.keys(kept).length ? kept : undefined;
}

function checkZparColumns(headers: string[]): ColumnCheck {
  const present = new Set(headers.map(normalizeHeader));
  const baseline = new Set(ZPAR_BASELINE_COLUMNS.map(normalizeHeader));
  const nonStandard = new Set(ZPAR_KNOWN_NON_STANDARD.map(normalizeHeader));
  return {
    missingRequired: ZPAR_REQUIRED.filter((r) => !r.aliases.some((a) => present.has(normalizeHeader(a)))).map((r) => r.label),
    missingBaseline: ZPAR_BASELINE_COLUMNS.filter((c) => !present.has(normalizeHeader(c))),
    extra: extraColumnsOf(headers, (n) => baseline.has(n), nonStandard),
  };
}

export interface ZparParseResult {
  employees: EmployeeRecord[];
  totalRows: number;
  skipped: number;
  skipBreakdown: SkipBreakdown;
  columns: ColumnCheck;
  /** Periods found in the file's "Period" column (yyyy-MM), most rows first.
   * Normally exactly one; a multi-period file is uploaded one period at a
   * time via `employeesByPeriod`. */
  periods: { period: string; count: number }[];
  employeesByPeriod: Record<string, EmployeeRecord[]>;
}

export async function parseZparFile(file: File): Promise<ZparParseResult> {
  const { rows, headers } = await readSheet(file);
  const columns = checkZparColumns(headers);
  const employees: EmployeeRecord[] = [];
  const employeesByPeriod: Record<string, EmployeeRecord[]> = {};
  const skipBreakdown = emptySkipBreakdown();
  const currentYear = new Date().getFullYear();

  for (const row of rows) {
    // Headcount = EG "Active" only; EG coverage varies per file (sometimes
    // Terminated rows are included), so everything else is excluded here.
    const eg = findValue(row, ZPAR_ALIASES.eg).trim().toLowerCase();
    if (eg && eg !== "active" && eg !== "a") {
      addReason(skipBreakdown, "EG tidak aktif");
      continue;
    }
    const statusRaw = findValue(row, ZPAR_ALIASES.status);
    const status_kontrak = normalizeStatusKontrak(statusRaw);
    if (!status_kontrak) {
      addReason(skipBreakdown, statusRaw ? `Status tidak dikenali ("${statusRaw.trim()}")` : "Status kosong");
      continue;
    }
    const persAreaRaw = findValue(row, PERS_AREA_ALIASES);
    const plant = mapPersAreaToPlant(persAreaRaw);
    if (!plant) skipBreakdown.unmatchedPersAreaCount++;
    const plantLabel = plant ?? "(Pers Area kosong)";
    skipBreakdown.plantCounts[plantLabel] = (skipBreakdown.plantCounts[plantLabel] ?? 0) + 1;

    const tglMasukRaw = findValue(row, ZPAR_ALIASES.tglMasuk);
    const tgl_masuk = toIsoDate(tglMasukRaw);
    if (tglMasukRaw && !tgl_masuk) addWarning(skipBreakdown, "Tgl Masuk tidak terbaca");
    const tglLahirRaw = findValue(row, ZPAR_ALIASES.tglLahir);
    const tgl_lahir = toIsoDate(tglLahirRaw);
    if (tglLahirRaw && !tgl_lahir) addWarning(skipBreakdown, "Tgl Lahir tidak terbaca");
    else if (tgl_lahir && currentYear - Number(tgl_lahir.slice(0, 4)) < 17) {
      addWarning(skipBreakdown, "Tgl Lahir tidak wajar (usia di bawah 17)");
    }

    const employee: EmployeeRecord = {
      noreg: findValue(row, ZPAR_ALIASES.noreg).trim(),
      nama: findValue(row, ZPAR_ALIASES.nama).trim(),
      labor_type: normalizeLaborType(findValue(row, ZPAR_ALIASES.laborType)),
      tgl_masuk,
      status_kontrak,
      eg: "Active",
      directorat: findValue(row, ZPAR_ALIASES.directorat),
      division: findValue(row, ZPAR_ALIASES.division),
      dept: findValue(row, ZPAR_ALIASES.dept),
      section: findValue(row, ZPAR_ALIASES.section),
      line: findValue(row, ZPAR_ALIASES.line),
      tgl_lahir,
      gender: normalizeGender(findValue(row, ZPAR_ALIASES.gender)),
      plant: plant ?? "",
      posisi_struktural: findValue(row, ZPAR_ALIASES.posisiStruktural),
    };
    const extra = extraValues(row, columns.extra);
    if (Object.keys(extra).length) employee.extra = extra;
    employees.push(employee);
    const period = toPeriodKey(findValue(row, ZPAR_ALIASES.period)) || "";
    (employeesByPeriod[period] ??= []).push(employee);
  }
  skipBreakdown.unmatchedPersAreaValues = skipBreakdown.unmatchedPersAreaCount ? ["(kosong)"] : [];
  const periods = Object.entries(employeesByPeriod)
    .filter(([p]) => p)
    .map(([period, list]) => ({ period, count: list.length }))
    .sort((a, b) => b.count - a.count);
  const skipped = rows.length - employees.length;
  return { employees, totalRows: rows.length, skipped, skipBreakdown, columns, periods, employeesByPeriod };
}

// ---------------------------------------------------------------------------
// Vokasi Reguler (docs/data-schema-vokasi-reguler.md)
// Two file shapes: the clean Voc_Starting_System.csv (Batch;Noreg;Nama;Div;
// Shop;Lokasi;Dept;Gender;Tgl Masuk) and the raw monthly
// Voc_<Bulan>_System.csv, whose real header sits under two title rows and
// whose batch and start date only exist in the title text.
// ---------------------------------------------------------------------------

const VOKASI_ALIASES = {
  noreg: ["noreg", "no reg", "nik peserta", "id"],
  nama: ["nama", "nama lengkap", "name"],
  div: ["div", "division", "divisi"],
  dept: ["dept", "department", "departemen"],
  shop: ["shop"],
  lokasi: ["lokasi", "location"],
  tglMasuk: ["tgl masuk", "tanggal masuk"],
  utilisasi: ["utilisasi", "utilization"],
  gender: ["gender", "jenis kelamin", "jk", "sex"],
  laborType: ["labor type", "labor_type", "tipe tenaga kerja"],
  batch: ["batch", "angkatan", "gelombang"],
};

/** Raw-file columns the schema drops on purpose — personal data (NIK, NPWP,
 * address, phone, bank, BPJS) and non-system operational fields. Treated
 * as known so they're never offered as "Pakai" and never stored. */
const VOKASI_DROPPED = [
  "No.", "No", "Tempat Lahir", "Tanggal Lahir", "Alamat", "RT/RW", "Kelurahan/Desa", "Kecamatan", "Kota", "Kode Pos",
  "Provinsi", "Nomor HP", "NIK", "NPWP", "Status BPJS Kesehatan", "Nomor BPJS Kesehatan", "Nama Bank", "No. Rekening",
  "Nama Sekolah dan Kota Sekolah", "Jurusan Sekolah", "Model Baju", "Ukuran Baju", "Ukuran Sepatu", "Alamat Email", "Nama BKK",
];

const VOKASI_KNOWN = new Set(
  [...Object.values(VOKASI_ALIASES).flat(), ...PERS_AREA_ALIASES, ...VOKASI_DROPPED].map(normalizeHeader)
);

export const VOKASI_SHOPS = ["ASSEMBLY", "TOSO", "QUALITY INSP.", "WELDING BODY", "FRAME", "PRESS", "LOGISTIC", "PPIC"] as const;

/** Shop + Lokasi → Dept + Div. PPIC's Lokasi isn't decided yet, so PPIC
 * resolves regardless of Lokasi. */
const VOKASI_DEPT_LOOKUP: Record<string, { dept: string; div: string }> = {
  "ASSEMBLY|KARAWANG #1": { dept: "Assy Production #1 & PIO Dept", div: "Assy & Painting Production Div" },
  "ASSEMBLY|KARAWANG #2": { dept: "Assy Production #2 Dept", div: "Assy & Painting Production Div" },
  "TOSO|KARAWANG #1": { dept: "Painting Production #1 Dept", div: "Assy & Painting Production Div" },
  "TOSO|KARAWANG #2": { dept: "Painting Production #2 Dept", div: "Assy & Painting Production Div" },
  "QUALITY INSP.|KARAWANG #1": { dept: "Quality Inspection 1 Dept", div: "Assy & Painting Production Div" },
  "QUALITY INSP.|KARAWANG #2": { dept: "Quality Inspection 2 Dept", div: "Assy & Painting Production Div" },
  "WELDING BODY|KARAWANG #1": { dept: "Body Production & Insp P#1 Dept", div: "Press & Welding Production Div" },
  "WELDING BODY|KARAWANG #2": { dept: "Body Production & Insp P#2 Dept", div: "Press & Welding Production Div" },
  "FRAME|KARAWANG #1": { dept: "Frame Production Dept", div: "Press & Welding Production Div" },
  "PRESS|KARAWANG #1": { dept: "Press Production Karawang Dept", div: "Press & Welding Production Div" },
  "LOGISTIC|KARAWANG #1": { dept: "Logistic Operation Vehicle Plant #1 Dept", div: "Plant Administration Div" },
  "LOGISTIC|KARAWANG #2": { dept: "Logistic Operation Vehicle Plant #2 Dept", div: "Plant Administration Div" },
};
const PPIC_DEPT = { dept: "PPIC & Warehouse Dept", div: "Plant Administration Div" };

export function lookupVokasiDivDept(shop: string, lokasi: string): { dept: string; div: string } | undefined {
  if (shop === "PPIC") return PPIC_DEPT;
  return VOKASI_DEPT_LOOKUP[`${shop}|${lokasi}`];
}

/** "KARAWANG #1" / "Karawang 1" / "KRW1" → "KARAWANG #1"; "" when empty;
 * null for any other location (those rows are out of scope for now). */
function normalizeVokasiLokasi(raw: string): "KARAWANG #1" | "KARAWANG #2" | "" | null {
  const s = raw.toUpperCase().replace(/[#.]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (/^(KARAWANG|KRW) ?1$/.test(s)) return "KARAWANG #1";
  if (/^(KARAWANG|KRW) ?2$/.test(s)) return "KARAWANG #2";
  return null;
}

/** Comparison key for a raw SHOP value (case/space-insensitive). */
export function shopKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Closest standard shop for a non-standard value — only a suggestion; the
 * admin confirms it before it's used. */
export function suggestShop(raw: string): string {
  const k = shopKey(raw).replace(/[^A-Z]/g, "");
  let best: string = VOKASI_SHOPS[0];
  let bestDist = Infinity;
  for (const shop of VOKASI_SHOPS) {
    const d = levenshtein(k, shop.replace(/[^A-Z]/g, ""));
    if (d < bestDist) {
      best = shop;
      bestDist = d;
    }
  }
  return best;
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, MEI: 5, JUN: 6, JUL: 7, AUG: 8, AGU: 8, AGS: 8, SEP: 9, OCT: 10, OKT: 10, NOV: 11, DEC: 12, DES: 12,
};

/** "28 MAY 2026" / "28 MEI 2026" → "2026-05-28". */
function parseWordDate(day: string, month: string, year: string): string {
  const m = MONTHS[month.toUpperCase().slice(0, 3)];
  return m ? isoFromParts(Number(year), m, Number(day)) : "";
}

/** Batch number and placement dates from the raw file's title row, e.g.
 * "PLACEMENT VOKASI 28 MAY 2026 - 27 NOVEMBER 2026 (6 BULAN ) BATCH #125". */
function parseVokasiTitle(text: string): { batch: string; start: string; end: string } {
  const batch = text.match(/BATCH\s*#?\s*(\d+)/i)?.[1] ?? "";
  const dates = Array.from(text.matchAll(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/g)).map((m) => parseWordDate(m[1], m[2], m[3]));
  return { batch, start: dates[0] ?? "", end: dates[1] ?? "" };
}

/** Reads the first sheet as a grid, finds the real header row (the first
 * row with a "Noreg" cell — row 1 in the starting file, row 3 in the raw
 * file) and turns everything below it into objects. Rows above the header
 * are returned as title text. */
async function readVokasiSheet(file: File): Promise<{ rows: Record<string, unknown>[]; headers: string[]; title: string }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false }) as unknown[][];
  const headerIdx = grid.findIndex((r, i) => i < 15 && r.some((c) => normalizeHeader(String(c ?? "")) === "noreg"));
  if (headerIdx < 0) return { rows: [], headers: [], title: "" };
  const headerCells = grid[headerIdx].map((c) => String(c ?? "").trim());
  const title = grid
    .slice(0, headerIdx)
    .map((r) => r.map((c) => String(c ?? "").trim()).filter(Boolean).join(" "))
    .join(" ");
  const rows: Record<string, unknown>[] = [];
  for (const r of grid.slice(headerIdx + 1)) {
    if (!r.some((c) => String(c ?? "").trim() !== "")) continue;
    const obj: Record<string, unknown> = {};
    headerCells.forEach((h, i) => {
      if (h) obj[h] = r[i] ?? "";
    });
    rows.push(obj);
  }
  return { rows, headers: headerCells.filter(Boolean), title };
}

/** Parsed but not yet final: `shop` holds the raw SHOP key until the
 * uploader confirms its standard value (see finalizeVokasiRecord). */
export type VokasiParsedRecord = Omit<VokasiRecord, "id" | "upload_date">;

export interface VokasiShopValue {
  /** Raw value as it appears in the file (first spelling seen). */
  raw: string;
  key: string;
  count: number;
  /** Set when the value already is one of VOKASI_SHOPS. */
  standard?: string;
  suggestion: string;
}

export interface VokasiParseResult {
  records: VokasiParsedRecord[];
  totalRows: number;
  skipped: number;
  skipBreakdown: SkipBreakdown;
  columns: ColumnCheck;
  format: "starting" | "raw";
  /** Batch comes from the file (Batch column or raw title) rather than the
   * uploader's Batch field. */
  batchFromFile: boolean;
  batches: { batch: string; count: number }[];
  title?: { batch: string; start: string; end: string };
  shopValues: VokasiShopValue[];
}

export async function parseVokasiFile(file: File, defaultTglMasuk: string): Promise<VokasiParseResult> {
  const { rows, headers, title: titleText } = await readVokasiSheet(file);
  const present = new Set(headers.map(normalizeHeader));
  const has = (aliases: string[]) => aliases.some((a) => present.has(normalizeHeader(a)));
  const title = titleText ? parseVokasiTitle(titleText) : undefined;
  const format: VokasiParseResult["format"] = title ? "raw" : "starting";
  const hasBatchColumn = has(VOKASI_ALIASES.batch);
  const batchFromFile = hasBatchColumn || Boolean(title?.batch);
  const columns: ColumnCheck = {
    missingRequired: [
      { label: "Noreg", aliases: VOKASI_ALIASES.noreg },
      { label: "Nama", aliases: VOKASI_ALIASES.nama },
      { label: "Shop", aliases: VOKASI_ALIASES.shop },
      { label: "Lokasi", aliases: VOKASI_ALIASES.lokasi },
      { label: "Gender / Jenis Kelamin", aliases: VOKASI_ALIASES.gender },
    ]
      .filter((r) => !has(r.aliases))
      .map((r) => r.label),
    missingBaseline: [],
    extra: extraColumnsOf(headers, (n) => VOKASI_KNOWN.has(n), new Set()),
  };
  const skipBreakdown = emptySkipBreakdown();
  const kept: { record: VokasiParsedRecord; tglFromFile: string }[] = [];
  const shopCounts = new Map<string, VokasiShopValue>();

  for (const row of rows) {
    const noreg = findValue(row, VOKASI_ALIASES.noreg).trim();
    if (!noreg) {
      addReason(skipBreakdown, "Noreg kosong");
      continue;
    }
    const shopRaw = findValue(row, VOKASI_ALIASES.shop);
    const key = shopKey(shopRaw);
    const lokasi = normalizeVokasiLokasi(findValue(row, VOKASI_ALIASES.lokasi));
    // Only Karawang #1/#2 are in scope for now; PPIC may have no Lokasi yet.
    if (lokasi === null) {
      addReason(skipBreakdown, "Lokasi di luar Karawang #1/#2");
      continue;
    }
    if (lokasi === "" && key !== "PPIC") {
      addReason(skipBreakdown, "Lokasi kosong");
      continue;
    }
    if (!key) {
      addReason(skipBreakdown, "Shop kosong");
      continue;
    }
    const standard = VOKASI_SHOPS.find((sh) => sh === key);
    const sv = shopCounts.get(key) ?? { raw: shopRaw.trim(), key, count: 0, standard, suggestion: standard ?? suggestShop(key) };
    sv.count++;
    shopCounts.set(key, sv);

    const plant = mapPersAreaToPlant(findValue(row, PERS_AREA_ALIASES) || lokasi);
    const plantLabel = plant ?? "(Lokasi kosong)";
    skipBreakdown.plantCounts[plantLabel] = (skipBreakdown.plantCounts[plantLabel] ?? 0) + 1;

    const tglRaw = findValue(row, VOKASI_ALIASES.tglMasuk);
    const tglFromFile = toIsoDate(tglRaw);
    if (tglRaw && !tglFromFile) addWarning(skipBreakdown, "Tgl Masuk tidak terbaca");
    const batch = (hasBatchColumn ? findValue(row, VOKASI_ALIASES.batch).trim() : "") || title?.batch || "";
    const laborType = normalizeLaborType(findValue(row, VOKASI_ALIASES.laborType));
    const record: VokasiParsedRecord = {
      noreg,
      nama: findValue(row, VOKASI_ALIASES.nama).trim(),
      batch,
      div: findValue(row, VOKASI_ALIASES.div).trim(),
      dept: findValue(row, VOKASI_ALIASES.dept).trim(),
      shop: key,
      lokasi,
      plant: plant ?? "",
      tgl_masuk: "",
      tgl_ended: "",
      utilisasi: findValue(row, VOKASI_ALIASES.utilisasi),
      status_saat_ini: "Active" as const,
      gender: normalizeGender(findValue(row, VOKASI_ALIASES.gender)),
      // Vokasi Reguler places into production lines; the file carries no
      // Labor Type, so it counts as Labor A (user decision).
      labor_type: laborType || "A",
    };
    const extra = extraValues(row, columns.extra);
    if (Object.keys(extra).length) record.extra = extra;
    kept.push({ record, tglFromFile });
  }

  // Tgl Masuk is one date per batch: a blank cell takes its batch's date
  // (most common in the file), then the raw title's start date, then the
  // uploader's default.
  const batchDates = new Map<string, Map<string, number>>();
  for (const { record, tglFromFile } of kept) {
    if (!tglFromFile) continue;
    const m = batchDates.get(record.batch) ?? new Map<string, number>();
    m.set(tglFromFile, (m.get(tglFromFile) ?? 0) + 1);
    batchDates.set(record.batch, m);
  }
  const batchDate = (batch: string) => {
    const m = batchDates.get(batch);
    return m ? Array.from(m).sort((a, b) => b[1] - a[1])[0][0] : "";
  };
  const batchCounts = new Map<string, number>();
  for (const { record, tglFromFile } of kept) {
    let tgl = tglFromFile;
    if (!tgl) {
      tgl = batchDate(record.batch) || title?.start || "";
      // The raw monthly file has no date column by design — its title is
      // the source, so only flag blanks in a file that has the column.
      if (tgl && has(VOKASI_ALIASES.tglMasuk)) addWarning(skipBreakdown, "Tgl Masuk kosong, diisi dari tanggal batch-nya");
      else tgl = defaultTglMasuk;
    }
    record.tgl_masuk = tgl;
    // Business rule: Vokasi selalu 6 bulan − 1 hari dari tgl_masuk.
    record.tgl_ended = computeVokasiEndedDate(tgl);
    if (record.batch) batchCounts.set(record.batch, (batchCounts.get(record.batch) ?? 0) + 1);
  }
  if (title?.end && kept[0] && kept[0].record.tgl_ended !== title.end) {
    addWarning(skipBreakdown, `Tgl selesai di judul (${title.end}) beda dengan hitungan 6 bulan (${kept[0].record.tgl_ended})`);
  }

  const records = kept.map((k) => k.record);
  const batches = Array.from(batchCounts, ([batch, count]) => ({ batch, count })).sort((a, b) =>
    a.batch.localeCompare(b.batch, undefined, { numeric: true })
  );
  const shopValues = Array.from(shopCounts.values()).sort((a, b) => Number(Boolean(a.standard)) - Number(Boolean(b.standard)) || b.count - a.count);
  return {
    records,
    totalRows: rows.length,
    skipped: rows.length - records.length,
    skipBreakdown,
    columns,
    format,
    batchFromFile,
    batches,
    title,
    shopValues,
  };
}

/** Applies the confirmed standard Shop and, when the file didn't carry
 * them (raw monthly file), Div/Dept from the Shop + Lokasi lookup. */
export function finalizeVokasiRecord(r: VokasiParsedRecord, standardShop: string): VokasiParsedRecord {
  const lookup = !r.div || !r.dept ? lookupVokasiDivDept(standardShop, r.lokasi) : undefined;
  return { ...r, shop: standardShop, div: r.div || lookup?.div || "", dept: r.dept || lookup?.dept || "" };
}
