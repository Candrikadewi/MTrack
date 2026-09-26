import {
  columnDecisionStore,
  demandStore,
  handoverStore,
  pkwtReviewStore,
  projectStore,
  taktStore,
  utilPoolStore,
  valueMappingStore,
  vokasiStore,
  zparStore,
} from "@/lib/repo";

const ALL_STORES = [
  zparStore,
  vokasiStore,
  pkwtReviewStore,
  demandStore,
  projectStore,
  taktStore,
  utilPoolStore,
  handoverStore,
  columnDecisionStore,
  valueMappingStore,
];

/** Empties every store and marks it loaded, as if the app had just read
 * an empty database. */
export function resetStores(): void {
  for (const store of ALL_STORES) {
    store.init = () => {};
    store.ready = () => true;
    for (const row of [...store.list()]) store.remove(row.id);
  }
}
