"use client";
import { X } from "lucide-react";
import { Select, Input } from "@/components/ui/Form";
import { getActiveSnapshot } from "@/lib/repo";
import type { MpStatusKategori } from "@/lib/types";

/** Shared shape for a Takt Up need-row or a Takt Down plan-row while
 * they're being composed — each modal converts to/from its own specific
 * row type (ProjectMpNeedRow / TaktDownPlanRow) around this editor. No MP
 * Role field: that distinction is Project-only. */
export interface CompositionRow {
  id: string;
  division: string;
  dept: string;
  status_mp: MpStatusKategori;
  qty: number;
  date: string;
}

export function emptyCompositionRow(patch: Partial<CompositionRow> = {}): CompositionRow {
  return {
    id: crypto.randomUUID(),
    division: "",
    dept: "",
    status_mp: "PKWT",
    qty: 1,
    date: "",
    ...patch,
  };
}

interface DivGroup {
  division: string;
  deptGroups: { dept: string; rows: CompositionRow[] }[];
}

/** Groups are purely derived from each row's own division/dept on every
 * render — editing a row's division/dept naturally moves it into a
 * different (or brand new) group next render, with no separate "rename
 * group" logic needed. A blank division/dept never merges with another
 * blank one (each keyed by its own row id), so several still-undefined
 * groups can be composed side by side without colliding. */
function groupRows(rows: CompositionRow[]): DivGroup[] {
  const divOrder: string[] = [];
  const divMap = new Map<string, CompositionRow[]>();
  for (const r of rows) {
    const key = r.division || `__blank_${r.id}`;
    if (!divMap.has(key)) {
      divMap.set(key, []);
      divOrder.push(key);
    }
    divMap.get(key)!.push(r);
  }
  return divOrder.map((key) => {
    const groupRowsList = divMap.get(key)!;
    const deptOrder: string[] = [];
    const deptMap = new Map<string, CompositionRow[]>();
    for (const r of groupRowsList) {
      const dkey = r.dept || `__blank_${r.id}`;
      if (!deptMap.has(dkey)) {
        deptMap.set(dkey, []);
        deptOrder.push(dkey);
      }
      deptMap.get(dkey)!.push(r);
    }
    return {
      division: groupRowsList[0].division,
      deptGroups: deptOrder.map((dkey) => ({ dept: deptMap.get(dkey)![0].dept, rows: deptMap.get(dkey)! })),
    };
  });
}

export function CompositionRowsEditor({
  rows,
  onChange,
  dateLabel,
}: {
  rows: CompositionRow[];
  onChange: (rows: CompositionRow[]) => void;
  dateLabel: string;
}) {
  const employees = getActiveSnapshot()?.employees ?? [];
  const divOptions = Array.from(new Set(employees.map((e) => e.division).filter(Boolean))).sort();
  const deptOptionsFor = (division: string) =>
    Array.from(new Set(employees.filter((e) => e.division === division).map((e) => e.dept).filter(Boolean))).sort();

  function update(id: string, patch: Partial<CompositionRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function remove(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }

  function addRow(patch: Partial<CompositionRow>) {
    onChange([...rows, emptyCompositionRow(patch)]);
  }

  const groups = groupRows(rows);
  const canRemove = rows.length > 1;

  return (
    <div className="space-y-3">
      {groups.map((dg, dgIdx) => (
        <div key={dg.division || `div-${dgIdx}`} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          {dg.division && (
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {dg.division}
            </div>
          )}
          <div className="space-y-2">
            {dg.deptGroups.map((deptG, deptIdx) => (
              <div key={deptG.dept || `dept-${deptIdx}`} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/50">
                {deptG.dept && (
                  <div className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{deptG.dept}</div>
                )}
                <div className="space-y-1.5">
                  {deptG.rows.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-end gap-1.5">
                      <div className="w-36">
                        <span className="mb-0.5 block text-[10px] font-medium text-slate-400">Divisi</span>
                        <Select
                          value={row.division}
                          onChange={(e) => update(row.id, { division: e.target.value, dept: "" })}
                        >
                          <option value="">- pilih -</option>
                          {divOptions.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="w-36">
                        <span className="mb-0.5 block text-[10px] font-medium text-slate-400">Department</span>
                        <Select
                          value={row.dept}
                          onChange={(e) => update(row.id, { dept: e.target.value })}
                          disabled={!row.division}
                        >
                          <option value="">{row.division ? "- pilih -" : "Pilih Divisi dulu"}</option>
                          {deptOptionsFor(row.division).map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="w-28">
                        <span className="mb-0.5 block text-[10px] font-medium text-slate-400">Status MP</span>
                        <Select
                          value={row.status_mp}
                          onChange={(e) => update(row.id, { status_mp: e.target.value as MpStatusKategori })}
                        >
                          <option value="Vokasi">Vokasi</option>
                          <option value="PKWT">PKWT</option>
                          <option value="Permanen">Permanen</option>
                          <option value="AKTI">AKTI</option>
                        </Select>
                      </div>
                      <div className="w-20">
                        <span className="mb-0.5 block text-[10px] font-medium text-slate-400">Qty</span>
                        <Input
                          type="number"
                          min={1}
                          className="text-center text-sm font-semibold"
                          value={row.qty}
                          onChange={(e) => update(row.id, { qty: Number(e.target.value) })}
                        />
                      </div>
                      <div className="min-w-[150px]">
                        <span className="mb-0.5 block text-[10px] font-medium text-slate-400">{dateLabel}</span>
                        <Input type="date" value={row.date} onChange={(e) => update(row.id, { date: e.target.value })} />
                      </div>
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => remove(row.id)}
                          className="mb-0.5 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                          aria-label="Hapus baris"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => addRow({ division: dg.division, dept: deptG.dept })}
                  className="mt-1.5 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  + Status MP
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => addRow({ division: dg.division })}
            className="mt-2 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            + Department
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => addRow({})}
        className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        + Divisi
      </button>
    </div>
  );
}
