// Supabase-backed data access layer with an in-memory cache, so every store
// still reads synchronously (list/get) the way the rest of the app expects —
// see MTRACK_SPEC.md §13, which calls for exactly this: a generic data layer
// that can move to Supabase "tanpa mengubah logic UI". Writes update the
// cache immediately (optimistic) and persist to Supabase in the background;
// a realtime subscription keeps every open tab/user in sync.
//
// Network/realtime setup is deliberately lazy (triggered by Store.init(),
// called from useStoreList's effect) rather than at module load — this file
// is imported by "use client" components, whose module code also executes
// once during Next.js's server render pass, where hydrate()/channel() must
// not run.
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "./supabase/client";
import { pushToast } from "./toast";

type PgError = { message: string } | null;
type WriteResult = { error: PgError };
type ReadResult<T> = { data: T[] | null; error: PgError };

const PAGE_SIZE = 1000;

/** Postgres rejects "" for a `date` column, and the app models "no date
 * yet" as "" — so every insert/update carrying a blank date failed, and
 * with it the whole batch (e.g. every new Demand, whose confirmation dates
 * start blank). Date columns are named tgl_* / *_date / date across the
 * schema; a blank there is sent as null. Reads already hand nulls back,
 * which the app treats the same as "". */
const DATE_KEY = /(^|_)(tgl|date)(_|$)/;

function toRow<T extends object>(item: T): T {
  let out: T | null = null;
  for (const [key, value] of Object.entries(item)) {
    if (value === "" && DATE_KEY.test(key)) {
      out ??= { ...item };
      (out as Record<string, unknown>)[key] = null;
    }
  }
  return out ?? item;
}

let changeVersion = 0;
const listeners = new Set<() => void>();

function notify(): void {
  changeVersion++;
  listeners.forEach((cb) => cb());
}

