"use client";
// Age Movement: age distribution now and as forecast ahead.
import { useMemo } from "react";
import { useSessionState } from "@/lib/useSessionState";
import { Card } from "@/components/ui/Card";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { AgeMovementChart } from "@/components/ui/AgeMovementChart";
import { EmptyState } from "@/components/ui/Table";
import { ageMovementForecast, filterEmployees } from "@/lib/engine/dashboard";
import { LABOR_TYPES } from "@/lib/types";
import type { EmployeeRecord } from "@/lib/types";

/** Forecast, not a live count — read against the Active ZPAR snapshot only,
 * assuming nobody retiring gets replaced. Retirement age is 55: anyone
 * projected past 55 drops out of the stacked buckets and is tracked instead
 * as a dashed cumulative "Pensiun" line, so the bar's own height already
 * shows what headcount becomes without backfill. */
export function AgeMovementBlock({
  employees,
  selDirectorates,
  selDivisions,
  selDepts,
}: {
  employees: EmployeeRecord[];
  selDirectorates: string[];
  selDivisions: string[];
  selDepts: string[];
}) {
  const orgFiltered = filterEmployees(employees, {
    directorates: selDirectorates,
    divisions: selDivisions,
    depts: selDepts,
  });

  const [selLaborTypes, setSelLaborTypes] = useSessionState<string[]>("dash.ageMovement.laborTypes", []);
  const [selStatus, setSelStatus] = useSessionState<string[]>("dash.ageMovement.status", []);
  const [selPosisi, setSelPosisi] = useSessionState<string[]>("dash.ageMovement.posisi", []);

  const statusOptions = Array.from(new Set(orgFiltered.map((e) => e.status_kontrak))).sort();
  const posisiOptions = Array.from(new Set(orgFiltered.map((e) => e.posisi_struktural).filter(Boolean))).sort();

  const filtered = orgFiltered.filter(
    (e) =>
      (selLaborTypes.length === 0 || selLaborTypes.includes(e.labor_type)) &&
      (selStatus.length === 0 || selStatus.includes(e.status_kontrak)) &&
      (selPosisi.length === 0 || selPosisi.includes(e.posisi_struktural))
  );

  const checkpoints = useMemo(() => ageMovementForecast(filtered), [filtered]);
  const [selectedKey, setSelectedKey] = useSessionState("dash.ageMovement.checkpoint", checkpoints[0]?.key ?? "");
  const selected = checkpoints.find((c) => c.key === selectedKey) ?? checkpoints[0];

  return (
    <Card
      title="Age Movement"
      subtitle="Forecast dari ZPAR Active — asumsi tidak ada penggantian saat pensiun (efektif 1 bulan setelah usia 55, khusus MP Permanen)."
    >
      {checkpoints.length === 0 ? (
        <EmptyState text="Tidak ada data." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MultiSelect label="Labor Type" options={[...LABOR_TYPES]} selected={selLaborTypes} onChange={setSelLaborTypes} />
            <MultiSelect label="Status" options={statusOptions} selected={selStatus} onChange={setSelStatus} />
            <MultiSelect label="Posisi (Struktural)" options={posisiOptions} selected={selPosisi} onChange={setSelPosisi} />
          </div>
          <AgeMovementChart data={checkpoints} />
          <div className="flex flex-wrap gap-2">
            {checkpoints.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setSelectedKey(c.key)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selected?.key === c.key
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-300"
                    : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
                }`}
              >
                {c.key}
              </button>
            ))}
          </div>
          {selected && (
            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <div className="text-xs font-medium text-slate-500">Total Active — {selected.key}</div>
                  <div className="mt-0.5 text-2xl font-bold text-slate-800 dark:text-slate-100">
                    {selected.totalActive} <span className="text-sm font-normal text-slate-500">orang</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Pensiun (kumulatif)</div>
                  <div className="mt-0.5 text-2xl font-bold text-slate-800 dark:text-slate-100">
                    {selected.pensiunKumulatif} <span className="text-sm font-normal text-slate-500">orang</span>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <div className="text-xs font-medium text-slate-500">
                  {selected.key === checkpoints[0].key
                    ? "Sudah pensiun (dikeluarkan dari figure aktif)"
                    : `Baru pensiun sejak ${checkpoints[checkpoints.indexOf(selected) - 1]?.key}`}
                </div>
                {selected.baruPensiun.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Tidak ada.</p>
                ) : (
                  <div className="mt-1.5 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {selected.baruPensiun.map((r) => (
                      <div
                        key={r.noreg}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs dark:border-slate-800"
                      >
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {r.nama} ({r.noreg})
                        </span>
                        <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                          {r.division} · {r.dept}
                          <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                            {r.bulanPensiun}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
