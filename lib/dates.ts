import { format } from "date-fns";

// "Today" and "this month" as the app's date keys, in the viewer's local
// time. (toISOString() is UTC: in Jakarta it still says yesterday until
// 07:00.)

/** This month as yyyy-MM. */
export function currentMonthKey(date: Date = new Date()): string {
  return format(date, "yyyy-MM");
}

/** Today as yyyy-MM-dd. */
export function todayKey(date: Date = new Date()): string {
  return format(date, "yyyy-MM-dd");
}
