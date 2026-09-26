"use client";
import { X } from "lucide-react";
import { Select, Input } from "@/components/ui/Form";
import { getActiveSnapshot } from "@/lib/repo";
import { MP_ROLE_OPTIONS, type MpRole, type MpStatusKategori } from "@/lib/types";

/** Shared shape for a Takt Up need-row, a Takt Down plan-row, or a Project
 * need-row while they're being composed — each modal converts to/from its
 * own specific row type around this editor. mp_role only renders when the
 * caller passes `withRole` (Project only — Takt never asks for it). */
export interface CompositionRow {
  id: string;
  division: string;
  dept: string;
  status_mp: MpStatusKategori;
  mp_role?: MpRole;
  qty: number;
  date: string;
  /** Kaizen only — which improvement activity released this row. */
  activity?: string;
  /** Project only — when this row's MP is released, or noRelease when the
   * seat stays for good (it keeps being refilled like regular enrollment). */
  releaseDate?: string;
  noRelease?: boolean;
}

export function emptyCompositionRow(patch: Partial<CompositionRow> = {}): CompositionRow {
  return {
    id: crypto.randomUUID(),
    division: "",
    dept: "",
    status_mp: "PKWT",
    mp_role: "Project",
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
  laborTypeFilter,
  withRole = false,
  withActivity = false,
  withRelease = false,
  isRowLocked,
  isReleaseLocked,
  minQtyFor,
}: {
  rows: CompositionRow[];
  onChange: (rows: CompositionRow[]) => void;
  /** Label for the per-row date column; omit to hide the column when the
   * date belongs to the whole case instead (Kaizen). */
  dateLabel?: string;
  /** Restricts Divisi/Department options to shops with at least one active
   * employee of a matching ZPAR labor_type — a single code (Takt Down: "A")
   * or a predicate (Kaizen: its labor group). */
  laborTypeFilter?: string | ((laborType: string) => boolean);
  /** Shows the Jenis MP select — Project only. */
  withRole?: boolean;
  /** Shows the Tanggal Release / No Release control — Project only.
   * Picking MP Setting defaults it to No Release, MP Project/Backup to a date. */
  withRelease?: boolean;
  /** Release stays editable on locked rows until the release has happened. */
  isReleaseLocked?: (row: CompositionRow) => boolean;
  /** Shows a per-row Activity field — Kaizen only. New rows copy the
   * activity and date of the row they're added next to. */
  withActivity?: boolean;
  /** A locked row (Project: already expanded into real Demand records) can
   * only have its qty increased — every other field is disabled and it
   * can't be removed, so already-fulfilled demand history never gets
   * silently reshuffled by a composition edit. */
  isRowLocked?: (row: CompositionRow) => boolean;
  minQtyFor?: (row: CompositionRow) => number;
}) {
  const allEmployees = getActiveSnapshot()?.employees ?? [];
  const matchesLabor =
    typeof laborTypeFilter === "function" ? laborTypeFilter : laborTypeFilter ? (lt: string) => lt === laborTypeFilter : null;
  const employees = matchesLabor ? allEmployees.filter((e) => matchesLabor(e.labor_type)) : allEmployees;
  const divOptions = Array.from(new Set(employees.map((e) => e.division).filter(Boolean))).sort();
  const deptOptionsFor = (division: string) =>
    Array.from(
      new Set(
        employees
          .filter((e) => e.division === division)
          .map((e) => e.dept)
          .filter(Boolean)
      )
    ).sort();

  function update(id: string, patch: Partial<CompositionRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function remove(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }

  function addRow(patch: Partial<CompositionRow>, from?: CompositionRow) {
    const carried = withActivity && from ? { activity: from.activity ?? "", date: from.date } : {};
    onChange([...rows, emptyCompositionRow({ ...carried, ...patch })]);
  }

  const groups = groupRows(rows);
  const removableCount = rows.filter((r) => !isRowLocked?.(r)).length;

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
                {deptG.dept && <div className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{deptG.dept}</div>}
                <div className="space-y-1.5">
                  {deptG.rows.map((row) => {
                    const locked = isRowLocked?.(row) ?? false;
                    return (
                      <div key={row.id} className="flex flex-wrap items-end gap-1.5">
                        <div className="w-36">
                          <span className="mb-0.5 block text-[10px] font-medium text-slate-500 dark:text-slate-400">Divisi</span>
                          <Select
                            value={row.division}
                            disabled={locked}
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
                          <span className="mb-0.5 block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            Department
                          </span>
                          <Select
                            value={row.dept}
                            onChange={(e) => update(row.id, { dept: e.target.value })}
                            disabled={locked || !row.division}
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
                          <span className="mb-0.5 block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            Status MP
                          </span>
                          <Select
                            value={row.status_mp}
                            disabled={locked}
                            onChange={(e) => update(row.id, { status_mp: e.target.value as MpStatusKategori })}
                          >
                            <option value="Vokasi">Vokasi</option>
                            <option value="PKWT">PKWT</option>
                            <option value="Permanen">Permanen</option>
                            <option value="AKTI">AKTI</option>
                          </Select>
                        </div>
                        {withRole && (
                          <div className="w-32">
                            <span className="mb-0.5 block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                              Jenis MP
                            </span>
                            <Select
                              value={row.mp_role === "Proses" ? "Project" : row.mp_role}
                              disabled={locked}
                              onChange={(e) => {
                                const mp_role = e.target.value as MpRole;
                                update(row.id, withRelease ? { mp_role, noRelease: mp_role === "Setting" } : { mp_role });
                              }}
                            >
                              {MP_ROLE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </Select>
                          </div>
                        )}
                        <div className="w-20">
                          <span className="mb-0.5 block text-[10px] font-medium text-slate-500 dark:text-slate-400">Qty</span>
                          <Input
                            type="number"
                            min={minQtyFor?.(row) ?? 1}
                            className="text-center text-sm font-semibold"
                            value={row.qty}
                            onChange={(e) => update(row.id, { qty: Number(e.target.value) })}
                          />
                        </div>
                        {withActivity && (
                          <div className="min-w-[180px] flex-1">
                            <span className="mb-0.5 block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                              Activity
                            </span>
                            <Input
                              value={row.activity ?? ""}
                              disabled={locked}
                              placeholder="Nama aktivitas Kaizen"
                              aria-label="Activity"
                              onChange={(e) => update(row.id, { activity: e.target.value })}
                            />
                          </div>
                        )}
                        {dateLabel && (
                          <div className="min-w-[150px]">
                            <span className="mb-0.5 block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                              {dateLabel}
                            </span>
                            <Input
                              type="date"
                              disabled={locked}
                              value={row.date}
                              onChange={(e) => update(row.id, { date: e.target.value })}
                            />
                          </div>
                        )}
                        {withRelease && (
                          <ReleaseField
                            row={row}
                            disabled={isReleaseLocked?.(row) ?? false}
                            onChange={(patch) => update(row.id, patch)}
                          />
                        )}
                        {locked ? (
                          <span className="mb-1.5 text-[10px] text-slate-500">{minQtyFor?.(row)} sudah berjalan</span>
                        ) : (
                          removableCount > 1 && (
                            <button
                              type="button"
                              onClick={() => remove(row.id)}
                              className="mb-0.5 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                              aria-label="Hapus baris"
                            >
                              <X size={14} />
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => addRow({ division: dg.division, dept: deptG.dept }, deptG.rows[deptG.rows.length - 1])}
                  className="mt-1.5 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  + Status MP
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => addRow({ division: dg.division }, dg.deptGroups.at(-1)?.rows.at(-1))}
            className="mt-2 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            + Department
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => addRow({}, rows[rows.length - 1])}
        className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        + Divisi
      </button>
    </div>
  );
}

/** Tanggal Release with a "No Release" switch beside it. No Release swaps
 * the date for a note, so it reads as a decision rather than a blank date. */
function ReleaseField({
  row,
  disabled,
  onChange,
}: {
  row: CompositionRow;
  disabled: boolean;
  onChange: (patch: Partial<CompositionRow>) => void;
}) {
  const noRelease = Boolean(row.noRelease);
  const invalid = !noRelease && Boolean(row.releaseDate && row.date && row.releaseDate <= row.date);
  return (
    <div className="min-w-[230px]">
      <span className="mb-0.5 block text-[10px] font-medium text-slate-500 dark:text-slate-400">Tanggal Release</span>
      <div className="flex items-center gap-2">
        {noRelease ? (
          <div className="flex h-[38px] flex-1 items-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/70 px-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
            Tidak dirilis · jadi reguler
          </div>
        ) : (
          <Input
            type="date"
            disabled={disabled}
            value={row.releaseDate ?? ""}
            aria-label="Tanggal Release"
            aria-invalid={invalid || undefined}
            className={`flex-1 ${invalid ? "border-red-400 dark:border-red-500" : ""}`}
            onChange={(e) => onChange({ releaseDate: e.target.value })}
          />
        )}
        <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            disabled={disabled}
            checked={noRelease}
            onChange={(e) => onChange({ noRelease: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500"
          />
          No Release
        </label>
      </div>
      {invalid && (
        <span className="mt-0.5 block text-[10px] text-red-600 dark:text-red-400">Harus setelah tanggal pemenuhan</span>
      )}
    </div>
  );
}
