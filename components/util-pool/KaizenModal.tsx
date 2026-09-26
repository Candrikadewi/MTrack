"use client";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CompositionRowsEditor, emptyCompositionRow, type CompositionRow } from "@/components/takt/CompositionRowsEditor";
import { ReleaseMappingStep, StepNav, resolvePlanRow } from "@/components/takt/ReleaseMappingStep";
import { getActiveSnapshot } from "@/lib/repo";
import { createKaizenSupply } from "@/lib/engine/actions";
import { pushToast } from "@/lib/toast";
import { todayKey } from "@/lib/dates";
import { KAIZEN_LABOR_GROUPS, inKaizenLaborGroup, type KaizenLaborGroup, type TaktDownPerson } from "@/lib/types";

const GROUP_DETAIL: Record<KaizenLaborGroup, string> = {
  "A/F": "Labor type A dan F",
  "B/C": "Labor type B1–B4 dan C1–C2",
};

/** The one decision that scopes the whole Kaizen form, so it gets a
 * prominent card per option rather than a small toggle. */
function LaborGroupPicker({ value, onChange }: { value: KaizenLaborGroup | ""; onChange: (g: KaizenLaborGroup) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const headcount = useMemo(() => {
    const employees = getActiveSnapshot()?.employees ?? [];
    return Object.fromEntries(
      KAIZEN_LABOR_GROUPS.map((g) => [g, employees.filter((e) => inKaizenLaborGroup(g, e.labor_type)).length])
    ) as Record<KaizenLaborGroup, number>;
  }, []);

  function onKeyDown(e: KeyboardEvent, index: number) {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + KAIZEN_LABOR_GROUPS.length) % KAIZEN_LABOR_GROUPS.length;
    onChange(KAIZEN_LABOR_GROUPS[next]);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Jenis Kaizen" className="grid gap-3 sm:grid-cols-2">
      {KAIZEN_LABOR_GROUPS.map((g, i) => {
        const checked = value === g;
        return (
          <button
            key={g}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (!value && i === 0) ? 0 : -1}
            onClick={() => onChange(g)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`flex items-start justify-between gap-3 rounded-2xl border-2 p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
              checked
                ? "border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/10"
                : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500/60 dark:hover:bg-slate-800"
            }`}
          >
            <span>
              <span className={`block text-base font-semibold ${checked ? "text-blue-800 dark:text-blue-200" : "text-slate-800 dark:text-slate-100"}`}>
                Kaizen Labor {g}
              </span>
              <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-400">{GROUP_DETAIL[g]}</span>
              <span className="mt-2 block text-xs text-slate-500 tabular-nums dark:text-slate-400">{headcount[g]} MP aktif di ZPAR</span>
            </span>
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                checked ? "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-900" : "border-slate-300 dark:border-slate-600"
              }`}
            >
              {checked && <Check size={12} strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Same two-step flow as Takt Down — one Kaizen can release people from
 * several shops, departments and status MP, each row with its own activity
 * and release date. The only thing decided up front is the labor group
 * (A/F or B/C), which scopes which shops and people can be picked. Always
 * mounted conditionally by the caller, so state starts fresh on every open. */
export function KaizenModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [laborGroup, setLaborGroup] = useState<KaizenLaborGroup | "">("");
  const [step, setStep] = useState<"plan" | "names">("plan");
  const [planRows, setPlanRows] = useState<CompositionRow[]>(() => [emptyCompositionRow({ date: todayKey(), activity: "" })]);
  const [selected, setSelected] = useState<TaktDownPerson[]>([]);

  const matchesLabor = laborGroup ? (lt: string) => inKaizenLaborGroup(laborGroup, lt) : undefined;
  const validRows = planRows.filter((r) => r.division && r.dept && r.qty > 0);

  function changeLaborGroup(next: KaizenLaborGroup) {
    if (next === laborGroup) return;
    // Plan rows and picked people were scoped to the old group's shops and
    // labor types — carrying them over would silently mix groups.
    setLaborGroup(next);
    setPlanRows([emptyCompositionRow({ date: todayKey(), activity: "" })]);
    setSelected([]);
    setStep("plan");
  }

  const assignments = selected.map((p) => ({ person: p, row: resolvePlanRow(p, validRows) }));
  const unplanned = assignments.filter((a) => !a.row).length;
  const incompleteRows = Array.from(
    new Set(assignments.filter((a) => a.row && (!a.row.activity?.trim() || !a.row.date)).map((a) => a.row as CompositionRow))
  );
  const canSave = Boolean(laborGroup) && selected.length > 0 && unplanned === 0 && incompleteRows.length === 0;

  function submit() {
    if (!laborGroup || !canSave) return;
    createKaizenSupply({
      laborGroup,
      persons: assignments.map(({ person: p, row }) => ({
        noreg: p.noreg,
        nama: p.nama,
        type: p.type,
        div: p.div,
        dept: p.dept,
        activity: row!.activity!.trim(),
        releaseDate: row!.date,
      })),
    });
    pushToast(`${selected.length} personil dari Kaizen Labor ${laborGroup} masuk ke Supply Pool.`, "success");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Kaizen: Tambah Supply dari Hasil Improvement" width="max-w-5xl">
      <div className="space-y-5">
        <LaborGroupPicker value={laborGroup} onChange={changeLaborGroup} />

        {!laborGroup ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Pilih jenis Kaizen dulu. Shop dan personil yang bisa dipilih di langkah berikutnya mengikuti labor type ini.
          </p>
        ) : (
          <>
            <StepNav step={step} onStep={setStep} />

            {step === "plan" && (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Satu Kaizen bisa melepas personil dari beberapa shop sekaligus — divisi sama tapi beda department, atau status MP berbeda.
                  Isi per baris: shop, status MP, jumlah, activity, dan tanggal rilisnya. Pilih orangnya di langkah berikutnya.
                </p>
                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400">Rencana rilis per shop · Kaizen Labor {laborGroup}</h4>
                <CompositionRowsEditor
                  rows={planRows}
                  onChange={setPlanRows}
                  laborTypeFilter={matchesLabor}
                  dateLabel="Tanggal Rilis"
                  withActivity
                />
                <div className="flex justify-end pt-2">
                  <Button variant="primary" onClick={() => setStep("names")}>
                    Lanjut ke Mapping Name-by-Name →
                  </Button>
                </div>
              </div>
            )}

            {step === "names" && (
              <div className="space-y-4">
                <ReleaseMappingStep planRows={planRows} selected={selected} onChange={setSelected} laborTypeFilter={matchesLabor} />
                {(unplanned > 0 || incompleteRows.length > 0) && (
                  <div role="status" className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    {unplanned > 0 && (
                      <p>
                        {unplanned} personil tidak cocok dengan baris rencana manapun — tambahkan barisnya di Rencana per Shop, atau hapus orangnya.
                      </p>
                    )}
                    {incompleteRows.length > 0 && (
                      <p>
                        Lengkapi Activity dan Tanggal Rilis di baris:{" "}
                        {incompleteRows.map((r) => `${r.division} · ${r.dept} · ${r.status_mp}`).join("; ")}.
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setStep("plan")}>
                    ← Kembali ke Rencana
                  </Button>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>
                      Batal
                    </Button>
                    <Button variant="primary" onClick={submit} disabled={!canSave}>
                      Simpan Kaizen ({selected.length} orang)
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
