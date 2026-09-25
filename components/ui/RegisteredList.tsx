"use client";
import { useState, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Modal";

export interface RegisteredItem {
  id: string;
  title: string;
  meta?: string;
  status?: { label: string; tone: Tone };
}

/** "Sudah terdaftar" under an input tab: every registered item with Edit
 * and Hapus, deletion behind a confirmation that says what happens to the
 * data already in progress. */
export function RegisteredList({
  items,
  emptyText,
  onEdit,
  onDelete,
  deleteNote,
}: {
  items: RegisteredItem[];
  emptyText: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  /** What deleting keeps or removes, shown in the confirmation. */
  deleteNote: ReactNode;
}) {
  const [confirming, setConfirming] = useState<RegisteredItem | null>(null);
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Sudah terdaftar ({items.length})</h4>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {emptyText}
        </p>
      ) : (
        <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                  <span className="truncate">{item.title}</span>
                  {item.status && <Badge tone={item.status.tone}>{item.status.label}</Badge>}
                </div>
                {item.meta && <div className="text-xs text-slate-500 dark:text-slate-400">{item.meta}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onEdit(item.id)}
                  aria-label={`Edit ${item.title}`}
                  className="flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Pencil size={12} aria-hidden /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(item)}
                  aria-label={`Hapus ${item.title}`}
                  className="flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-red-900 dark:hover:bg-red-950 dark:hover:text-red-300"
                >
                  <Trash2 size={12} aria-hidden /> Hapus
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirming !== null}
        title={`Hapus ${confirming?.title ?? ""}?`}
        confirmLabel="Hapus"
        tone="danger"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) onDelete(confirming.id);
          setConfirming(null);
        }}
      >
        {deleteNote}
      </ConfirmDialog>
    </div>
  );
}
