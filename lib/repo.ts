import { createStore, dataClient, transaction } from "./storage";
import { createSnapshotStore } from "./snapshots";
import type {
  ZparSnapshot,
  VokasiRecord,
  PkwtReview,
  Demand,
  Project,
  TaktCase,
  UtilPoolEntry,
  HandoverForm,
  ColumnDecision,
  ValueMapping,
} from "./types";

export const zparStore = createSnapshotStore();
// The four tables that grow without end keep only their working set in the
// browser (supabase/migration_20.sql): what is still running, the last 12
// months, and whatever those refer to. Older rows are read on demand.
export const vokasiStore = createStore<VokasiRecord>("vokasi_records", { workingSet: "vokasi_records_working_set" });
export const pkwtReviewStore = createStore<PkwtReview>("pkwt_reviews", { workingSet: "pkwt_reviews_working_set" });
export const demandStore = createStore<Demand>("demands", { workingSet: "demands_working_set" });
export const projectStore = createStore<Project>("projects");
export const taktStore = createStore<TaktCase>("takt_cases");
export const utilPoolStore = createStore<UtilPoolEntry>("util_pool", { workingSet: "util_pool_working_set" });
export const handoverStore = createStore<HandoverForm>("handover_forms");
export const columnDecisionStore = createStore<ColumnDecision>("column_decisions");
export const valueMappingStore = createStore<ValueMapping>("value_mappings");

export function getActiveSnapshot(): ZparSnapshot | undefined {
  return zparStore.list().find((s) => s.is_active);
}

export function activateSnapshot(id: string): void {
  transaction(() => {
    for (const s of zparStore.list()) {
      const shouldBeActive = s.id === id;
      if (s.is_active !== shouldBeActive) zparStore.update(s.id, { is_active: shouldBeActive });
    }
  });
}

/** Deletes every row of every data table in the database (not just what
 * this browser has loaded — most history isn't). Resolves to the first
 * error, or null. */
export async function clearAllData(): Promise<string | null> {
  const stores = [zparStore, vokasiStore, pkwtReviewStore, demandStore, projectStore, taktStore, utilPoolStore, handoverStore];
  let failure: string | null = null;
  for (const store of stores) {
    // PostgREST refuses a delete without a filter; every row has an id.
    const res: { error: { message: string } | null } = await dataClient().from(store.key).delete().not("id", "is", null);
    if (res.error && !failure) failure = `${store.key}: ${res.error.message}`;
  }
  for (const store of stores) store.refetch();
  return failure;
}
