"use client";
import { useEffect, useMemo } from "react";
import { zparStore } from "./repo";
import { useStoreList } from "./useStore";
import type { EmployeeRecord, ZparSnapshot } from "./types";

/** The newest snapshot of each period ("yyyy-MM"). */
function latestByPeriod(snapshots: ZparSnapshot[]): Map<string, ZparSnapshot> {
  const map = new Map<string, ZparSnapshot>();
  for (const s of snapshots) {
    const existing = map.get(s.period);
    if (!existing || s.upload_date > existing.upload_date) map.set(s.period, s);
  }
  return map;
}

/** Periods that have a ZPAR snapshot — without loading any employees. */
export function useSnapshotPeriods(): Set<string> {
  const snapshots = useStoreList(zparStore);
  return useMemo(() => new Set(latestByPeriod(snapshots).keys()), [snapshots]);
}

/** The employees of these periods' snapshots, loading the ones not in
 * memory yet (periods without a snapshot are skipped). `loading` stays
 * true until every one of them is in, so charts never draw half the
 * months. */
export function useEmployeesByPeriod(periods: string[]): { byPeriod: Map<string, EmployeeRecord[]>; loading: boolean } {
  const snapshots = useStoreList(zparStore);
  const latest = useMemo(() => latestByPeriod(snapshots), [snapshots]);
  const wanted = periods
    .map((p) => latest.get(p))
    .filter((s): s is ZparSnapshot => Boolean(s))
    .sort((a, b) => a.period.localeCompare(b.period));
  const wantedKey = wanted.map((s) => s.id).join(",");

  useEffect(() => {
    if (wantedKey) void zparStore.loadEmployees(wantedKey.split(","));
  }, [wantedKey]);

  // `snapshots` changes whenever employees arrive, so this re-reads then.
  const loading = wanted.some((s) => !zparStore.employeesLoaded(s.id));
  const byPeriod = useMemo(
    () => new Map(wanted.filter((s) => zparStore.employeesLoaded(s.id)).map((s) => [s.period, s.employees])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wantedKey + snapshots cover `wanted`
    [wantedKey, snapshots]
  );
  return { byPeriod, loading };
}
