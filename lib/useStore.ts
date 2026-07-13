"use client";
import { useCallback, useSyncExternalStore } from "react";
import { subscribeStorage } from "./storage";
import type { Store } from "./storage";

let globalVersion = 0;
if (typeof window !== "undefined") {
  window.addEventListener("mtrack:change", () => {
    globalVersion++;
  });
  window.addEventListener("storage", () => {
    globalVersion++;
  });
}

const snapshotCache = new WeakMap<Store<{ id: string }>, { version: number; items: unknown[] }>();
const EMPTY: unknown[] = [];

/** Subscribes a component to a Store's contents, re-rendering on any mtrack data change. */
export function useStoreList<T extends { id: string }>(store: Store<T>): T[] {
  const getSnapshot = useCallback(() => {
    const cached = snapshotCache.get(store as Store<{ id: string }>);
    if (cached && cached.version === globalVersion) return cached.items as T[];
    const items = store.list();
    snapshotCache.set(store as Store<{ id: string }>, { version: globalVersion, items });
    return items;
  }, [store]);
  const getServerSnapshot = useCallback(() => EMPTY as T[], []);
  return useSyncExternalStore(subscribeStorage, getSnapshot, getServerSnapshot);
}

/** Forces a re-render on any mtrack data change without materializing a snapshot value. */
export function useDataVersion(): number {
  const getSnapshot = useCallback(() => globalVersion, []);
  return useSyncExternalStore(subscribeStorage, getSnapshot, () => 0);
}
