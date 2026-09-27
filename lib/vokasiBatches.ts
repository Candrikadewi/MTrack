// The Upload Center's Vokasi batch list: every batch ever uploaded, counted
// by the database (vokasi_batch_summary, migration_20) — the browser only
// holds the working set of Vokasi records.
import { dataClient } from "./storage";
import { vokasiStore } from "./repo";

export interface VokasiBatchRow {
  batch: string;
  count: number;
  upload_date: string;
}

/** Counted from the records in the browser — all of them while
 * migration_20 hasn't been run (the store then reads the whole table). */
function fromCache(): VokasiBatchRow[] {
  const byBatch = new Map<string, VokasiBatchRow>();
  for (const v of vokasiStore.list()) {
    const row = byBatch.get(v.batch) ?? { batch: v.batch, count: 0, upload_date: v.upload_date };
    row.count++;
    if (v.upload_date > row.upload_date) row.upload_date = v.upload_date;
    byBatch.set(v.batch, row);
  }
  return [...byBatch.values()].sort((a, b) => b.upload_date.localeCompare(a.upload_date) || a.batch.localeCompare(b.batch));
}

export async function fetchVokasiBatches(): Promise<VokasiBatchRow[]> {
  const res: {
    data: { batch: string; records: number; upload_date: string }[] | null;
    error: { message: string } | null;
  } = await dataClient().rpc("vokasi_batch_summary");
  if (res.error) {
    if (/vokasi_batch_summary/.test(res.error.message) && /could not find|does not exist/i.test(res.error.message)) {
      return fromCache();
    }
    throw new Error(res.error.message);
  }
  return (res.data ?? []).map((r) => ({ batch: r.batch, count: Number(r.records), upload_date: r.upload_date ?? "" }));
}
