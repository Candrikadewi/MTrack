// Small builders for test data: each fills every required field with a
// sensible default, so a test only spells out what it is about.
import type { Demand, EmployeeRecord, PkwtReview, UtilPoolEntry, VokasiRecord } from "@/lib/types";

export function employee(overrides: Partial<EmployeeRecord> = {}): EmployeeRecord {
  return {
    noreg: "5000001",
    nama: "Andi",
    labor_type: "A",
    tgl_masuk: "2020-01-01",
    status_kontrak: "Permanen",
    eg: "Active",
    directorat: "Production",
    division: "Assy",
    dept: "Assy 1",
    section: "",
    line: "",
    tgl_lahir: "1995-01-01",
    gender: "L",
    plant: "Vehicle Plant",
    posisi_struktural: "Team Member",
    ...overrides,
  };
}

export function vokasi(overrides: Partial<VokasiRecord> = {}): VokasiRecord {
  return {
    id: "v1",
    noreg: "TM001",
    nama: "Luna",
    batch: "110",
    div: "Assy",
    dept: "Assy 1",
    shop: "ASSEMBLY",
    lokasi: "KARAWANG #1",
    plant: "Vehicle Plant",
    tgl_masuk: "2025-05-01",
    tgl_ended: "2025-10-31",
    utilisasi: "",
    status_saat_ini: "Active",
    gender: "P",
    labor_type: "A",
    upload_date: "2025-05-01",
    ...overrides,
  };
}

export function demand(overrides: Partial<Demand> = {}): Demand {
  return {
    id: "d1",
    category: "PKWT",
    origin_type: "Manual",
    origin_ref: "",
    outgoing_noreg: "",
    outgoing_nama: "",
    outgoing_label: "",
    div: "Assy",
    dept: "Assy 1",
    tgl_masuk_outgoing: "",
    tgl_ended_outgoing: "",
    fulfill_date: "2026-09-15",
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
    created_at: "2026-09-01",
    ...overrides,
  };
}

export function review(overrides: Partial<PkwtReview> = {}): PkwtReview {
  return {
    id: "r1",
    noreg: "026001",
    nama: "Budi",
    status_kontrak: "Kontrak 1.1",
    div: "Assy",
    dept: "Assy 1",
    tgl_masuk: "2024-10-01",
    tgl_review: "2026-09-30",
    review_result: "",
    labor_type: "A",
    ...overrides,
  };
}

export function poolEntry(overrides: Partial<UtilPoolEntry> = {}): UtilPoolEntry {
  return {
    id: "u1",
    noreg: "026001",
    nama: "Budi",
    type: "PKWT",
    source: "Kaizen",
    source_label: "Kaizen 2026 Labor A/F - Assy (Line balancing)",
    prev_div: "Assy",
    prev_dept: "Assy 1",
    entered_pool_date: "2026-09-01",
    contract_end: "2027-03-31",
    status: "Open",
    action_note: "",
    ...overrides,
  };
}
