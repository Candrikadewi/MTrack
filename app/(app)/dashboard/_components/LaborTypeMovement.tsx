"use client";
// Labor Type Movement: headcount per labor type across the fiscal year.
import { useMemo } from "react";
import { format } from "date-fns";
import { useSessionState } from "@/lib/useSessionState";
import { Card } from "@/components/ui/Card";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { LaborTypeChart } from "@/components/ui/LaborTypeChart";
import { EmptyState } from "@/components/ui/Table";
import {
  fiscalYearMonths,
  laborTypeMovementByFiscalYear,
  laborTypeMovementDetail,
  previousPeriodWithData,
} from "@/lib/engine/dashboard";
import type { EmployeeRecord } from "@/lib/types";

/** "Movement", not just a snapshot: one bar per FY month stacked by every
 * ZPAR labor_type code, plus a month-picker below splitting that month's
 * change into "New In" (brand-new hires landing on a code) and "Retagging"
 * (an existing employee's code itself changed, e.g. A → B2) — same idea as
 * Manpower Movement's chart, but for labor_type instead of
 * Permanen/Kontrak/Vokasi. */
export function LaborTypeMovementBlock({
  snapshotsByPeriod,
  selDirectorates,
  selDivisions,
  selDepts,
}: {
  snapshotsByPeriod: Map<string, EmployeeRecord[]>;
  selDirectorates: string[];
  selDivisions: string[];
  selDepts: string[];
}) {
  const refDate = useMemo(() => new Date(), []);
  const rows = useMemo(
    () =>
      laborTypeMovementByFiscalYear(
        snapshotsByPeriod,
        { directorates: selDirectorates, divisions: selDivisions, depts: selDepts },
        refDate
      ),
    [snapshotsByPeriod, selDirectorates, selDivisions, selDepts, refDate]
  );

  const monthsWithData = useMemo(
    () => fiscalYearMonths(refDate).filter((m) => snapshotsByPeriod.has(m)),
    [snapshotsByPeriod, refDate]
  );
  const latestMonth = monthsWithData[monthsWithData.length - 1] ?? "";
  const [selMonth, setSelMonth] = useSessionState("dash.laborTypeMovement.month", latestMonth);
  const effectiveMonth = monthsWithData.includes(selMonth) ? selMonth : latestMonth;
  const prevMonth = effectiveMonth ? previousPeriodWithData(effectiveMonth, snapshotsByPeriod) : null;
  const detail = useMemo(() => {
    if (!effectiveMonth || !prevMonth) return { newIn: [], retagging: [] };
    return laborTypeMovementDetail(snapshotsByPeriod.get(prevMonth)!, snapshotsByPeriod.get(effectiveMonth)!, {
      directorates: selDirectorates,
      divisions: selDivisions,
      depts: selDepts,
    });
  }, [effectiveMonth, prevMonth, snapshotsByPeriod, selDirectorates, selDivisions, selDepts]);
  const [selNewInTypes, setSelNewInTypes] = useSessionState<string[]>("dash.laborTypeMovement.newInTypes", []);
  const newInOptions = Array.from(new Set(detail.newIn.map((n) => n.laborType))).sort();
  const newInMatches = detail.newIn.filter((n) => selNewInTypes.length === 0 || selNewInTypes.includes(n.laborType));
  const newInCaseCount = newInMatches.length;
  const newInEmployeeCount = newInMatches.reduce((sum, n) => sum + n.count, 0);

  const [selFrom, setSelFrom] = useSessionState<string[]>("dash.laborTypeMovement.from", []);
  const [selTo, setSelTo] = useSessionState<string[]>("dash.laborTypeMovement.to", []);
  const fromOptions = Array.from(new Set(detail.retagging.map((r) => r.from))).sort();
  const toOptions = Array.from(
    new Set(detail.retagging.filter((r) => selFrom.length === 0 || selFrom.includes(r.from)).map((r) => r.to))
  ).sort();
  const retagMatches = detail.retagging.filter(
    (r) => (selFrom.length === 0 || selFrom.includes(r.from)) && (selTo.length === 0 || selTo.includes(r.to))
  );
  const retagCaseCount = retagMatches.length;
  const retagEmployeeCount = retagMatches.reduce((sum, r) => sum + r.count, 0);

  // Picking a new "Dari" set can invalidate part of the current "Ke"
  // selection (a code that only ever appeared paired with a now-deselected
  // Dari) — drop just those instead of wiping the whole Ke selection.
  function handleFromChange(next: string[]) {
    setSelFrom(next);
    const validTo = new Set(detail.retagging.filter((r) => next.length === 0 || next.includes(r.from)).map((r) => r.to));
    setSelTo((prev) => prev.filter((t) => validTo.has(t)));
  }

  const fmtMonth = (m: string) => format(new Date(`${m}-01T00:00:00`), "MMM yy");

  return (
    <Card
      title="Labor Type Movement"
      subtitle="1 fiscal year berjalan, dari data ZPAR terbaru per bulan. Bulan bertanda “–” belum ada snapshot ZPAR-nya."
    >
      {rows.length === 0 ? (
        <EmptyState text="Tidak ada data." />
      ) : (
        <div className="space-y-4">
          <LaborTypeChart data={rows} />
          {monthsWithData.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {monthsWithData.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelMonth(m)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                    effectiveMonth === m
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-300"
                      : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  {fmtMonth(m)}
                </button>
              ))}
            </div>
          )}
          {effectiveMonth && (
            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500">
                {prevMonth
                  ? `Perubahan Labor Type — ${fmtMonth(prevMonth)} → ${fmtMonth(effectiveMonth)}`
                  : "Tidak ada periode sebelumnya untuk dibandingkan."}
              </div>
              {prevMonth && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-500">New In</div>
                    <div className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">
                      <span className="font-bold">{newInCaseCount}</span> case ·{" "}
                      <span className="font-bold">{newInEmployeeCount}</span> orang
                    </div>
                    {newInOptions.length === 0 ? (
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Tidak ada MP baru masuk.</p>
                    ) : (
                      <>
                        <div className="mt-2">
                          <MultiSelect
                            label="Labor Type"
                            options={newInOptions}
                            selected={selNewInTypes}
                            onChange={setSelNewInTypes}
                          />
                        </div>
                        {selNewInTypes.length > 0 && (
                          <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                            {newInMatches.flatMap((n) =>
                              n.people.map((p) => (
                                <div
                                  key={p.noreg}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs dark:border-slate-800"
                                >
                                  <span className="font-medium text-slate-700 dark:text-slate-200">
                                    {p.nama} ({p.noreg})
                                  </span>
                                  <span className="text-slate-600 dark:text-slate-400">
                                    {n.laborType} · {p.division} · {p.dept}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500">Retagging</div>
                    <div className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">
                      <span className="font-bold">{retagCaseCount}</span> case ·{" "}
                      <span className="font-bold">{retagEmployeeCount}</span> orang
                    </div>
                    {detail.retagging.length === 0 ? (
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Tidak ada retagging.</p>
                    ) : (
                      <>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <MultiSelect label="Dari" options={fromOptions} selected={selFrom} onChange={handleFromChange} />
                          <MultiSelect label="Ke" options={toOptions} selected={selTo} onChange={setSelTo} />
                        </div>
                        {(selFrom.length > 0 || selTo.length > 0) && (
                          <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                            {retagMatches.length === 0 ? (
                              <p className="text-sm text-slate-600 dark:text-slate-400">Tidak ada.</p>
                            ) : (
                              retagMatches.map((r) => (
                                <div key={`${r.from}-${r.to}`}>
                                  <div className="text-[11px] font-semibold text-slate-500">
                                    {r.from} → {r.to} ({r.count} orang)
                                  </div>
                                  <div className="mt-1 space-y-1.5">
                                    {r.people.map((p) => (
                                      <div
                                        key={p.noreg}
                                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs dark:border-slate-800"
                                      >
                                        <span className="font-medium text-slate-700 dark:text-slate-200">
                                          {p.nama} ({p.noreg})
                                        </span>
                                        <span className="text-slate-600 dark:text-slate-400">
                                          {p.division} · {p.dept}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
