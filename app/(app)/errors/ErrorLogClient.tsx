"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { RefreshCw, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Form";
import { EmptyState } from "@/components/ui/Table";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/Modal";
import { dataClient } from "@/lib/storage";
import { pushToast } from "@/lib/toast";
import { groupErrors, type ErrorRow } from "@/lib/errorGroups";
import type { ErrorSource } from "@/lib/errorLog";

const SOURCE_LABEL: Record<ErrorSource, { label: string; tone: Tone; hint: string }> = {
  render: { label: "Halaman crash", tone: "red", hint: "Halaman gagal ditampilkan dan diganti layar 'gagal dimuat'." },
  client: { label: "Error browser", tone: "amber", hint: "Error JavaScript yang tidak tertangani." },
  save: { label: "Gagal simpan", tone: "violet", hint: "Database menolak perubahan; perubahan sudah dibatalkan di layar." },
  server: { label: "Error server", tone: "red", hint: "Request ke server gagal." },
  job: { label: "Job malam", tone: "blue", hint: "Masalah pada pekerjaan terjadwal /api/jobs/daily." },
};

const LOAD_LIMIT = 500;

type State =
  { status: "loading" } | { status: "missing" } | { status: "error"; message: string } | { status: "ready"; rows: ErrorRow[] };

function fmt(iso: string): string {
  return format(parseISO(iso), "dd MMM yyyy HH:mm");
}

/** Admin-only: what people ran into lately, grouped so a recurring
 * problem is one row with a count. */
export function ErrorLogClient() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [source, setSource] = useState<"" | ErrorSource>("");
  const [open, setOpen] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    const res = await dataClient().from("app_errors").select("*").order("created_at", { ascending: false }).limit(LOAD_LIMIT);
    if (res.error) {
      setState(/app_errors/.test(res.error.message) ? { status: "missing" } : { status: "error", message: res.error.message });
      return;
    }
    setState({ status: "ready", rows: (res.data ?? []) as ErrorRow[] });
  }, []);

  useEffect(() => {
    // Loading on mount is what this page is for; state is set when the
    // request comes back, not synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const groups = useMemo(() => {
    if (state.status !== "ready") return [];
    return groupErrors(source ? state.rows.filter((r) => r.source === source) : state.rows);
  }, [state, source]);

  async function clearAll() {
    setConfirmClear(false);
    const res = await dataClient().from("app_errors").delete().lte("created_at", new Date().toISOString());
    if (res.error) pushToast(`Gagal menghapus log: ${res.error.message}`);
    else pushToast("Log error dikosongkan.", "success");
    void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Log Error</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Kendala yang dialami pengguna, tercatat otomatis. Kejadian yang sama digabung jadi satu baris. Disimpan 90 hari.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw size={14} aria-hidden /> Muat ulang
          </Button>
          {state.status === "ready" && state.rows.length > 0 && (
            <Button variant="secondary" onClick={() => setConfirmClear(true)}>
              <Trash2 size={14} aria-hidden /> Kosongkan
            </Button>
          )}
        </div>
      </div>

      {state.status === "loading" ? (
        <CardSkeleton lines={3} />
      ) : state.status === "missing" ? (
        <Card>
          <EmptyState text="Log error belum aktif: jalankan supabase/migration_19.sql di Supabase → SQL Editor." />
        </Card>
      ) : state.status === "error" ? (
        <Card>
          <EmptyState text={`Log error tidak bisa dibaca: ${state.message}`} />
        </Card>
      ) : (
        <Card
          title={`${groups.length} masalah · ${groups.reduce((n, g) => n + g.count, 0)} kejadian`}
          subtitle={state.rows.length >= LOAD_LIMIT ? `Menampilkan ${LOAD_LIMIT} kejadian terbaru.` : undefined}
          action={
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as "" | ErrorSource)}
              aria-label="Jenis"
              className="w-44"
            >
              <option value="">Semua jenis</option>
              {(Object.keys(SOURCE_LABEL) as ErrorSource[]).map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s].label}
                </option>
              ))}
            </Select>
          }
        >
          {groups.length === 0 ? (
            <EmptyState text="Tidak ada error." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {groups.map((g) => (
                <li key={g.key} className="py-3">
                  <button
                    type="button"
                    onClick={() => setOpen(open === g.key ? null : g.key)}
                    aria-expanded={open === g.key}
                    className="flex w-full flex-wrap items-start justify-between gap-2 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={SOURCE_LABEL[g.source].tone}>{SOURCE_LABEL[g.source].label}</Badge>
                        <span className="break-words text-sm font-medium text-slate-800 dark:text-slate-100">{g.message}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Terakhir {fmt(g.lastSeen)}
                        {g.count > 1 && ` · pertama ${fmt(g.firstSeen)}`}
                        {g.people > 0 && ` · ${g.people} orang`}
                        {g.lastUrl && ` · ${g.lastUrl.replace(/^https?:\/\/[^/]+/, "")}`}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {g.count}×
                    </span>
                  </button>
                  {open === g.key && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-slate-500 dark:text-slate-400">{SOURCE_LABEL[g.source].hint}</p>
                      {g.stack && (
                        <pre className="max-h-64 overflow-auto rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                          {g.stack}
                        </pre>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Kosongkan log error?"
        confirmLabel="Kosongkan"
        tone="danger"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => void clearAll()}
      >
        Semua catatan error dihapus. Error baru tetap akan tercatat.
      </ConfirmDialog>
    </div>
  );
}
