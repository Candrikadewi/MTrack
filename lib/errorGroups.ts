import type { ErrorSource } from "./errorLog";

/** One row of app_errors (migration_19). */
export interface ErrorRow {
  id: string;
  created_at: string;
  user_id: string | null;
  source: ErrorSource;
  message: string;
  stack: string | null;
  url: string | null;
  context: Record<string, unknown> | null;
}

/** The same error happening again and again is one problem: rows grouped
 * by where it came from and its message, most recent first. */
export interface ErrorGroup {
  key: string;
  source: ErrorSource;
  message: string;
  count: number;
  people: number;
  firstSeen: string;
  lastSeen: string;
  lastUrl: string | null;
  stack: string | null;
}

export function groupErrors(rows: ErrorRow[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup & { users: Set<string> }>();
  for (const row of rows) {
    const key = `${row.source}|${row.message}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        key,
        source: row.source,
        message: row.message,
        count: 1,
        people: 0,
        firstSeen: row.created_at,
        lastSeen: row.created_at,
        lastUrl: row.url,
        stack: row.stack,
        users: new Set(row.user_id ? [row.user_id] : []),
      });
      continue;
    }
    g.count++;
    if (row.user_id) g.users.add(row.user_id);
    if (row.created_at < g.firstSeen) g.firstSeen = row.created_at;
    if (row.created_at > g.lastSeen) {
      g.lastSeen = row.created_at;
      g.lastUrl = row.url;
      g.stack = row.stack ?? g.stack;
    }
  }
  return Array.from(groups.values())
    .map(({ users, ...g }) => ({ ...g, people: users.size }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}
