// Records errors in the app_errors table (migration_19) so an admin can see
// what people ran into — see /errors. Best effort by design: logging must
// never break the app or flood the database, so it
//   * sends the same message at most once a minute,
//   * sends at most 20 entries per page load,
//   * gives up quietly for the session once the table turns out to be
//     missing (migration_19 not run yet),
//   * never logs its own failures.
import { dataClient } from "./storage";

export type ErrorSource = "client" | "render" | "save" | "server" | "job";

export interface ErrorEntry {
  source: ErrorSource;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

const MAX_PER_PAGE_LOAD = 20;
const REPEAT_AFTER_MS = 60_000;

let sent = 0;
let disabled = false;
const lastSent = new Map<string, number>();

/** Noise that isn't CAMP's: browser quirks and extensions. */
function isNoise(entry: ErrorEntry): boolean {
  return (
    /ResizeObserver loop/.test(entry.message) ||
    /^Script error\.?$/.test(entry.message) ||
    /(chrome|moz|safari)-extension:\/\//.test(entry.stack ?? "")
  );
}

export function logError(entry: ErrorEntry): void {
  if (disabled || typeof window === "undefined" || isNoise(entry)) return;
  const key = `${entry.source}|${entry.message}`;
  const now = Date.now();
  if ((lastSent.get(key) ?? -Infinity) > now - REPEAT_AFTER_MS) return;
  if (sent >= MAX_PER_PAGE_LOAD) return;
  lastSent.set(key, now);
  sent++;

  const row = {
    source: entry.source,
    message: entry.message.slice(0, 2000),
    stack: entry.stack?.slice(0, 8000) ?? null,
    url: (window.location?.href ?? "").slice(0, 1000),
    context: { userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent, ...entry.context },
  };
  void Promise.resolve(dataClient().from("app_errors").insert(row)).then(
    (res: { error: { message: string } | null }) => {
      if (!res.error) return;
      // Table not there yet, or not allowed (signed out): stop trying.
      if (/app_errors|row-level security|JWT/i.test(res.error.message)) disabled = true;
      console.warn("error log unavailable:", res.error.message);
    },
    () => undefined
  );
}

export function errorFromUnknown(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) return { message: value.message || value.name, stack: value.stack };
  return { message: typeof value === "string" ? value : (JSON.stringify(value) ?? String(value)) };
}

/** For tests. */
export function resetErrorLog(): void {
  sent = 0;
  disabled = false;
  lastSent.clear();
}
