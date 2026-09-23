"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";

export interface BatchSummary {
  id: string;
  label: string;
  meta?: string;
  count: number;
  tone?: Tone;
  /** Where to edit/delete this batch — the list page that still owns that
   * capability (e.g. /projects, /takt) now that there's no separate "Kelola"
   * menu entry pointing at it. Omit when the batch has no such page. */
  href?: string;
}

export interface BatchTileCategory {
  key: string;
  label: string;
  count: number;
  tone: Tone;
  batches: BatchSummary[];
}

const TONE_DOT: Record<Tone, string> = {
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
export function BatchTileRow({ categories }: { categories: BatchTileCategory[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const expanded = categories.find((c) => c.key === expandedKey) ?? null;

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
              className={`flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-left shadow-sm shadow-slate-200/60 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:shadow-none ${
                isActive ? "ring-2 ring-blue-400/60" : ""
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[cat.tone]}`} />
                  {cat.label}
                </div>
                <div className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{cat.count}</div>
              </div>
              <ChevronDown
                size={15}
                className={`shrink-0 text-slate-400 transition-transform ${isActive ? "rotate-180" : ""}`}
              />
            </button>
          );
        })}
      </div>

      {expanded && (
        <div className="animate-reveal rounded-2xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <BatchBreakdown category={expanded} />
        </div>
      )}
    </div>
  );
}

function BatchBreakdown({ category }: { category: BatchTileCategory }) {
  const [showAll, setShowAll] = useState(false);
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
          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div>
            <div className="font-medium text-slate-700 dark:text-slate-200">{b.label}</div>
            {b.meta && <div className="text-xs text-slate-400">{b.meta}</div>}
          </div>
          <div className="flex items-center gap-2">
            {b.href && (
              <Link
                href={b.href}
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Kelola →
              </Link>
            )}
            <Badge tone={b.tone ?? category.tone}>{b.count}</Badge>
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
    </div>
  );
}
