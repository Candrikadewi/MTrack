"use client";
// In-app back navigation: a short stack of the paths visited in this tab,
// kept in sessionStorage, so a page reached from Demand goes back to
// Demand and one reached from Dashboard goes back to Dashboard.

const KEY = "nav.stack";
const EVENT = "nav-stack-change";
const LIMIT = 30;

function read(): string[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Records a visit. Arriving at the page just before the current one
 * counts as going back, so it pops instead of growing the stack. */
export function recordVisit(path: string): void {
  const stack = read();
  if (stack[stack.length - 1] === path) return;
  if (stack[stack.length - 2] === path) stack.pop();
  else stack.push(path);
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-LIMIT)));
  } catch {
    // storage unavailable — back falls back to the page's parent
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeNavStack(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export function navStackSnapshot(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

/** The page before `current`, whether or not `current` has been recorded
 * yet. */
export function previousPath(snapshot: string, current: string): string | null {
  let stack: string[];
  try {
    stack = JSON.parse(snapshot) as string[];
  } catch {
    return null;
  }
  const last = stack[stack.length - 1];
  const prev = last === current ? stack[stack.length - 2] : last;
  return prev && prev !== current ? prev : null;
}

const LABELS: [RegExp, string][] = [
  [/^\/dashboard/, "Dashboard"],
  [/^\/demand/, "Demand"],
  [/^\/supply/, "Supply"],
  [/^\/history/, "History"],
  [/^\/upload/, "Upload Center"],
  [/^\/handover/, "Handover Form"],
  [/^\/projects\/.+/, "Detail Project"],
  [/^\/projects/, "Project Monitoring"],
  [/^\/takt\/.+/, "Detail Takt"],
  [/^\/takt/, "Takt Time Monitoring"],
];

export function pageLabel(path: string): string {
  return LABELS.find(([re]) => re.test(path))?.[1] ?? "halaman sebelumnya";
}
