"use client";
import { useEffect, useState } from "react";

/** Same shape as useState, but backed by sessionStorage so the value survives
 * navigating away and back within the same browser session (cleared on
 * sign-out / tab close) instead of resetting on every page remount. */
export function useSessionState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // storage unavailable/full — filter just won't persist, non-fatal
    }
  }, [key, state]);

  return [state, setState];
}

export function clearSessionState(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.clear();
  } catch {
    // ignore
  }
}
