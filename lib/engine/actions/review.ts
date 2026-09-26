// PKWT review: generating the reviews that fall due, and saving Continue / Terminate
// (Terminate opens a replacement demand server-side).
import { genId } from "../../storage";
import { demandStore, pkwtReviewStore, getActiveSnapshot } from "../../repo";
import { createClient } from "../../supabase/client";
import { pushToast } from "../../toast";
import { computeReviewDate } from "../compute";
import { KONTRAK_REVIEW_STATUSES } from "../../types";
import type { PkwtReview, ReviewResult } from "../../types";

export interface PkwtReviewRun {
  /** Active snapshot period the run read, or null when none is active. */
  period: string | null;
  /** Kontrak 1.1 / 1.2 / 2 employees in that snapshot. */
  eligible: number;
  /** Of those, how many have no readable Tgl Masuk (no review date). */
  noTglMasuk: number;
  created: number;
  error?: string;
}

/** Creates the PKWT review for every Kontrak 1.1/1.2/2 employee of the
 * active snapshot that doesn't have one yet (idempotent). Resolves once
 * Supabase has the rows; an insert failure is surfaced as a toast instead
 * of only reaching the console, since it otherwise leaves the review chart
 * empty with no hint why. */
export async function generatePkwtReviews(): Promise<PkwtReviewRun> {
  const snap = getActiveSnapshot();
  if (!snap) return { period: null, eligible: 0, noTglMasuk: 0, created: 0 };
  const existing = new Set(pkwtReviewStore.list().map((r) => `${r.noreg}|${r.tgl_review}`));
  const toCreate: PkwtReview[] = [];
  let eligible = 0;
  let noTglMasuk = 0;
  for (const emp of snap.employees) {
    if (!KONTRAK_REVIEW_STATUSES.includes(emp.status_kontrak)) continue;
    eligible++;
    // A blank/unreadable Tgl Masuk has no review date — skipping it keeps one
    // bad row from throwing (date-fns) or failing the whole batch insert
    // (Postgres rejects "" for a date column).
    const tgl_review = computeReviewDate(emp.tgl_masuk, emp.status_kontrak);
    if (!tgl_review) {
      noTglMasuk++;
      continue;
    }
    const key = `${emp.noreg}|${tgl_review}`;
    if (existing.has(key)) continue; // keep as-is (preserves review_result / demand_id)
    existing.add(key);
    toCreate.push({
      id: genId("pkwtrev"),
      noreg: emp.noreg,
      nama: emp.nama,
      status_kontrak: emp.status_kontrak,
      div: emp.division,
      dept: emp.dept,
      tgl_masuk: emp.tgl_masuk,
      tgl_review,
      review_result: "" as ReviewResult,
      labor_type: emp.labor_type,
    });
  }
  const base = { period: snap.period, eligible, noTglMasuk };
  if (toCreate.length === 0) return { ...base, created: 0 };
  // One insertMany call, not one insert per employee: hundreds of
  // concurrent requests risked partial failures (see set_review_result).
  const error = await pkwtReviewStore.insertManyPersisted(toCreate);
  if (error) {
    pkwtReviewStore.refetch();
    pushToast(`Gagal membuat review PKWT: ${error}`);
    return { ...base, created: 0, error };
  }
  return { ...base, created: toCreate.length };
}

/**
 * Routed through the `set_review_result` Postgres RPC (see supabase/schema.sql)
 * so the Admin/HR-only rule is enforced in the database, not just the UI.
 * Applies an optimistic local update immediately (the RPC bypasses the
 * generic Store.update() write path, so without this the UI only reflects
 * the change once a realtime event arrives) and reverts + surfaces the
 * error if the RPC itself is rejected (e.g. a role/permission mismatch).
 */
export function setReviewResult(reviewId: string, result: ReviewResult): void {
  const previous = pkwtReviewStore.get(reviewId)?.review_result;
  pkwtReviewStore.patchLocal(reviewId, { review_result: result });
  const supabase = createClient();
  supabase
    .rpc("set_review_result", { p_review_id: reviewId, p_result: result })
    .then((res: { error: { message: string } | null }) => {
      if (res.error) {
        console.error("set_review_result failed:", res.error.message);
        pkwtReviewStore.patchLocal(reviewId, { review_result: previous ?? "" });
        pushToast(`Gagal menyimpan review result: ${res.error.message}`);
        return;
      }
      // On Terminate, the RPC creates a new Demand server-side — the client
      // never inserted it locally, so without this the new "PKWT Demand" row
      // only shows up once/if a realtime event arrives. Re-fetch instead of
      // waiting on that.
      if (result === "Terminate") demandStore.refetch();
    });
}

/** The same as setReviewResult for many reviews at once (a whole dept
 * marked Continue, say). Reviews that already have this result are
 * skipped; the calls go out a few at a time and end in one toast. */
export async function setReviewResults(reviewIds: string[], result: ReviewResult): Promise<{ saved: number; failed: number }> {
  const targets = reviewIds
    .map((id) => pkwtReviewStore.get(id))
    .filter((r): r is PkwtReview => r !== undefined && r.review_result !== result);
  const previous = new Map(targets.map((r) => [r.id, r.review_result]));
  for (const r of targets) pkwtReviewStore.patchLocal(r.id, { review_result: result });
  const supabase = createClient();
  let saved = 0;
  let failed = 0;
  let lastError = "";
  const queue = [...targets];
  async function worker() {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const res: { error: { message: string } | null } = await supabase.rpc("set_review_result", {
        p_review_id: r.id,
        p_result: result,
      });
      if (res.error) {
        failed++;
        lastError = res.error.message;
        pkwtReviewStore.patchLocal(r.id, { review_result: previous.get(r.id) ?? "" });
      } else saved++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
  if (result === "Terminate" && saved > 0) demandStore.refetch();
  if (failed > 0) pushToast(`${failed} review gagal disimpan: ${lastError}`);
  else if (saved > 0) pushToast(`${saved} review disimpan sebagai ${result || "kosong"}.`, "success");
  return { saved, failed };
}
