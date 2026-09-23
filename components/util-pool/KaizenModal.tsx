"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { SegmentedSwitch } from "@/components/ui/SegmentedSwitch";
import { CompositionRowsEditor, emptyCompositionRow, type CompositionRow } from "@/components/takt/CompositionRowsEditor";
import { ReleaseMappingStep, StepNav } from "@/components/takt/ReleaseMappingStep";
import { createKaizenSupply } from "@/lib/engine/actions";
import { pushToast } from "@/lib/toast";
import { inKaizenLaborGroup, type KaizenLaborGroup, type TaktDownPerson } from "@/lib/types";

/** Same two-step flow as Takt Down — one Kaizen activity can release people
 * from several shops, departments and status MP at once, so the per-shop
 * plan comes first and the name-by-name mapping second. Kaizen adds its own
 * header: which labor group (A/F or B/C) the activity belongs to, what the
 * activity is, and when the people are released. Always mounted
 * conditionally by the caller, so state starts fresh on every open. */
export function KaizenModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [laborGroup, setLaborGroup] = useState<KaizenLaborGroup | "">("");
  const [activity, setActivity] = useState("");
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [step, setStep] = useState<"plan" | "names">("plan");
  const [planRows, setPlanRows] = useState<CompositionRow[]>([emptyCompositionRow()]);
  const [selected, setSelected] = useState<TaktDownPerson[]>([]);

  const matchesLabor = laborGroup ? (lt: string) => inKaizenLaborGroup(laborGroup, lt) : undefined;
  const headerComplete = Boolean(laborGroup && activity.trim() && releaseDate);

  function changeLaborGroup(next: KaizenLaborGroup) {
    if (next === laborGroup) return;
    // Plan rows and picked people were scoped to the old group's shops and
    // labor types — carrying them over would silently mix groups.
    setLaborGroup(next);
    setPlanRows([emptyCompositionRow()]);
    setSelected([]);
    setStep("plan");
  }

  function submit() {
    if (!laborGroup || selected.length === 0 || !activity.trim()) return;
    createKaizenSupply({
      releaseDate,
      activity: activity.trim(),
      laborGroup,
      persons: selected.map((s) => ({ noreg: s.noreg, nama: s.nama, type: s.type, div: s.div, dept: s.dept })),
    });
    pushToast(`${selected.length} personil dari Kaizen "${activity.trim()}" masuk ke Supply Pool.`, "success");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Kaizen: Tambah Supply dari Hasil Improvement" width="max-w-5xl">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Labor type
            </span>
            <SegmentedSwitch
              label="Labor type Kaizen"
              options={[
                { value: "A/F", label: "Kaizen Labor A/F" },
                { value: "B/C", label: "Kaizen Labor B/C" },
              ]}
              value={laborGroup as KaizenLaborGroup}
              onChange={changeLaborGroup}
            />
          </div>
          <Field label="Activity">
            <Input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Nama improvement/aktivitas Kaizen" />
          </Field>
          <Field label="Tanggal Rilis">
            <Input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
          </Field>
        </div>

        {!laborGroup ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
            Pilih dulu labor type Kaizen ini — <strong className="font-semibold">A/F</strong> (labor A dan F) atau{" "}
            <strong className="font-semibold">B/C</strong> (labor B1–B4 dan C1–C2). Shop dan personil yang bisa dipilih mengikuti labor type ini.
          </p>
        ) : (
          <>
            <StepNav step={step} onStep={setStep} />

            {step === "plan" && (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Satu aktivitas Kaizen bisa melepas personil dari beberapa shop sekaligus — divisi sama tapi beda department, atau status MP
                  yang berbeda. Tentukan rencana per shop dulu di sini, baru pilih orangnya di langkah berikutnya.
                </p>
                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400">Rencana rilis per shop · Labor {laborGroup}</h4>
                <CompositionRowsEditor rows={planRows} onChange={setPlanRows} laborTypeFilter={matchesLabor} />
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
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setStep("plan")}>
                    ← Kembali ke Rencana
                  </Button>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {!activity.trim() && <span className="text-xs text-amber-700 dark:text-amber-300">Isi Activity dulu.</span>}
                    <Button variant="secondary" onClick={onClose}>
                      Batal
                    </Button>
                    <Button variant="primary" onClick={submit} disabled={!headerComplete || selected.length === 0}>
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
