// Generic localStorage-backed data access layer.
//
// Every entity is stored under its own top-level key as a JSON array.
// The API surface (list/get/set/insert/update/remove) is intentionally
// generic and synchronous-feeling so that swapping the implementation for
// Supabase later only requires changing this file, not any UI code — see
// MTRACK_SPEC.md §13.

const PREFIX = "mtrack:";

function readAll<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(PREFIX + key);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function writeAll<T>(key: string, items: T[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFIX + key, JSON.stringify(items));
  // Notify same-tab listeners (storage event only fires cross-tab natively).
  window.dispatchEvent(new CustomEvent("mtrack:change", { detail: { key } }));
}

export interface Store<T extends { id: string }> {
  list(): T[];
  get(id: string): T | undefined;
  insert(item: T): T;
  insertMany(items: T[]): T[];
  update(id: string, patch: Partial<T>): T | undefined;
  upsert(item: T): T;
  remove(id: string): void;
  replaceAll(items: T[]): void;
  key: string;
}

export function createStore<T extends { id: string }>(key: string): Store<T> {
  return {
    key,
    list() {
      return readAll<T>(key);
    },
    get(id) {
      return readAll<T>(key).find((i) => i.id === id);
    },
    insert(item) {
      const all = readAll<T>(key);
      all.push(item);
      writeAll(key, all);
      return item;
    },
    insertMany(items) {
      const all = readAll<T>(key);
      all.push(...items);
      writeAll(key, all);
      return items;
    },
    update(id, patch) {
      const all = readAll<T>(key);
      const idx = all.findIndex((i) => i.id === id);
      if (idx === -1) return undefined;
      all[idx] = { ...all[idx], ...patch };
      writeAll(key, all);
      return all[idx];
    },
    upsert(item) {
      const all = readAll<T>(key);
      const idx = all.findIndex((i) => i.id === item.id);
      if (idx === -1) all.push(item);
      else all[idx] = item;
      writeAll(key, all);
      return item;
    },
    remove(id) {
      const all = readAll<T>(key).filter((i) => i.id !== id);
      writeAll(key, all);
    },
    replaceAll(items) {
      writeAll(key, items);
    },
  };
}

export function genId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function subscribeStorage(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener("mtrack:change", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("mtrack:change", handler);
    window.removeEventListener("storage", handler);
  };
}

export function clearAllData(): void {
  if (typeof window === "undefined") return;
  Object.keys(window.localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => window.localStorage.removeItem(k));
  window.dispatchEvent(new CustomEvent("mtrack:change", { detail: { key: "*" } }));
}
