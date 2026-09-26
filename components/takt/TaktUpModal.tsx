"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { CompositionRowsEditor, emptyCompositionRow, type CompositionRow } from "@/components/takt/CompositionRowsEditor";
import { TaktSecondsField } from "@/components/takt/TaktSecondsField";
import { createTaktUp, demandIdsByRow, lockedDemandCount, updateTaktUp } from "@/lib/engine/actions";
import { pushToast } from "@/lib/toast";
import type { Plant, ProjectMpNeedRow, TaktCase } from "@/lib/types";

// Takt Up's need_rows are ProjectMpNeedRow under the hood (createDemandsFromTaktRow
// expects that shape), but the composition step itself never asks for MP
// Role (Proses/Backup) — that distinction is Project-only — so every row
// submits as "Proses", a value nothing downstream branches on (it's purely
// a display badge on Project's own detail view).
function toNeedRow(row: CompositionRow): Omit<ProjectMpNeedRow, "id"> {
  return {
    division: row.division,
    dept: row.dept,
    status_mp: row.status_mp,
    mp_role: "Proses",
    qty: row.qty,
    fulfill_date: row.date,
  };
}

function fromNeedRow(row: ProjectMpNeedRow): CompositionRow {
  return { id: row.id, division: row.division, dept: row.dept, status_mp: row.status_mp, qty: row.qty, date: row.fulfill_date };
}

/** Mount conditionally (fresh state per open). Pass `editing` to change an
 * existing Takt Up; rows whose demands are in progress keep their shop and
 * status and can't drop below what's already running. */
export function TaktUpModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: TaktCase }) {
  const [plant, setPlant] = useState<Plant>(editing?.plant ?? "Plant 1");
  const [date, setDate] = useState(editing?.date ?? new Date().toISOString().slice(0, 10));
  const [taktBefore, setTaktBefore] = useState(editing?.takt_before ?? 0);
  const [taktAfter, setTaktAfter] = useState(editing?.takt_after ?? 0);
  const [rows, setRows] = useState<CompositionRow[]>(
    editing?.need_rows?.length ? editing.need_rows.map(fromNeedRow) : [emptyCompositionRow()]
  );
  const idsByRow = editing ? demandIdsByRow(editing.need_rows ?? [], editing.demand_ids) : new Map<string, string[]>();
  const originalIds = new Set((editing?.need_rows ?? []).map((r) => r.id));
  const lockedFor = (row: CompositionRow) => lockedDemandCount(idsByRow.get(row.id) ?? []);

  function reset() {
    setRows([emptyCompositionRow()]);
    setTaktBefore(0);
    setTaktAfter(0);
  }

  function submit() {
    const validRows = rows.filter((r) => r.division && r.dept && r.qty > 0);
    if (validRows.length === 0) return;
    if (editing) {
      const error = updateTaktUp(editing.id, {
        plant,
        date,
        takt_before: taktBefore,
        takt_after: taktAfter,
        rows: validRows.map((r) => ({ ...toNeedRow(r), ...(originalIds.has(r.id) ? { id: r.id } : {}) })),
      });
      if (error) {
        pushToast(error);
        return;
      }
      pushToast("Takt Up diperbarui.", "success");
      onClose();
      return;
    }
    createTaktUp({ plant, date, takt_before: taktBefore, takt_after: taktAfter, need_rows: validRows.map(toNeedRow) });
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit Takt Up ${editing.plant}` : "Takt Up: Tambah Kebutuhan MP"}
      width="max-w-4xl"
    >
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

        <div>
          <h4 className="mb-2 text-xs font-semibold text-slate-500">Kebutuhan MP</h4>
          <CompositionRowsEditor
            rows={rows}
            onChange={setRows}
            dateLabel="Tanggal Pemenuhan"
            isRowLocked={(row) => lockedFor(row) > 0}
            minQtyFor={(row) => Math.max(1, lockedFor(row))}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" onClick={submit}>
            {editing ? "Simpan Perubahan" : "Simpan Takt Up"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
