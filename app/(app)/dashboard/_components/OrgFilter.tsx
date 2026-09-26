"use client";
// The page-wide Directorate → Division → Department filter, pinned while scrolling.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { deptsOfAny, directorates, divisionsOfAny } from "@/lib/engine/dashboard";
import type { EmployeeRecord } from "@/lib/types";

// Shared cascading Directorate → Division → Department filter
export function OrgCascadeFilter({
  employees,
  selDirectorates,
  setSelDirectorates,
  selDivisions,
  setSelDivisions,
  selDepts,
  setSelDepts,
}: {
  employees: EmployeeRecord[];
  selDirectorates: string[];
  setSelDirectorates: (v: string[]) => void;
  selDivisions: string[];
  setSelDivisions: (v: string[]) => void;
  selDepts: string[];
  setSelDepts: (v: string[]) => void;
}) {
  const divisionOptions = divisionsOfAny(employees, selDirectorates);
  const deptOptions = deptsOfAny(employees, selDivisions);
  return (
    <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
      <MultiSelect
        inlineLabel
        label="Directorate"
        options={directorates(employees)}
        selected={selDirectorates}
        onChange={(v) => {
          setSelDirectorates(v);
          setSelDivisions([]);
          setSelDepts([]);
        }}
      />
      <MultiSelect
        inlineLabel
        label="Division"
        options={divisionOptions}
        selected={selDivisions}
        onChange={(v) => {
          setSelDivisions(v);
          setSelDepts([]);
        }}
      />
      <MultiSelect inlineLabel label="Department" options={deptOptions} selected={selDepts} onChange={setSelDepts} />
    </div>
  );
}

/** Slim filter bar pinned under the top edge while the page scrolls. It sits
 * flush like any card at rest and only lifts (blur + soft shadow) once it is
 * actually floating over content, so it never looks bolted on. */
export function StickyOrgFilterBar({
  activeCount,
  onReset,
  children,
}: {
  activeCount: number;
  onReset: () => void;
  children: ReactNode;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { rootMargin: "-12px 0px 0px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-0" />
      <div
        role="region"
        aria-label="Filter organisasi"
        className={`relative z-30 rounded-2xl border px-3 py-2 sm:sticky sm:top-3 transition-[background-color,box-shadow,border-color] duration-200 motion-reduce:transition-none ${
          stuck
            ? "border-slate-200/80 bg-white/80 shadow-lg shadow-slate-900/[0.06] backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/80 dark:shadow-black/30"
            : "border-slate-200/70 bg-white shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="hidden shrink-0 items-center gap-1.5 pr-1 text-xs font-semibold text-slate-500 lg:flex dark:text-slate-400">
            <SlidersHorizontal size={14} aria-hidden />
            Filter
          </span>
          {children}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              aria-label={`Hapus ${activeCount} filter aktif`}
              className="flex shrink-0 items-center gap-1 self-start rounded-full bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 sm:self-center dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
            >
              <span className="tabular-nums">{activeCount}</span>
              <X size={12} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
