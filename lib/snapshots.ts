// ZPAR snapshots without downloading every employee of every month.
//
// A snapshot's employee list is by far the biggest thing in the database,
// and nearly every page only needs the active one. So the snapshot store
// reads each snapshot's details (period, file, how many employees) up
// front, the active snapshot's employees next, and any other month's
// employees only when something asks for them — Manpower / Labor Type
// Movement on the Dashboard, for the months they show.
//
// To the rest of the app it is still a Store<ZparSnapshot>: a snapshot
// whose employees haven't been loaded yet simply has `employees: []`.
import { createStore, dataClient, notifyDataChanged, subscribeStorage, trackInFlight, type Store } from "./storage";
import type { EmployeeRecord, ZparSnapshot } from "./types";

const DETAIL_COLUMNS = "id, period, filename, upload_date, is_active, employee_count";

export interface SnapshotStore extends Store<ZparSnapshot> {
  /** Whether this snapshot's employees are in memory (or couldn't be
   * loaded, in which case they read as []). */
  employeesLoaded(id: string): boolean;
  /** Fetches the employees of these snapshots (those not loaded or loading
   * yet). Resolves when they're in. */
  loadEmployees(ids: string[]): Promise<void>;
}

export function createSnapshotStore(): SnapshotStore {
  // Without migration_17 there's no employee_count column: read every
  // column then, as before.
  const details = createStore<ZparSnapshot>("zpar_snapshots", { select: DETAIL_COLUMNS, fallbackSelect: "*" });
  const employeesById = new Map<string, EmployeeRecord[]>();
  const loading = new Map<string, Promise<void>>();
  /** Couldn't be loaded (offline, refused): counted as done so a page
   * doesn't wait forever — the same as a store whose first read failed. */
  const failed = new Set<string>();
  let version = 0;
  let watching = false;

  /** A row read with every column (fallback, realtime, just uploaded)
   * already carries its employees. */
  function remember(rows: ZparSnapshot[]) {
    for (const row of rows) {
      if (Array.isArray(row.employees) && !employeesById.has(row.id)) {
        employeesById.set(row.id, row.employees);
        version++;
      }
    }
  }

  let decorated: { source: ZparSnapshot[]; version: number; list: ZparSnapshot[] } | null = null;
  function list(): ZparSnapshot[] {
    const source = details.list();
    remember(source);
    if (decorated && decorated.source === source && decorated.version === version) return decorated.list;
    const rows = source.map((row) => {
      const employees = employeesById.get(row.id) ?? [];
      return row.employees === employees ? row : { ...row, employees };
    });
    decorated = { source, version, list: rows };
    return rows;
  }

  function loadEmployees(ids: string[]): Promise<void> {
    const wanted = ids.filter((id) => !employeesById.has(id));
    const pending = wanted.map((id) => loading.get(id)).filter((p): p is Promise<void> => Boolean(p));
    const toFetch = wanted.filter((id) => !loading.has(id));
    if (toFetch.length > 0) {
      const request = trackInFlight(
        Promise.resolve(dataClient().from("zpar_snapshots").select("id, employees").in("id", toFetch))
      ).then(
        (res: { data: { id: string; employees: EmployeeRecord[] }[] | null; error: { message: string } | null }) => {
          for (const id of toFetch) loading.delete(id);
          if (res.error) {
            console.error("loading snapshot employees failed:", res.error.message);
            for (const id of toFetch) failed.add(id);
            notifyDataChanged();
            return;
          }
          for (const row of res.data ?? []) employeesById.set(row.id, row.employees ?? []);
          version++;
          notifyDataChanged();
        },
        (err: unknown) => {
          for (const id of toFetch) {
            loading.delete(id);
            failed.add(id);
          }
          console.error("loading snapshot employees failed:", err);
          notifyDataChanged();
        }
      );
      for (const id of toFetch) loading.set(id, request);
      pending.push(request);
    }
    return Promise.all(pending).then(() => undefined);
  }

  /** The active snapshot's employees are needed everywhere: fetch them as
   * soon as the details say which snapshot is active (and again when that
   * changes). */
  function loadActive() {
    const active = details.list().find((s) => s.is_active);
    if (active && !employeesById.has(active.id) && !loading.has(active.id) && !failed.has(active.id)) {
      void loadEmployees([active.id]);
    }
  }

  return {
    key: details.key,
    init() {
      details.init();
      if (!watching && typeof window !== "undefined") {
        watching = true;
        subscribeStorage(loadActive);
      }
      loadActive();
    },
    async load() {
      await details.load();
      const active = details.list().find((s) => s.is_active);
      if (active) await loadEmployees([active.id]);
    },
    reset() {
      details.reset();
      employeesById.clear();
      failed.clear();
      version++;
    },
    refetch: details.refetch,
    complete: details.complete,
    fetchWhere: details.fetchWhere,
    ready() {
      if (!details.ready()) return false;
      const active = details.list().find((s) => s.is_active);
      return !active || employeesById.has(active.id) || failed.has(active.id);
    },
    list,
    get(id) {
      return list().find((s) => s.id === id);
    },
    insert(item) {
      employeesById.set(item.id, item.employees);
      version++;
      return details.insert(item);
    },
    insertMany(items) {
      for (const item of items) employeesById.set(item.id, item.employees);
      version++;
      return details.insertMany(items);
    },
    insertManyPersisted(items) {
      for (const item of items) employeesById.set(item.id, item.employees);
      version++;
      return details.insertManyPersisted(items);
    },
    update: details.update,
    patchLocal: details.patchLocal,
    upsert(item) {
      employeesById.set(item.id, item.employees);
      version++;
      return details.upsert(item);
    },
    remove(id) {
      details.remove(id);
    },
    employeesLoaded(id) {
      return employeesById.has(id) || failed.has(id);
    },
    loadEmployees,
  };
}
