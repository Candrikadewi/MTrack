"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TableWrap, Th, Td } from "@/components/ui/Table";
import { X } from "lucide-react";
import { addProjectRow, createProject, increaseProjectRowQty, updateProjectDetails } from "@/lib/engine/actions";
import { zparStore } from "@/lib/repo";
import { useStoreList } from "@/lib/useStore";
import { divisionsOfAny, deptsOfAny } from "@/lib/engine/dashboard";
import { fmtDate } from "@/lib/engine/compute";
import type { MpRole, MpStatusKategori, Project } from "@/lib/types";

interface EditableRow {
  id: string; // "" for a not-yet-saved new row
  division: string;
  dept: string;
  status_mp: MpStatusKategori;
  mp_role: MpRole;
  qty: number;
  fulfill_date: string;
  originalQty?: number; // set only for rows that already existed on the project
}

const emptyRow = (): EditableRow => ({
  id: "",
  division: "",
  dept: "",
  status_mp: "Vokasi",
  mp_role: "Proses",
  qty: 1,
  fulfill_date: "",
});

/**
 * Note: this component is expected to be conditionally *mounted* by its
 * parent (e.g. `{modalOpen && <NewProjectModal ... />}`) rather than kept
 * mounted with `open` toggling — that way a fresh mount naturally resets all
 * form state via the lazy useState initializers below, no reset effect needed.
 */
export function NewProjectModal({ open, onClose, project }: { open: boolean; onClose: () => void; project?: Project }) {
  const isEdit = !!project;
  const snapshots = useStoreList(zparStore);
  const employees = snapshots.find((s) => s.is_active)?.employees ?? [];
  // ZPAR data hydrates async on the client; while it's still loading (or if
  // no snapshot has ever been uploaded) the Divisi/Department selects would
  // otherwise silently show no options — surface that explicitly instead.
  const employeesLoading = !zparStore.ready();

  const [name, setName] = useState(project?.name ?? "");
  const [startDate, setStartDate] = useState(project?.start_date ?? "");
  const [endDate, setEndDate] = useState(project?.end_date ?? "");
  const [rows, setRows] = useState<EditableRow[]>(
    project ? project.rows.map((r) => ({ ...r, originalQty: r.qty })) : [emptyRow()]
  );
  const [step, setStep] = useState<"form" | "preview">("form");

  function updateRow(idx: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function validRows() {
    return rows.filter((r) => r.division && r.dept && r.qty > 0);
  }

  function goToPreview() {
    if (!name || !startDate || !endDate) return;
    if (validRows().length === 0) return;
    setStep("preview");
  }

  function register() {
    createProject({ name, start_date: startDate, end_date: endDate, rows: validRows() });
    onClose();
  }

  function saveEdits() {
    if (!project) return;
    updateProjectDetails(project.id, { name, start_date: startDate, end_date: endDate });
    for (const row of rows) {
      if (row.originalQty === undefined) {
        if (row.division && row.dept && row.qty > 0) {
          addProjectRow(project.id, {
            division: row.division,
            dept: row.dept,
            status_mp: row.status_mp,
            mp_role: row.mp_role,
            qty: row.qty,
            fulfill_date: row.fulfill_date,
          });
        }
      } else if (row.qty > row.originalQty) {
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
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-500">Kebutuhan MP</h4>
              <Button size="sm" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
                + Baris
              </Button>
            </div>
            <div className="space-y-2">
              {rows.map((row, idx) => {
                const locked = row.originalQty !== undefined; // existing row in edit mode
                const divisionOptions = divisionsOfAny(employees, []);
                const deptOptions = deptsOfAny(employees, row.division ? [row.division] : []);
                return (
                  <div
                    key={idx}
                    className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 p-2 dark:border-slate-800"
                  >
                    <div className="min-w-[150px] flex-1">
                      <span className="mb-1 block text-[11px] font-medium text-slate-500">Divisi</span>
                      <Select
                        value={row.division}
                        disabled={locked || employeesLoading}
                        onChange={(e) => updateRow(idx, { division: e.target.value, dept: "" })}
                      >
                        <option value="">{employeesLoading ? "Memuat data..." : "Pilih Divisi"}</option>
                        {divisionOptions.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="min-w-[150px] flex-1">
                      <span className="mb-1 block text-[11px] font-medium text-slate-500">Department</span>
                      <Select
                        value={row.dept}
                        disabled={locked || !row.division}
                        onChange={(e) => updateRow(idx, { dept: e.target.value })}
                      >
                        <option value="">Pilih Department</option>
                        {deptOptions.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="w-32">
                      <span className="mb-1 block text-[11px] font-medium text-slate-500">Status MP</span>
                      <Select
                        value={row.status_mp}
                        disabled={locked}
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
                        disabled={locked}
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
                        min={row.originalQty ?? 1}
                        className="text-center text-base font-semibold"
                        value={row.qty}
                        onChange={(e) => updateRow(idx, { qty: Number(e.target.value) })}
                      />
                    </div>
                    <div className="min-w-[160px]">
                      <span className="mb-1 block text-[11px] font-medium text-slate-500">Tanggal Pemenuhan</span>
                      <Input
                        type="date"
                        disabled={locked}
                        value={row.fulfill_date}
                        onChange={(e) => updateRow(idx, { fulfill_date: e.target.value })}
                      />
                    </div>
                    {!locked && rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="mb-1.5 rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                        aria-label="Hapus baris"
                      >
                        <X size={16} />
                      </button>
                    )}
                    {locked && (
                      <span className="mb-2 text-[11px] text-slate-400">qty awal: {row.originalQty}</span>
                    )}
                  </div>
                );
              })}
            </div>
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
                  <Td>{fmtDate(r.fulfill_date)}</Td>
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
