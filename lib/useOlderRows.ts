"use client";
// Reads rows older than the working set (see lib/history.ts) when a page
// needs them — a past month on the Dashboard, say — once per key.
import { useEffect, useRef, useSyncExternalStore } from "react";

const status = new Map<string, "loading" | "done">();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Runs `load` once for each `key` (null = nothing needed now); true while
 * it runs. A failed load is logged and tried again the next time the key
 * comes up. */
export function useOlderRows(key: string | null, load: () => Promise<unknown>): boolean {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    if (!key || status.has(key)) return;
    status.set(key, "loading");
    emit();
    loadRef
      .current()
      .then(
        () => status.set(key, "done"),
        (err: unknown) => {
          status.delete(key);
          console.error(`loading older rows (${key}) failed:`, err);
        }
      )
      .finally(emit);
  }, [key]);
  return useSyncExternalStore(
    subscribe,
    () => key !== null && status.get(key) === "loading",
    () => false
  );
}
