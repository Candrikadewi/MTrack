// Pure computed-field functions — see MTRACK_SPEC.md §12 "Aturan Bisnis & Field Turunan".
import { addDays, addMonths, differenceInCalendarDays, differenceInCalendarMonths, format, parseISO } from "date-fns";
import type { StatusKontrak, VokasiStatusSaatIni } from "../types";

export function today(): Date {
  return new Date(new Date().toDateString());
}

export function monthKey(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "yyyy-MM");
}

export function fmtDate(date: string | null | undefined): string {
  if (!date) return "-";
  try {
    return format(parseISO(date), "dd MMM yyyy");
  } catch {
    return date;
  }
}

/** §12: tgl_review = tgl_masuk + 24 bulan − 1 hari (Kontrak 1.1/1.2) atau +36 bulan − 1 hari (Kontrak 2) */
export function computeReviewDate(tglMasuk: string, statusKontrak: StatusKontrak): string {
  const months = statusKontrak === "Kontrak 2" ? 36 : 24;
  return format(addDays(addMonths(parseISO(tglMasuk), months), -1), "yyyy-MM-dd");
}

/** §12: Vokasi tgl_ended = tgl_masuk + 6 bulan − 1 hari. */
export function computeVokasiEndedDate(tglMasuk: string): string {
  if (!tglMasuk) return "";
  return format(addDays(addMonths(parseISO(tglMasuk), 6), -1), "yyyy-MM-dd");
}

/** §12: sisa_hari = tanggal_target − hari ini (bisa negatif) */
export function sisaHari(targetDate: string): number {
  if (!targetDate) return NaN;
  return differenceInCalendarDays(parseISO(targetDate), today());
}

/**
 * §12: Status Vokasi.
 * Active: belum waktunya ended.
 * Overlapping: sudah ada pengganti tapi belum resmi ended.
 * Need Replace: sudah masuk bulan ended, belum ada pengganti.
 * Ended: sudah lewat & ada pengganti.
 */
export function computeVokasiStatus(tglEnded: string, hasFulfilledReplacement: boolean): VokasiStatusSaatIni {
  const due = sisaHari(tglEnded) <= 0;
  if (!due) return hasFulfilledReplacement ? "Overlapping" : "Active";
  return hasFulfilledReplacement ? "Ended" : "Need Replace";
}

/**
 * §12: fs_status (PKWT Demand) — Need FS jika dept pengganti berbeda dari dept outgoing,
 * ATAU dept sama tapi vokasi pengganti sudah tgl_ended > 3 bulan lalu.
 */
export function computeFsStatus(
  outgoingDept: string,
  replacementDept: string,
  replacementVokasiTglEnded: string | undefined
): "Need FS" | "No Need FS" {
  if (!replacementDept) return "No Need FS";
  if (replacementDept !== outgoingDept) return "Need FS";
  if (replacementVokasiTglEnded) {
    const monthsSinceEnded = differenceInCalendarMonths(today(), parseISO(replacementVokasiTglEnded));
    if (monthsSinceEnded > 3) return "Need FS";
  }
  return "No Need FS";
}

export type ContractUrgency = "red" | "orange" | "green" | "none";

/** §12: Sisa Kontrak (Util Pool) — merah ≤30 hari, oranye ≤60 hari, hijau selebihnya. */
export function contractUrgency(contractEnd: string | null): ContractUrgency {
  if (contractEnd === null) return "none"; // Permanent
  const days = sisaHari(contractEnd);
  if (days <= 30) return "red";
  if (days <= 60) return "orange";
  return "green";
}

export function contractRemainingLabel(contractEnd: string | null): string {
  if (contractEnd === null) return "Permanent";
  const days = sisaHari(contractEnd);
  return `${days} hari`;
}
