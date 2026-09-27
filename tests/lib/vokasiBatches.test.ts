import { describe, expect, it } from "vitest";
import { vokasiStore } from "@/lib/repo";
import { fetchVokasiBatches } from "@/lib/vokasiBatches";
import { setRpcResponder } from "../helpers/fakeSupabase";
import { vokasi } from "../helpers/fixtures";

describe("Upload Center batch list", () => {
  it("comes from the database, counting batches the browser doesn't hold", async () => {
    setRpcResponder((fn) =>
      fn === "vokasi_batch_summary"
        ? { data: [{ batch: "2019-A", records: "120", upload_date: "2019-03-01T00:00:00Z" }], error: null }
        : { data: null, error: null }
    );
    expect(await fetchVokasiBatches()).toEqual([{ batch: "2019-A", count: 120, upload_date: "2019-03-01T00:00:00Z" }]);
  });

  it("is counted from the records in the browser until migration_20 is run", async () => {
    setRpcResponder(() => ({ data: null, error: { message: "Could not find the function public.vokasi_batch_summary" } }));
    vokasiStore.insert(vokasi({ id: "a", batch: "110", upload_date: "2026-01-01" }));
    vokasiStore.insert(vokasi({ id: "b", batch: "110", upload_date: "2026-02-01" }));
    vokasiStore.insert(vokasi({ id: "c", batch: "111", upload_date: "2026-03-01" }));
    expect(await fetchVokasiBatches()).toEqual([
      { batch: "111", count: 1, upload_date: "2026-03-01" },
      { batch: "110", count: 2, upload_date: "2026-02-01" },
    ]);
  });
});
