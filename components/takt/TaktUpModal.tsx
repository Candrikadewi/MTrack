"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { createTaktUp } from "@/lib/engine/actions";
import type { MpStatusKategori, Plant, ProjectMpNeedRow } from "@/lib/types";

type DraftRow = Omit<ProjectMpNeedRow, "id">;
const emptyRow = (): DraftRow => ({ division: "", dept: "", status_mp: "Vokasi", qty: 1, fulfill_date: "" });

export function TaktUpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [plant, setPlant] = useState<Plant>("Plant 1");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [taktBefore, setTaktBefore] = useState(0);
  const [taktAfter, setTaktAfter] = useState(0);
  const [rows, setRows] = useState<DraftRow[]>([emptyRow()]);

  function updateRow(idx: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function reset() {
    setRows([emptyRow()]);
    setTaktBefore(0);
    setTaktAfter(0);
  }

  function submit() {
    const validRows = rows.filter((r) => r.division && r.dept && r.qty > 0);
    if (validRows.length === 0) return;
    createTaktUp({ plant, date, takt_before: taktBefore, takt_after: taktAfter, needRows: validRows });
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Takt Up — Tambah Kebutuhan MP" width="max-w-2xl">
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
          <Field label="Takt Before (s)">
            <Input type="number" value={taktBefore} onChange={(e) => setTaktBefore(Number(e.target.value))} />
          </Field>
          <Field label="Takt After (s)">
            <Input type="number" value={taktAfter} onChange={(e) => setTaktAfter(Number(e.target.value))} />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-500">Kebutuhan MP</h4>
            <Button size="sm" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
              + Baris
            </Button>
          </div>
          <div className="space-y-2">
            {rows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 rounded-lg border border-slate-100 p-2 dark:border-slate-800">
                <Input
                  className="col-span-3"
                  placeholder="Divisi"
                  value={row.division}
                  onChange={(e) => updateRow(idx, { division: e.target.value })}
                />
                <Input
                  className="col-span-3"
                  placeholder="Department"
                  value={row.dept}
                  onChange={(e) => updateRow(idx, { dept: e.target.value })}
                />
                <Select
                  className="col-span-2"
                  value={row.status_mp}
                  onChange={(e) => updateRow(idx, { status_mp: e.target.value as MpStatusKategori })}
                >
                  <option value="Vokasi">Vokasi</option>
                  <option value="PKWT">PKWT</option>
                  <option value="Permanen">Permanen</option>
                  <option value="AKTI">AKTI</option>
                </Select>
                <Input
                  type="number"
                  min={1}
                  className="col-span-1"
                  value={row.qty}
                  onChange={(e) => updateRow(idx, { qty: Number(e.target.value) })}
                />
                <Input
                  type="date"
                  className="col-span-3"
                  value={row.fulfill_date}
                  onChange={(e) => updateRow(idx, { fulfill_date: e.target.value })}
                />
              </div>
            ))}
          </div>
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
