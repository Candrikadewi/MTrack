// Where the working set ends (see supabase/migration_20.sql): the large
// tables keep only what is still running and the last 12 months in the
// browser. These helpers tell whether a date is older than that, and read
// older rows in pieces small enough for one request.
import { format, subMonths } from "date-fns";

/** The first day of the month 12 months ago (yyyy-MM-dd) — the same line
 * as working_set_since() in the database. Rows dated from here on are in
 * the browser already. */
export function workingSetSince(today: Date = new Date()): string {
  return format(subMonths(new Date(today.getFullYear(), today.getMonth(), 1), 12), "yyyy-MM-dd");
}

/** Whether a date or month ("yyyy-MM" / "yyyy-MM-dd") falls before the
 * working set, so its rows may only be in the database. */
export function beforeWorkingSet(dateOrMonth: string, today: Date = new Date()): boolean {
  return Boolean(dateOrMonth) && dateOrMonth < workingSetSince(today).slice(0, dateOrMonth.length);
}

/** First and last day of a "yyyy-MM" month. */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  return { start: `${month}-01`, end: format(new Date(y, m, 0), "yyyy-MM-dd") };
}

/** A filter on a long list of values, split so the request stays short
 * (PostgREST puts `in` filters in the URL). */
export async function inChunks<R>(values: string[], read: (chunk: string[]) => Promise<R[]>, size = 200): Promise<R[]> {
  const unique = Array.from(new Set(values.filter(Boolean)));
  const out: R[] = [];
  for (let i = 0; i < unique.length; i += size) out.push(...(await read(unique.slice(i, i + size))));
  return out;
}
