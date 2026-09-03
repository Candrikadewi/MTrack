"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";
import { createTaktUp } from "@/lib/engine/actions";
import type { MpRole, MpStatusKategori, Plant, ProjectMpNeedRow } from "@/lib/types";

type DraftRow = Omit<ProjectMpNeedRow, "id">;
const emptyRow = (): DraftRow => ({
  division: "",
  dept: "",
  status_mp: "Vokasi",
  mp_role: "Proses",
  qty: 1,
  fulfill_date: "",
});

export function TaktUpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [plant, setPlant] = useState<Plant>("Plant 1");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [taktBefore, setTaktBefore] = useState(0);
  const [taktAfter, setTaktAfter] = useState(0);
  const [rows, setRows] = useState<DraftRow[]>([emptyRow()]);

  function updateRow(idx: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function reset() {
    setRows([emptyRow()]);
    setTaktBefore(0);
    setTaktAfter(0);
  }

  function submit() {
    const validRows = rows.filter((r) => r.division && r.dept && r.qty > 0);
    if (validRows.length === 0) return;
    createTaktUp({ plant, date, takt_before: taktBefore, takt_after: taktAfter, need_rows: validRows });
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
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-500">Kebutuhan MP</h4>
            <Button size="sm" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
              + Baris
            </Button>
          </div>
          <div className="space-y-2">
            {rows.map((row, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 p-2 dark:border-slate-800"
              >
                <div className="min-w-[150px] flex-1">
                  <span className="mb-1 block text-[11px] font-medium text-slate-500">Divisi</span>
                  <Input value={row.division} onChange={(e) => updateRow(idx, { division: e.target.value })} />
                </div>
                <div className="min-w-[150px] flex-1">
                  <span className="mb-1 block text-[11px] font-medium text-slate-500">Department</span>
                  <Input value={row.dept} onChange={(e) => updateRow(idx, { dept: e.target.value })} />
                </div>
                <div className="w-32">
                  <span className="mb-1 block text-[11px] font-medium text-slate-500">Status MP</span>
                  <Select
                    value={row.status_mp}
                    onChange={(e) => updateRow(idx, { status_mp: e.target.value as MpStatusKategori })}
                  >
                    <option value="Vokasi">Vokasi</option>
                    <option value="PKWT">PKWT</option>
                    <option value="Permanen">Permanen</option>
                    <option value="AKTI">AKTI</option>
                  </Select>
                </div>
                <div className="w-28">
                  <span className="mb-1 block text-[11px] font-medium text-slate-500">MP Role</span>
                  <Select
                    value={row.mp_role}
                    onChange={(e) => updateRow(idx, { mp_role: e.target.value as MpRole })}
                  >
                    <option value="Proses">Proses</option>
                    <option value="Backup">Backup</option>
                  </Select>
                </div>
                <div className="w-24">
                  <span className="mb-1 block text-[11px] font-medium text-slate-500">Qty</span>
                  <Input
                    type="number"
                    min={1}
                    className="text-center text-base font-semibold"
                    value={row.qty}
                    onChange={(e) => updateRow(idx, { qty: Number(e.target.value) })}
                  />
                </div>
                <div className="min-w-[160px]">
                  <span className="mb-1 block text-[11px] font-medium text-slate-500">Tanggal Pemenuhan</span>
                  <Input
                    type="date"
                    value={row.fulfill_date}
                    onChange={(e) => updateRow(idx, { fulfill_date: e.target.value })}
                  />
                </div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="mb-1.5 rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    aria-label="Hapus baris"
                  >
                    <X size={16} />
                  </button>
                )}
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
