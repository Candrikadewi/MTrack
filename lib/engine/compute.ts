// Pure computed-field functions — see MTRACK_SPEC.md §12 "Aturan Bisnis & Field Turunan".
import {
  addBusinessDays,
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  format,
  parseISO,
  subBusinessDays,
} from "date-fns";
import type { FsStatus, ReplacementStatus, StatusKontrak, VokasiStatusSaatIni } from "../types";

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
 * §12: fs_status — Need FS jika:
 *  - Source "Vokasi New Hire" (penggantian dari intake Vokasi baru selalu new intake, selalu Need FS), ATAU
 *  - dept pengganti berbeda dari dept outgoing (cross-shop, berlaku utk PKWT New Hire maupun MP Back Up/Excess), ATAU
 *  - dept sama tapi pengganti sebelumnya Vokasi yang sudah ended > 3 bulan lalu.
 * Sebelum dept pengganti diketahui (belum ada source), caller belum boleh
 * panggil ini — fs_status tetap "" di level Demand sampai source terisi.
 */
export function computeFsStatus(
  replacementStatus: ReplacementStatus,
  outgoingDept: string,
  replacementDept: string,
  replacementVokasiTglEnded: string | undefined
): FsStatus {
  if (replacementStatus === "Vokasi New Hire") return "Need FS";
  if (!replacementDept) return "No Need FS";
  if (replacementDept !== outgoingDept) return "Need FS";
  if (replacementVokasiTglEnded) {
    const monthsSinceEnded = differenceInCalendarMonths(today(), parseISO(replacementVokasiTglEnded));
    if (monthsSinceEnded > 3) return "Need FS";
  }
  return "No Need FS";
}

/**
 * §12 lead time (Supply-Demand): sebuah demand "muncul" / actionable
 * H-4 minggu (20 hari kerja Senin-Jumat) sebelum tanggal pemenuhan (target
 * date orang itu harus hadir/aktif).
 */
export function demandVisibleDate(targetDate: string): string {
  if (!targetDate) return "";
  return format(subBusinessDays(parseISO(targetDate), 20), "yyyy-MM-dd");
}

/**
 * §12 lead time: batas MP harus sudah terfulfill (sign kontrak / resmi
 * assigned) dihitung dari tanggal demand muncul — +2 minggu (10 hari kerja)
 * selama fs_status masih "" (default, belum diketahui) atau "Need FS";
 * +3 minggu (15 hari kerja) begitu source pengganti diketahui tidak perlu FS.
 */
export function fulfillmentDeadline(targetDate: string, fsStatus: FsStatus): string {
  const visible = demandVisibleDate(targetDate);
  if (!visible) return "";
  const days = fsStatus === "No Need FS" ? 15 : 10;
  return format(addBusinessDays(parseISO(visible), days), "yyyy-MM-dd");
}

/**
 * §12 lead time (Enrollment, PKWT): the "Need to Review" stage that precedes
 * a demand even existing. `tglReview` is the PKWT review due date. Mirrors
 * the demand-side chain (H-2 minggu / 10 hari kerja per stage) so a review
 * left unfilled surfaces with the same runway as everything downstream of
 * it — reminder appears H-4 minggu before the review-fill deadline, which
 * itself lands exactly on demandVisibleDate of the eventual Arrival to Shop
 * (tglReview - 10 hari kerja), so a filled-on-time review flows straight
 * into an already-visible demand with no gap.
 */
export function reviewReminderDate(tglReview: string): string {
  if (!tglReview) return "";
  return format(subBusinessDays(parseISO(tglReview), 40), "yyyy-MM-dd");
}

export function reviewFillDeadline(tglReview: string): string {
  if (!tglReview) return "";
  return format(subBusinessDays(parseISO(tglReview), 30), "yyyy-MM-dd");
}

export type SupplyStatus = "Open" | "DELAY" | "Need Replace ASAP" | "Fulfilled Ontime" | "Fulfilled but Delay";

/**
 * Supply-Demand status ladder shown on the Supply-Demand page's Status
 * column. Layers timing on top of the shop-floor confirmation checkbox:
 * - confirmed on/before tanggal pemenuhan -> Fulfilled Ontime
 * - confirmed after tanggal pemenuhan -> Fulfilled but Delay
 * - not confirmed, past batas fulfillment -> Need Replace ASAP
 * - not confirmed, past tanggal pemenuhan (but within batas fulfillment) -> DELAY
 * - otherwise -> Open
 */
export function supplyDemandStatus(targetDate: string, deadline: string, shopConfirmedDate: string): SupplyStatus {
  if (shopConfirmedDate) {
    return targetDate && shopConfirmedDate > targetDate ? "Fulfilled but Delay" : "Fulfilled Ontime";
  }
  if (deadline && sisaHari(deadline) < 0) return "Need Replace ASAP";
  if (targetDate && sisaHari(targetDate) < 0) return "DELAY";
  return "Open";
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
