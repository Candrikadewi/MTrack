// History → Arsip: searching the whole of a large table in the database,
// a page at a time — including rows older than the working set the
// browser keeps (see supabase/migration_20.sql).
import { dataClient } from "./storage";
import { fmtDate } from "./engine/compute";
import type { Demand, PkwtReview, UtilPoolEntry, VokasiRecord } from "./types";

export type ArchiveKind = "demands" | "pkwt_reviews" | "vokasi_records" | "util_pool";

interface ArchiveTable<T> {
  label: string;
  columns: string[];
  select: string;
  /** Columns the search text is matched against. */
  search: string[];
  /** Newest first by this column. */
  order: string;
  cells(row: T): string[];
}

const date = (d: string | null | undefined) => (d ? fmtDate(d) : "-");
const person = (noreg: string, nama: string) => [noreg, nama].filter(Boolean).join(" · ") || "-";

export const ARCHIVE_TABLES: { [K in ArchiveKind]: ArchiveTable<never> } = {
  demands: {
    label: "Demand",
    columns: ["Dibuat", "Jenis", "Yang keluar", "Pengganti", "Dept", "Status"],
    select:
      "id, created_at, category, origin_type, origin_label, outgoing_noreg, outgoing_nama, outgoing_label, replacement_noreg, replacement_nama, replacement_status, dept, status, shop_confirmed_date",
    search: ["outgoing_noreg", "outgoing_nama", "outgoing_label", "replacement_noreg", "replacement_nama", "dept"],
    order: "created_at",
    cells: ((d: Demand) => [
      date(d.created_at?.slice(0, 10)),
      `${d.category} · ${d.origin_type}`,
      d.outgoing_label || person(d.outgoing_noreg, d.outgoing_nama),
      d.replacement_status === "No Replace" ? "No Replace" : person(d.replacement_noreg, d.replacement_nama),
      d.dept || "-",
      d.shop_confirmed_date ? `Diterima shop ${date(d.shop_confirmed_date)}` : d.status,
    ]) as (row: never) => string[],
  },
  pkwt_reviews: {
    label: "Review PKWT",
    columns: ["Tgl Review", "Karyawan", "Status Kontrak", "Dept", "Hasil"],
    select: "id, tgl_review, noreg, nama, status_kontrak, dept, review_result",
    search: ["noreg", "nama", "dept"],
    order: "tgl_review",
    cells: ((r: PkwtReview) => [
      date(r.tgl_review),
      person(r.noreg, r.nama),
      r.status_kontrak,
      r.dept || "-",
      r.review_result || "Belum diisi",
    ]) as (row: never) => string[],
  },
  vokasi_records: {
    label: "Vokasi",
    columns: ["Batch", "Vokasi", "Dept", "Masuk", "Ended"],
    select: "id, batch, noreg, nama, dept, tgl_masuk, tgl_ended",
    search: ["noreg", "nama", "batch", "dept"],
    order: "tgl_ended",
    cells: ((v: VokasiRecord) => [v.batch, person(v.noreg, v.nama), v.dept || "-", date(v.tgl_masuk), date(v.tgl_ended)]) as (
      row: never
    ) => string[],
  },
  util_pool: {
    label: "Supply Pool",
    columns: ["Masuk Pool", "MP", "Sumber", "Dept asal", "Status"],
    select: "id, entered_pool_date, noreg, nama, type, source, source_label, prev_dept, status",
    search: ["noreg", "nama", "source_label", "prev_dept"],
    order: "entered_pool_date",
    cells: ((e: UtilPoolEntry) => [
      date(e.entered_pool_date),
      `${person(e.noreg, e.nama)} (${e.type})`,
      e.source_label || e.source,
      e.prev_dept || "-",
      e.status,
    ]) as (row: never) => string[],
  },
};

export const ARCHIVE_PAGE_SIZE = 50;

/** Characters that would break PostgREST's `or=(…)` filter syntax are
 * dropped; what's left (quoted) is matched anywhere in each column. */
export function archiveSearchFilter(kind: ArchiveKind, text: string): string | null {
  const term = text
    .replace(/[^\p{L}\p{N} ./-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!term) return null;
  return ARCHIVE_TABLES[kind].search.map((col) => `${col}.ilike."*${term}*"`).join(",");
}

export interface ArchivePage {
  rows: { id: string; cells: string[] }[];
  hasMore: boolean;
}

/** One page (0-based) of the table, newest first, matching `text`. */
export async function searchArchive(kind: ArchiveKind, text: string, page: number): Promise<ArchivePage> {
  const table = ARCHIVE_TABLES[kind];
  let query = dataClient().from(kind).select(table.select);
  const filter = archiveSearchFilter(kind, text);
  if (filter) query = query.or(filter);
  const from = page * ARCHIVE_PAGE_SIZE;
  // One row more than a page tells whether there is a next page, without
  // counting a table of millions.
  const res: { data: ({ id: string } & Record<string, unknown>)[] | null; error: { message: string } | null } = await query
    .order(table.order, { ascending: false, nullsFirst: false })
    .order("id")
    .range(from, from + ARCHIVE_PAGE_SIZE);
  if (res.error) throw new Error(res.error.message);
  const data = res.data ?? [];
  return {
    rows: data.slice(0, ARCHIVE_PAGE_SIZE).map((row) => ({ id: row.id, cells: table.cells(row as never) })),
    hasMore: data.length > ARCHIVE_PAGE_SIZE,
  };
}
