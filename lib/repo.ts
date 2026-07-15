import { createStore } from "./storage";
import type {
  ZparSnapshot,
  VokasiRecord,
  PkwtReview,
  Demand,
  Project,
  TaktCase,
  UtilPoolEntry,
  HandoverForm,
} from "./types";

export const zparStore = createStore<ZparSnapshot>("zpar_snapshots");
export const vokasiStore = createStore<VokasiRecord>("vokasi_records");
export const pkwtReviewStore = createStore<PkwtReview>("pkwt_reviews");
export const demandStore = createStore<Demand>("demands");
export const projectStore = createStore<Project>("projects");
export const taktStore = createStore<TaktCase>("takt_cases");
export const utilPoolStore = createStore<UtilPoolEntry>("util_pool");
export const handoverStore = createStore<HandoverForm>("handover_forms");

export function getActiveSnapshot(): ZparSnapshot | undefined {
  return zparStore.list().find((s) => s.is_active);
}

export function activateSnapshot(id: string): void {
  for (const s of zparStore.list()) {
    const shouldBeActive = s.id === id;
    if (s.is_active !== shouldBeActive) zparStore.update(s.id, { is_active: shouldBeActive });
  }
}

export function clearAllData(): void {
  for (const store of [
    zparStore,
    vokasiStore,
    pkwtReviewStore,
    demandStore,
    projectStore,
    taktStore,
    utilPoolStore,
    handoverStore,
  ]) {
    for (const item of store.list()) store.remove(item.id);
  }
}
