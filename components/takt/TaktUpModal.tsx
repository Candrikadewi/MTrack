"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { CompositionRowsEditor, emptyCompositionRow, type CompositionRow } from "@/components/takt/CompositionRowsEditor";
import { createTaktUp } from "@/lib/engine/actions";
import type { Plant, ProjectMpNeedRow } from "@/lib/types";

// Takt Up's need_rows are ProjectMpNeedRow under the hood (createDemandsFromTaktRow
// expects that shape), but the composition step itself never asks for MP
// Role (Proses/Backup) — that distinction is Project-only — so every row
// submits as "Proses", a value nothing downstream branches on (it's purely
// a display badge on Project's own detail view).
function toNeedRow(row: CompositionRow): Omit<ProjectMpNeedRow, "id"> {
  return { division: row.division, dept: row.dept, status_mp: row.status_mp, mp_role: "Proses", qty: row.qty, fulfill_date: row.date };
}

export function TaktUpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [plant, setPlant] = useState<Plant>("Plant 1");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [taktBefore, setTaktBefore] = useState(0);
  const [taktAfter, setTaktAfter] = useState(0);
  const [rows, setRows] = useState<CompositionRow[]>([emptyCompositionRow()]);

  function reset() {
    setRows([emptyCompositionRow()]);
    setTaktBefore(0);
    setTaktAfter(0);
  }

  function submit() {
    const validRows = rows.filter((r) => r.division && r.dept && r.qty > 0);
    if (validRows.length === 0) return;
    createTaktUp({ plant, date, takt_before: taktBefore, takt_after: taktAfter, need_rows: validRows.map(toNeedRow) });
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Takt Up: Tambah Kebutuhan MP" width="max-w-4xl">
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
          <Field label="Takt Before (menit)">
            <Input
              type="number"
              step="0.01"
              value={taktBefore}
              onChange={(e) => setTaktBefore(Number(e.target.value))}
            />
          </Field>
          <Field label="Takt After (menit)">
            <Input
              type="number"
              step="0.01"
              value={taktAfter}
              onChange={(e) => setTaktAfter(Number(e.target.value))}
            />
          </Field>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold text-slate-500">Kebutuhan MP</h4>
          <CompositionRowsEditor rows={rows} onChange={setRows} dateLabel="Tanggal Pemenuhan" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" onClick={submit}>
            Simpan Takt Up
          </Button>
        </div>
      </div>
    </Modal>
  );
}
