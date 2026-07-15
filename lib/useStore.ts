"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { subscribeStorage, getChangeVersion } from "./storage";
import type { Store } from "./storage";

const EMPTY: unknown[] = [];

/**
 * Subscribes a component to a Store's contents, re-rendering on any change.
 * store.list() returns a stable array reference until the next mutation, so
 * no extra snapshot caching is needed here. Triggers the store's lazy
 * (client-only) hydration + realtime subscription on mount.
 */
export function useStoreList<T extends { id: string }>(store: Store<T>): T[] {
  useEffect(() => {
    store.init();
  }, [store]);

  const getSnapshot = useCallback(() => store.list(), [store]);
  const getServerSnapshot = useCallback(() => EMPTY as T[], []);
  return useSyncExternalStore(subscribeStorage, getSnapshot, getServerSnapshot);
}

/** Forces a re-render on any mtrack data change without materializing a snapshot value. */
export function useDataVersion(): number {
  const getSnapshot = useCallback(() => getChangeVersion(), []);
  return useSyncExternalStore(subscribeStorage, getSnapshot, () => 0);
}
