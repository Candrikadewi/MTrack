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
  return zparStore.list().find((s) => s.isActive);
}

export function activateSnapshot(id: string): void {
  const all = zparStore.list();
  zparStore.replaceAll(all.map((s) => ({ ...s, isActive: s.id === id })));
}
