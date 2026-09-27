import { describe, expect, it, vi } from "vitest";
import { deleteVokasiBatch, generatePkwtReviews, setDemandReplacementByNoreg } from "@/lib/engine/actions";
import { computeReviewDate } from "@/lib/engine/compute";
import { beforeWorkingSet } from "@/lib/history";
import { activateSnapshot, demandStore, pkwtReviewStore, zparStore } from "@/lib/repo";
import { answerWorkingSetsWithRpcResponder, calls, setRpcResponder, setTableRows } from "../helpers/fakeSupabase";
import { demand, employee, review, vokasi } from "../helpers/fixtures";

// The large tables keep only their working set in the browser (see
// supabase/migration_20.sql). Where an action needs an older row, it reads
// it from the database first. Here the working sets come back empty, so
// every row set with setTableRows is "older".

function emptyWorkingSets() {
  answerWorkingSetsWithRpcResponder(true);
  setRpcResponder(() => ({ data: [], error: null }));
}

describe("actions that need rows older than the working set", () => {
  it("does not create a PKWT review again when it only exists in the database", async () => {
    emptyWorkingSets();
    const emp = employee({ noreg: "026001", status_kontrak: "Kontrak 2", tgl_masuk: "2020-01-01" });
    const tglReview = computeReviewDate(emp.tgl_masuk, emp.status_kontrak);
    expect(beforeWorkingSet(tglReview)).toBe(true);
    setTableRows("pkwt_reviews", [review({ id: "old", noreg: "026001", tgl_review: tglReview, review_result: "Continue" })]);
    zparStore.insert({
      id: "snap",
      period: "2026-09",
      filename: "zpar.csv",
      upload_date: "2026-09-01T00:00:00Z",
      is_active: false,
      employees: [emp],
    });
    activateSnapshot("snap");

    const run = await generatePkwtReviews();

    expect(run.created).toBe(0);
    expect(calls.some((c) => c.table === "pkwt_reviews" && c.op === "insert")).toBe(false);
    expect(pkwtReviewStore.get("old")?.review_result).toBe("Continue");
  });

  it("deletes an old Vokasi batch that isn't in the browser", async () => {
    emptyWorkingSets();
    setTableRows("vokasi_records", [
      vokasi({ id: "v1", noreg: "TM001", batch: "2019-A" }),
      vokasi({ id: "v2", noreg: "TM002", batch: "2019-A" }),
    ]);

    const result = await deleteVokasiBatch("2019-A");

    expect(result.ok).toBe(true);
    const ops = calls
      .filter((c) => c.op === "rpc:apply_changes")
      .flatMap((c) => (c.payload as { ops: { op: string; id: string }[] }).ops);
    expect(ops.map((o) => `${o.op}:${o.id}`).sort()).toEqual(["delete:v1", "delete:v2"]);
  });

  it("still refuses an old batch whose record raised a demand", async () => {
    emptyWorkingSets();
    setTableRows("vokasi_records", [vokasi({ id: "v1", batch: "2019-A" })]);
    setTableRows("demands", [
      demand({ id: "d1", origin_type: "VokasiEnded", origin_ref: "v1", replacement_noreg: "TM900", status: "Fulfilled" }),
    ]);

    const result = await deleteVokasiBatch("2019-A");

    expect(result.ok).toBe(false);
    expect(demandStore.get("d1")).toBeDefined();
  });

  it("recognises an alumnus from an old batch as Vokasi when mapped as replacement", async () => {
    emptyWorkingSets();
    setTableRows("vokasi_records", [vokasi({ noreg: "TM777", nama: "Rina", batch: "2019-A", dept: "Assy 1" })]);
    demandStore.insert(demand({ id: "d1", category: "Vokasi", dept: "Assy 1" }));

    setDemandReplacementByNoreg("d1", "TM777", "Vokasi New Hire");

    await vi.waitFor(() => expect(calls.some((c) => c.op === "rpc:set_demand_replacement")).toBe(true));
    const sent = calls.find((c) => c.op === "rpc:set_demand_replacement")?.payload;
    expect(sent).toMatchObject({ p_nama: "Rina", p_batch: "2019-A", p_employment_status: "Vokasi" });
  });
});