export function subscribeStorage(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getChangeVersion(): number {
  return changeVersion;
}

/**
 * Every table's `id` column is Postgres `uuid` (see supabase/schema.sql),
 * and the RPCs (set_review_result, set_demand_replacement) type their id
 * params as `uuid` too — so this MUST return an actual UUID, not just an
 * opaque string, or every insert/RPC call is silently/loudly rejected by
 * Postgres with "invalid input syntax for type uuid". The `prefix` param
 * is accepted for call-site readability but no longer affects the output.
 */
export function genId(prefix = "id"): string {
  void prefix;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without Web Crypto's randomUUID (shouldn't
  // happen in any supported browser/Node runtime) — still not a real v4
  // UUID, so writes would still fail; this only prevents a hard crash.
  return `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
}

/** What each table holds, for the "couldn't save" message. */
const TABLE_LABELS: Record<string, string> = {
  zpar_snapshots: "snapshot ZPAR",
  vokasi_records: "data Vokasi",
  pkwt_reviews: "review PKWT",
  demands: "demand",
  projects: "project",
  takt_cases: "takt time",
  util_pool: "Supply Pool",
  handover_forms: "handover",
  column_decisions: "keputusan kolom",
  value_mappings: "mapping",
};

let lastFailure = { text: "", at: 0 };

/** Tells the person a save didn't go through: the cache already showed it
 * as done, so without this they'd believe it was saved. A burst of the same
 * failure (e.g. a loop of inserts while offline) gives one toast. */
function reportWriteFailure(table: string, message: string): void {
  const text = `Gagal menyimpan ${TABLE_LABELS[table] ?? table}: ${message}. Perubahan dibatalkan.`;
  const now = Date.now();
  if (text === lastFailure.text && now - lastFailure.at < 4000) return;
  lastFailure = { text, at: now };
  pushToast(text);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface Store<T extends { id: string }> {
  list(): T[];
  get(id: string): T | undefined;
  insert(item: T): T;
  insertMany(items: T[]): T[];
  /** insertMany, but resolves once Supabase has the rows (null) or rejected
   * them (error message) — for follow-up RPCs that look those rows up
   * server-side and would otherwise race the insert. */
  insertManyPersisted(items: T[]): Promise<string | null>;
  update(id: string, patch: Partial<T>): T | undefined;
  /** Cache-only patch, no table write — for optimistic UI ahead of an RPC
   * that does the real (role-checked) write server-side. */
  patchLocal(id: string, patch: Partial<T>): void;
  upsert(item: T): T;
  remove(id: string): void;
  ready(): boolean;
  /** Client-only, idempotent: hydrates the cache and opens the realtime subscription. */
  init(): void;
  /** Forces a fresh select("*") from Supabase into the cache — use after a
   * server-side mutation (e.g. an RPC that inserts rows the client didn't
   * create locally) so the UI doesn't have to wait on realtime to catch up. */
  refetch(): void;
  key: string;
}

export function createStore<T extends { id: string }>(table: string): Store<T> {
  let cache: T[] = [];
  let initialized = false;
  let started = false;

  function client() {
    return createClient();
  }

  /** Supabase (PostgREST) returns at most 1000 rows per request by
   * default, silently — so read in pages until a short page comes back,
   * or tables past 1000 rows (Vokasi, reviews, demands) lose data. */
  async function fetchAll(): Promise<T[]> {
    const supabase = client();
    const all: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const res: ReadResult<T> = await supabase
        .from(table)
        .select("*")
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (res.error) throw new Error(res.error.message);
      const page = res.data ?? [];
      all.push(...page);
      if (page.length < PAGE_SIZE) return all;
    }
  }

  function start() {
    if (started || typeof window === "undefined") return;
    started = true;
    const supabase = client();

    fetchAll()
      .then((rows) => {
        cache = rows;
        initialized = true;
        notify();
      })
      .catch((err: unknown) => {
        // A network-level failure (offline, DNS, CORS) rejects instead of
        // resolving with `{ error }` — still counts as "hydration attempt
        // resolved" so ready() doesn't hang a loading state forever.
        console.error(`select from ${table} failed:`, err);
        initialized = true;
        notify();
      });

    supabase
      .channel(`public:${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, (payload: RealtimePostgresChangesPayload<T>) => {
        if (payload.eventType === "INSERT") {
          const row = payload.new as T;
          if (!cache.some((r) => r.id === row.id)) cache = [...cache, row];
        } else if (payload.eventType === "UPDATE") {
          const row = payload.new as T;
          cache = cache.map((r) => (r.id === row.id ? row : r));
        } else if (payload.eventType === "DELETE") {
          const oldRow = payload.old as T;
          cache = cache.filter((r) => r.id !== oldRow.id);
        }
        notify();
      })
      .subscribe();
  }

  function refetch() {
    if (typeof window === "undefined") return;
    fetchAll()
      .then((rows) => {
        cache = rows;
        notify();
      })
      .catch((err: unknown) => console.error(`refetch ${table} failed:`, err));
  }

  /** Sends a write and, if the database refuses it (or the network
   * fails), runs `rollback` so the cache stops showing it as saved. Resolves
   * to the error message, or null once saved. */
  function persist(label: string, request: PromiseLike<WriteResult>, rollback: () => void, report = true): Promise<string | null> {
    return Promise.resolve(request)
      .then(
        (res) => res.error?.message ?? null,
        (err: unknown) => errorMessage(err)
      )
      .then((error) => {
        if (error) {
          console.error(`${label} ${table} failed:`, error);
          rollback();
          notify();
          if (report) reportWriteFailure(table, error);
        }
        return error;
      });
  }

  function dropFromCache(ids: Set<string>) {
    cache = cache.filter((r) => !ids.has(r.id));
  }

  /** Callers of this report the error themselves (it's returned), so it
   * only rolls the cache back. */
  function insertManyPersisted(items: T[]): Promise<string | null> {
    cache = [...cache, ...items];
    notify();
    if (items.length === 0) return Promise.resolve(null);
    const ids = new Set(items.map((i) => i.id));
    return persist("insertMany into", client().from(table).insert(items.map(toRow)), () => dropFromCache(ids), false);
  }

  return {
    key: table,
    init: start,
    refetch,
    ready() {
      return initialized;
    },
    list() {
      return cache;
    },
    get(id) {
      return cache.find((i) => i.id === id);
    },
    insert(item) {
      cache = [...cache, item];
      notify();
      void persist("insert into", client().from(table).insert(toRow(item)), () => dropFromCache(new Set([item.id])));
      return item;
    },
    insertMany(items) {
      cache = [...cache, ...items];
      notify();
      if (items.length > 0) {
        const ids = new Set(items.map((i) => i.id));
        void persist("insertMany into", client().from(table).insert(items.map(toRow)), () => dropFromCache(ids));
      }
      return items;
    },
    insertManyPersisted,
    update(id, patch) {
      const idx = cache.findIndex((i) => i.id === id);
      if (idx === -1) return undefined;
      const previous = cache[idx];
      const updated = { ...previous, ...patch };
      cache = cache.map((r, i) => (i === idx ? updated : r));
      notify();
      // Rolling back restores only the fields this update set, and only
      // where nothing has changed them since — a later edit isn't undone.
      const rollback = () => {
        cache = cache.map((r) => {
          if (r.id !== id) return r;
          const restored = { ...r };
          for (const key of Object.keys(patch) as (keyof T)[]) {
            if (r[key] === updated[key]) restored[key] = previous[key];
          }
          return restored;
        });
      };
      void persist("update", client().from(table).update(toRow(patch)).eq("id", id), rollback);
      return updated;
    },
    patchLocal(id, patch) {
      const idx = cache.findIndex((i) => i.id === id);
      if (idx === -1) return;
      cache = cache.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      notify();
    },
    upsert(item) {
      const idx = cache.findIndex((i) => i.id === item.id);
      const previous = idx === -1 ? undefined : cache[idx];
      cache = idx === -1 ? [...cache, item] : cache.map((r, i) => (i === idx ? item : r));
      notify();
      const rollback = () => {
        // Leave it alone if something newer replaced it meanwhile.
        if (!cache.some((r) => r === item)) return;
        cache = previous ? cache.map((r) => (r === item ? previous : r)) : cache.filter((r) => r !== item);
      };
      void persist("upsert into", client().from(table).upsert(toRow(item)), rollback);
      return item;
    },
    remove(id) {
      const idx = cache.findIndex((i) => i.id === id);
      const removed = idx === -1 ? undefined : cache[idx];
      if (removed) {
        cache = cache.filter((i) => i.id !== id);
        notify();
      }
      const rollback = () => {
        if (!removed || cache.some((r) => r.id === id)) return;
        cache = [...cache.slice(0, idx), removed, ...cache.slice(idx)];
      };
      void persist("delete from", client().from(table).delete().eq("id", id), rollback);
    },
  };
}
