// Looking people up in the active ZPAR snapshot and the Vokasi records.
import { vokasiStore, getActiveSnapshot } from "../../repo";
import { computeReviewDate } from "../compute";
import { isPermanenForRatio } from "../../types";
import type { DemandCategory, EmployeeRecord, EmploymentStatus, MpStatusKategori, VokasiRecord } from "../../types";

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
