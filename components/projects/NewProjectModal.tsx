"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TableWrap, Th, Td } from "@/components/ui/Table";
import { CompositionRowsEditor, emptyCompositionRow, type CompositionRow } from "@/components/takt/CompositionRowsEditor";
import { addProjectRow, createProject, increaseProjectRowQty, updateProjectDetails } from "@/lib/engine/actions";
import { fmtDate } from "@/lib/engine/compute";
import type { Project, ProjectMpNeedRow } from "@/lib/types";

function toNeedRow(row: CompositionRow): Omit<ProjectMpNeedRow, "id"> {
  return {
    division: row.division,
    dept: row.dept,
    status_mp: row.status_mp,
    mp_role: row.mp_role ?? "Proses",
    qty: row.qty,
    fulfill_date: row.date,
  };
}

function fromNeedRow(row: ProjectMpNeedRow): CompositionRow {
  return {
    id: row.id,
    division: row.division,
    dept: row.dept,
    status_mp: row.status_mp,
    mp_role: row.mp_role,
    qty: row.qty,
    date: row.fulfill_date,
  };
}

/**
 * Note: this component is expected to be conditionally *mounted* by its
 * parent (e.g. `{modalOpen && <NewProjectModal ... />}`) rather than kept
 * mounted with `open` toggling — that way a fresh mount naturally resets all
 * form state via the lazy useState initializers below, no reset effect needed.
 */
export function NewProjectModal({ open, onClose, project }: { open: boolean; onClose: () => void; project?: Project }) {
  const isEdit = !!project;

  const [name, setName] = useState(project?.name ?? "");
  const [startDate, setStartDate] = useState(project?.start_date ?? "");
  const [endDate, setEndDate] = useState(project?.end_date ?? "");
  const [rows, setRows] = useState<CompositionRow[]>(
    project ? project.rows.map(fromNeedRow) : [emptyCompositionRow()]
  );
  const [step, setStep] = useState<"form" | "preview">("form");

  // Rows that already existed when the project loaded can only have their
  // qty increased — every other field is locked (see CompositionRowsEditor)
  // so demand records that may already be Fulfilled never get reshuffled.
  const originalQtyById = new Map((project?.rows ?? []).map((r) => [r.id, r.qty]));
  const isRowLocked = (row: CompositionRow) => originalQtyById.has(row.id);
  const minQtyFor = (row: CompositionRow) => originalQtyById.get(row.id) ?? 1;

  function validRows() {
    return rows.filter((r) => r.division && r.dept && r.qty > 0);
  }

  function goToPreview() {
    if (!name || !startDate || !endDate) return;
    if (validRows().length === 0) return;
    setStep("preview");
  }

  function register() {
    createProject({ name, start_date: startDate, end_date: endDate, rows: validRows().map(toNeedRow) });
    onClose();
  }

  function saveEdits() {
    if (!project) return;
    updateProjectDetails(project.id, { name, start_date: startDate, end_date: endDate });
    for (const row of rows) {
      const originalQty = originalQtyById.get(row.id);
      if (originalQty === undefined) {
        if (row.division && row.dept && row.qty > 0) addProjectRow(project.id, toNeedRow(row));
      } else if (row.qty > originalQty) {
        increaseProjectRowQty(project.id, row.id, row.qty);
      }
    }
    onClose();
  }

  const title = isEdit ? `Edit Project: ${project!.name}` : step === "preview" ? "Preview Project" : "+ New Project";

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-5xl">
      {step === "form" || isEdit ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Nama Project">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Tanggal Mulai">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Tanggal Selesai">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold text-slate-500">Kebutuhan MP</h4>
            <CompositionRowsEditor
              rows={rows}
              onChange={setRows}
              dateLabel="Tanggal Pemenuhan"
              withRole
              isRowLocked={isRowLocked}
              minQtyFor={minQtyFor}
            />
            {isEdit && (
              <p className="mt-2 text-xs text-slate-400">
                Baris yang sudah terdaftar hanya bisa ditambah qty-nya (tidak bisa dikurangi/dihapus) agar data demand yang sudah fulfilled tidak hilang.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button variant="primary" onClick={isEdit ? saveEdits : goToPreview}>
              {isEdit ? "Simpan Perubahan" : "Preview"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{name}</h3>
              <Badge tone="blue">Ongoing</Badge>
            </div>
            <div className="text-xs text-slate-500">
              {fmtDate(startDate)} - {fmtDate(endDate)}
            </div>
          </div>

          <TableWrap>
            <thead>
              <tr>
                <Th>Divisi</Th>
                <Th>Department</Th>
                <Th>Status MP</Th>
                <Th>MP Role</Th>
                <Th>Qty</Th>
                <Th>Tanggal Pemenuhan</Th>
              </tr>
            </thead>
            <tbody>
              {validRows().map((r, i) => (
                <tr key={i}>
                  <Td>{r.division}</Td>
                  <Td>{r.dept}</Td>
                  <Td>{r.status_mp}</Td>
                  <Td>{r.mp_role}</Td>
                  <Td>{r.qty}</Td>
                  <Td>{fmtDate(r.date)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <p className="text-xs text-slate-400">
            Total kebutuhan: {validRows().reduce((sum, r) => sum + r.qty, 0)} orang. Periksa dulu sebelum register, demand akan langsung dibuat begitu di-register.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setStep("form")}>
              ← Edit
            </Button>
            <Button variant="primary" onClick={register}>
              Register Project
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
