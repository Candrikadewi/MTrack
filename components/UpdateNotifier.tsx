"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const CURRENT = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
const CHECK_EVERY_MS = 60_000;

/** Tells an open tab that a newer build is live and offers a one-click
 * refresh. Data lives in Supabase, so reloading only swaps in the new
 * code — nothing has to be uploaded again. Checks every minute and when
 * the tab regains focus; local builds ("dev") never prompt. */
export function UpdateNotifier() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (CURRENT === "dev") return;
    let stopped = false;
    async function check() {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (version && version !== "dev" && version !== CURRENT) setAvailable(true);
      } catch {
        // Offline or mid-deploy: try again on the next tick.
      }
    }
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!available) return null;
  return (
    <div
      role="status"
      className="animate-reveal fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-blue-200 bg-white px-4 py-3 shadow-lg shadow-slate-900/10 sm:left-auto sm:right-6 dark:border-blue-500/30 dark:bg-slate-900"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
        <RefreshCw size={15} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold text-slate-800 dark:text-slate-100">Versi baru CAMP tersedia</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Refresh untuk memakainya. Data tetap tersimpan.</div>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        Refresh
      </button>
    </div>
  );
}
