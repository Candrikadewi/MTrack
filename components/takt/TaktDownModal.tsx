"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { CompositionRowsEditor, emptyCompositionRow, type CompositionRow } from "@/components/takt/CompositionRowsEditor";
import { ReleaseMappingStep, StepNav } from "@/components/takt/ReleaseMappingStep";
import { TaktSecondsField } from "@/components/takt/TaktSecondsField";
import { createTaktDown, updateTaktDown } from "@/lib/engine/actions";
import type { Plant, TaktCase, TaktDownPerson, TaktDownPlanRow, UtilPoolEntry } from "@/lib/types";

function toPlanRow(row: CompositionRow): Omit<TaktDownPlanRow, "id"> {
  return { division: row.division, dept: row.dept, status_mp: row.status_mp, qty: row.qty, release_date: row.date };
}

function fromPlanRow(row: TaktDownPlanRow): CompositionRow {
  return { id: row.id, division: row.division, dept: row.dept, status_mp: row.status_mp, qty: row.qty, date: row.release_date };
}

/** Legacy cases created before plan_rows existed have no plan — synthesize
 * a starting plan from the actual released persons instead of handing the
 * editor an empty table. */
function planRowsFromPersons(persons: TaktDownPerson[]): CompositionRow[] {
  const groups = new Map<string, CompositionRow>();
  for (const p of persons) {
    const key = `${p.div}|${p.dept}|${p.type}`;
    const existing = groups.get(key);
    if (existing) existing.qty += 1;
    else groups.set(key, emptyCompositionRow({ division: p.div, dept: p.dept, status_mp: p.type, qty: 1 }));
  }
  return Array.from(groups.values());
}

/**
 * Always rendered conditionally by the caller — `{open && <TaktDownModal
 * .../>}`, keyed by the case id when editing — so mounting IS "just
 * opened": every piece of draft state can seed itself once from `editing`
 * via a lazy initializer instead of an effect that would re-seed on every
 * render. Re-opening for a different case gets a fresh instance because the
 * key changes; there is no scenario where this same instance needs to
 * re-seed itself after mount.
 */
export function TaktDownModal({
  onClose,
  editing,
  poolEntries,
}: {
  onClose: () => void;
  /** Present when editing an existing Takt Down case instead of creating one. */
  editing?: TaktCase;
  poolEntries: UtilPoolEntry[];
}) {
  const isEditing = Boolean(editing);
  const [step, setStep] = useState<"plan" | "names">("plan");
  const [plant, setPlant] = useState<Plant>(editing?.plant ?? "Plant 1");
  const [date, setDate] = useState(editing?.date ?? new Date().toISOString().slice(0, 10));
  const [taktBefore, setTaktBefore] = useState(editing?.takt_before ?? 0);
  const [taktAfter, setTaktAfter] = useState(editing?.takt_after ?? 0);
  const [planRows, setPlanRows] = useState<CompositionRow[]>(() => {
    if (!editing) return [emptyCompositionRow()];
    const rows = editing.plan_rows?.length ? editing.plan_rows.map(fromPlanRow) : planRowsFromPersons(editing.released_persons ?? []);
    return rows.length ? rows : [emptyCompositionRow()];
  });
  const [selected, setSelected] = useState<TaktDownPerson[]>(() => (editing?.released_persons ?? []).map((p) => ({ ...p })));

  // Editing an already-Assigned/Released person would orphan whatever
  // that Supply Pool entry is now backing — updateTaktDown enforces this
  // too, but disabling it here avoids a dead-end "Hapus" click.
  const poolStatusByNoreg = new Map(
    (editing?.released_pool_ids ?? [])
      .map((id) => poolEntries.find((e) => e.id === id))
      .filter((e): e is UtilPoolEntry => Boolean(e))
      .map((e) => [e.noreg, e.status])
  );
  const isRemovable = (noreg: string) => (poolStatusByNoreg.get(noreg) ?? "Open") === "Open";

  function submit() {
    if (selected.length === 0) return;
    const validRows = planRows.filter((r) => r.division && r.dept && r.qty > 0);
    if (isEditing && editing) {
      updateTaktDown(editing.id, {
        plant,
        date,
        takt_before: taktBefore,
        takt_after: taktAfter,
        plan_rows: validRows.map((r) => ({ ...toPlanRow(r), id: r.id })),
        released_persons: selected,
      });
    } else {
      createTaktDown({
        plant,
        date,
        takt_before: taktBefore,
        takt_after: taktAfter,
        plan_rows: validRows.map(toPlanRow),
        released_persons: selected,
      });
    }
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={isEditing ? "Edit Takt Down" : "Takt Down: Lepas Personil"} width="max-w-5xl">
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <Field label="Plant">
            <Select value={plant} onChange={(e) => setPlant(e.target.value as Plant)}>
              <option value="Plant 1">Plant 1</option>
              <option value="Plant 2">Plant 2</option>
            </Select>
          </Field>
          <Field label="Tanggal">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <TaktSecondsField label="Takt Before (detik)" valueMinutes={taktBefore} onChange={setTaktBefore} />
          <TaktSecondsField label="Takt After (detik)" valueMinutes={taktAfter} onChange={setTaktAfter} />
        </div>

        <StepNav step={step} onStep={setStep} />

        {step === "plan" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Satu perubahan takt time biasanya berdampak ke beberapa shop sekaligus, dengan komposisi status MP
              (Permanen/Vokasi/Kontrak) yang berbeda-beda per shop. Tentukan rencana per shop dulu di sini, baru pilih
              orangnya di langkah berikutnya.
            </p>
            <h4 className="text-xs font-semibold text-slate-500">Rencana Rilis per Shop</h4>
            <CompositionRowsEditor rows={planRows} onChange={setPlanRows} dateLabel="Tanggal Release" laborTypeFilter="A" />
            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={() => setStep("names")}>
                Lanjut ke Mapping Name-by-Name →
              </Button>
            </div>
          </div>
        )}

        {step === "names" && (
          <div className="space-y-4">
            <ReleaseMappingStep planRows={planRows} selected={selected} onChange={setSelected} isRemovable={isRemovable} />

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="secondary" onClick={() => setStep("plan")}>
                ← Kembali ke Rencana
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={onClose}>
                  Batal
                </Button>
                <Button variant="primary" onClick={submit} disabled={selected.length === 0}>
                  {isEditing ? "Simpan Perubahan" : "Simpan Takt Down"} ({selected.length} orang)
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
