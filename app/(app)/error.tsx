"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { logError } from "@/lib/errorLog";

/** Shown in place of a page that crashed while rendering; the sidebar and
 * everything else keep working. The error goes to the error log. */
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const router = useRouter();
  useEffect(() => {
    logError({
      source: "render",
      message: error.message || "Render error",
      stack: error.stack,
      context: { digest: error.digest },
    });
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto mt-12 max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
        <TriangleAlert size={20} aria-hidden />
      </span>
      <h1 className="mt-3 text-base font-semibold text-slate-800 dark:text-slate-100">Halaman ini gagal dimuat</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Data kamu aman. Coba muat ulang bagian ini; kalau masih gagal, kabari admin — kejadiannya sudah tercatat.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-slate-400">Kode: {error.digest}</p>}
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="primary" onClick={() => retry()}>
          Coba lagi
        </Button>
        <Button variant="secondary" onClick={() => router.push("/dashboard")}>
          Ke Dashboard
        </Button>
      </div>
    </div>
  );
}
