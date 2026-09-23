"use client";
import { useCallback, useSyncExternalStore } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { dismissToast, getToasts, subscribeToasts } from "@/lib/toast";

const EMPTY: never[] = [];

export function ToastHost() {
  const getSnapshot = useCallback(() => getToasts(), []);
  const getServerSnapshot = useCallback(() => EMPTY, []);
  const toasts = useSyncExternalStore(subscribeToasts, getSnapshot, getServerSnapshot);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const isError = t.tone === "error";
        return (
          <div
            key={t.id}
            role={isError ? "alert" : "status"}
            className={`animate-reveal pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-2xl border px-4 py-3 shadow-lg ${
              isError
                ? "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950 dark:text-red-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950 dark:text-emerald-200"
            }`}
          >
            {isError ? (
              <AlertCircle size={18} aria-hidden className="mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0" />
            )}
            <p className="flex-1 text-sm leading-snug">{t.message}</p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismissToast(t.id);
                }}
                className="shrink-0 rounded-lg px-2 py-0.5 text-sm font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Tutup notifikasi"
              className="shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
