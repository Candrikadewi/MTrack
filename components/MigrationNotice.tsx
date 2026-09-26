"use client";
import { useEffect, useState } from "react";
import { DatabaseZap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { missingMigrations } from "@/lib/migrations";

/** For admins: names the database migrations this version of CAMP needs
 * that haven't been run yet, and how to run them. Nothing when up to date. */
export function MigrationNotice() {
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("app_migrations")
      .select("name")
      .then(({ data, error }: { data: { name: string }[] | null; error: { message: string } | null }) => {
        if (cancelled) return;
        // No app_migrations table yet means migration_15 hasn't been run.
        if (error && !/app_migrations/.test(error.message)) return;
        setMissing(missingMigrations(error ? null : (data ?? []).map((r) => r.name)));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (missing.length === 0) return null;
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
    >
      <DatabaseZap size={18} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="font-semibold">Database perlu diperbarui</div>
        <p className="mt-0.5 text-amber-800 dark:text-amber-200">
          Jalankan{" "}
          {missing.map((m, i) => (
            <span key={m}>
              {i > 0 && (i === missing.length - 1 ? " lalu " : ", ")}
              <code className="rounded bg-amber-100 px-1 py-0.5 text-xs font-semibold dark:bg-amber-500/20">
                supabase/{m}.sql
              </code>
            </span>
          ))}{" "}
          di Supabase → SQL Editor, berurutan. Sampai itu dijalankan, CAMP tetap berjalan seperti biasa tanpa perlindungan
          tambahannya.
        </p>
      </div>
    </div>
  );
}
