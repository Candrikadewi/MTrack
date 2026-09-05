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

type PgError = { message: string } | null;
type WriteResult = { error: PgError };
type ReadResult<T> = { data: T[] | null; error: PgError };

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

export interface Store<T extends { id: string }> {
  list(): T[];
  get(id: string): T | undefined;
  insert(item: T): T;
  insertMany(items: T[]): T[];
  update(id: string, patch: Partial<T>): T | undefined;
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

  function start() {
    if (started || typeof window === "undefined") return;
    started = true;
    const supabase = client();

    supabase
      .from(table)
      .select("*")
      .then((res: ReadResult<T>) => {
        if (!res.error && res.data) cache = res.data;
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
    client()
      .from(table)
      .select("*")
      .then((res: ReadResult<T>) => {
        if (!res.error && res.data) {
          cache = res.data;
          notify();
        }
      })
      .catch((err: unknown) => console.error(`refetch ${table} failed:`, err));
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
      client()
        .from(table)
        .insert(item)
        .then((res: WriteResult) => {
          if (res.error) console.error(`insert into ${table} failed:`, res.error.message);
        })
        .catch((err: unknown) => console.error(`insert into ${table} failed:`, err));
      return item;
    },
    insertMany(items) {
      cache = [...cache, ...items];
      notify();
      client()
        .from(table)
        .insert(items)
        .then((res: WriteResult) => {
          if (res.error) console.error(`insertMany into ${table} failed:`, res.error.message);
        })
        .catch((err: unknown) => console.error(`insertMany into ${table} failed:`, err));
      return items;
    },
    update(id, patch) {
      const idx = cache.findIndex((i) => i.id === id);
      if (idx === -1) return undefined;
      const updated = { ...cache[idx], ...patch };
      cache = cache.map((r, i) => (i === idx ? updated : r));
      notify();
      client()
        .from(table)
        .update(patch)
        .eq("id", id)
        .then((res: WriteResult) => {
          if (res.error) console.error(`update ${table} failed:`, res.error.message);
        })
        .catch((err: unknown) => console.error(`update ${table} failed:`, err));
      return updated;
    },
    upsert(item) {
      const idx = cache.findIndex((i) => i.id === item.id);
      cache = idx === -1 ? [...cache, item] : cache.map((r, i) => (i === idx ? item : r));
      notify();
      client()
        .from(table)
        .upsert(item)
        .then((res: WriteResult) => {
          if (res.error) console.error(`upsert into ${table} failed:`, res.error.message);
        })
        .catch((err: unknown) => console.error(`upsert into ${table} failed:`, err));
      return item;
    },
    remove(id) {
      cache = cache.filter((i) => i.id !== id);
      notify();
      client()
        .from(table)
        .delete()
        .eq("id", id)
        .then((res: WriteResult) => {
          if (res.error) console.error(`delete from ${table} failed:`, res.error.message);
        })
        .catch((err: unknown) => console.error(`delete from ${table} failed:`, err));
    },
  };
}
