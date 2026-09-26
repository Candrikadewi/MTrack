"use client";
import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, ArrowDown, CheckCircle2, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Table";

import type { BatchSummary, BatchTileCategory, BatchTone } from "@/lib/engine/batches";

/** Edit / Hapus on one batch row (a project, a takt case, a Kaizen batch). */
export interface BatchActions {
  onEdit?: () => void;
  onDelete?: () => void;
  /** What deleting keeps or removes, shown in the confirmation. */
  deleteNote?: ReactNode;
}

export type { BatchSummary, BatchTileCategory } from "@/lib/engine/batches";

const TONE_DOT: Record<BatchTone, string> = {
  slate: "bg-slate-400",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  violet: "bg-violet-500",
};

/** Compact "Ringkasan per Batch" row — one small stat tile per category, all
 * using the exact same pattern (no special-casing any one category). Click a
 * tile to expand its batch list inline below the row; a category with more
 * than 2 batches collapses the rest behind "+N lainnya" (uniform in-page
 * accordion, never a separate rollup UI). */
export function BatchTileRow({
  categories,
  pendingLabel,
  onShowInTable,
  batchActions,
}: {
  categories: BatchTileCategory[];
  /** Edit / Hapus for a batch, when that batch can be changed. */
  batchActions?: (categoryKey: string, batch: BatchSummary) => BatchActions | null;
  /** What each count means, shown under it ("belum terpenuhi"). */
  pendingLabel?: string;
  /** When given, the expanded panel offers a jump that filters the page's
   * detail table down to this category. */
  onShowInTable?: (categoryKey: string) => void;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const expanded = categories.find((c) => c.key === expandedKey) ?? null;
  const panelId = useId();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
        {categories.map((cat) => {
          const isActive = expandedKey === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setExpandedKey(isActive ? null : cat.key)}
              aria-expanded={isActive}
              aria-controls={isActive ? panelId : undefined}
              aria-label={
                pendingLabel && cat.total !== undefined
                  ? `${cat.label}: ${cat.total - cat.count} dari ${cat.total} selesai, ${cat.count} ${pendingLabel}`
                  : undefined
              }
              className={`flex min-h-11 items-center justify-between gap-2 rounded-2xl border px-3.5 py-3 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md dark:shadow-none ${
                pendingLabel && cat.count > 0
                  ? "border-amber-300 bg-amber-50 shadow-amber-200/50 dark:border-amber-500/40 dark:bg-amber-500/10"
                  : "border-slate-200 bg-white shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900"
              } ${isActive ? "ring-2 ring-blue-400/60" : ""}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[cat.tone]}`} />
                  {cat.label}
                </div>
                {pendingLabel && cat.total !== undefined ? (
                  <>
                    <div className="mt-0.5 flex items-baseline gap-0.5 tabular-nums">
                      <span
                        className={`text-xl font-bold ${
                          cat.count > 0 ? "text-amber-700 dark:text-amber-300" : "text-slate-800 dark:text-slate-100"
                        }`}
                      >
                        {cat.total - cat.count}
                      </span>
                      <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">/{cat.total}</span>
                    </div>
                    <PendingNote count={cat.count} total={cat.total} pendingLabel={pendingLabel} />
                  </>
                ) : (
                  <div className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{cat.count}</div>
                )}
              </div>
              <ChevronDown
                size={15}
                aria-hidden
                className={`shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${isActive ? "rotate-180" : ""}`}
              />
            </button>
          );
        })}
      </div>

      {expanded && (
        <div
          id={panelId}
          className="animate-reveal space-y-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40"
        >
          <BatchBreakdown category={expanded} batchActions={batchActions} />
          {onShowInTable && expanded.count > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onShowInTable(expanded.key)}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300 dark:hover:bg-blue-500/10"
              >
                Tampilkan {expanded.count} {expanded.label} di tabel
                <ArrowDown size={13} aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Under each tile's "done/total": a loud "N still to go" while it isn't
 * full, a quiet all-clear once it is, "Belum ada" when there's nothing. */
function PendingNote({ count, total, pendingLabel }: { count: number; total: number; pendingLabel: string }) {
  if (total === 0) return <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Belum ada</div>;
  if (count === 0) {
    return (
      <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 size={11} aria-hidden /> Semua selesai
      </div>
    );
  }
  return (
    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white dark:bg-amber-500/90">
      <AlertCircle size={11} aria-hidden /> {count} {pendingLabel}
    </div>
  );
}

function BatchBreakdown({
  category,
  batchActions,
}: {
  category: BatchTileCategory;
  batchActions?: (categoryKey: string, batch: BatchSummary) => BatchActions | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const [confirming, setConfirming] = useState<{ batch: BatchSummary; actions: BatchActions } | null>(null);
  if (category.batches.length === 0) {
    return <EmptyState text={`Tidak ada batch untuk ${category.label}.`} />;
  }
  const visible = showAll ? category.batches : category.batches.slice(0, 2);
  const hiddenCount = category.batches.length - visible.length;

  return (
    <div className="space-y-1.5">
      {visible.map((b) => (
        <div
          key={b.id}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="min-w-0">
            <div className="font-medium text-slate-700 dark:text-slate-200">{b.label}</div>
            {b.meta && <div className="text-xs text-slate-500 dark:text-slate-400">{b.meta}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const actions = batchActions?.(category.key, b);
              if (!actions) return null;
              return (
                <>
                  {actions.onEdit && (
                    <button
                      type="button"
                      onClick={actions.onEdit}
                      aria-label={`Edit ${b.label}`}
                      className="flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Pencil size={12} aria-hidden /> Edit
                    </button>
                  )}
                  {actions.onDelete && (
                    <button
                      type="button"
                      onClick={() => setConfirming({ batch: b, actions })}
                      aria-label={`Hapus ${b.label}`}
                      className="flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-red-900 dark:hover:bg-red-950 dark:hover:text-red-300"
                    >
                      <Trash2 size={12} aria-hidden /> Hapus
                    </button>
                  )}
                </>
              );
            })()}
            {b.href && (
              <Link
                href={b.href}
                aria-label={`Lihat ${b.label}`}
                className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                Lihat →
              </Link>
            )}
            {b.total !== undefined && b.count > 0 && (
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{b.count} lagi</span>
            )}
            <Badge tone={b.total !== undefined ? (b.count > 0 ? "amber" : "green") : (b.tone ?? category.tone)}>
              <span className="tabular-nums">
                {b.total !== undefined ? (
                  <>
                    {b.total - b.count}
                    <span className="font-normal opacity-70">/{b.total}</span>
                  </>
                ) : (
                  b.count
                )}
              </span>
            </Badge>
          </div>
        </div>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full rounded-xl border border-dashed border-slate-300 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          + {hiddenCount} batch lainnya
        </button>
      )}
      <ConfirmDialog
        open={confirming !== null}
        title={`Hapus ${confirming?.batch.label ?? ""}?`}
        confirmLabel="Hapus"
        tone="danger"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          confirming?.actions.onDelete?.();
          setConfirming(null);
        }}
      >
        {confirming?.actions.deleteNote ?? "Data ini akan dihapus."}
      </ConfirmDialog>
    </div>
  );
}
