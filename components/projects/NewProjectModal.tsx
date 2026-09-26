"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TableWrap, Th, Td } from "@/components/ui/Table";
import { CompositionRowsEditor, emptyCompositionRow, type CompositionRow } from "@/components/takt/CompositionRowsEditor";
import { createProject, demandIdsByRow, lockedDemandCount, updateProject } from "@/lib/engine/actions";
import { pushToast } from "@/lib/toast";
import { fmtDate, projectFillCount } from "@/lib/engine/compute";
import { CONTRACT_MONTHS, mpRoleLabel, rowReleaseDate, type Project, type ProjectMpNeedRow } from "@/lib/types";

function toNeedRow(row: CompositionRow): Omit<ProjectMpNeedRow, "id"> {
  return {
    division: row.division,
    dept: row.dept,
    status_mp: row.status_mp,
    mp_role: row.mp_role ?? "Project",
    qty: row.qty,
    fulfill_date: row.date,
    release_date: row.noRelease ? "" : (row.releaseDate ?? ""),
    no_release: Boolean(row.noRelease),
  };
}

function fromNeedRow(row: ProjectMpNeedRow, project: Project): CompositionRow {
  const release = rowReleaseDate(row, project);
  return {
    id: row.id,
    division: row.division,
    dept: row.dept,
    status_mp: row.status_mp,
    mp_role: row.mp_role,
    qty: row.qty,
    date: row.fulfill_date,
    releaseDate: release ?? "",
    noRelease: release === null,
  };
}

/** New rows start as MP Project, which is released on a date. */
function newProjectRow(patch: Partial<CompositionRow> = {}): CompositionRow {
  return emptyCompositionRow({ mp_role: "Project", noRelease: false, releaseDate: "", ...patch });
}

/** "2x · tiap 6 bln · 6 orang" — how many times one seat of this row is
 * filled between its fulfilment and release (see projectFillCount), and the
 * total people across its qty. No Release rows keep going as regular
 * enrollment. */
function fillLabel(row: CompositionRow): string {
  if (row.noRelease) return "Terus · reguler";
  const count = projectFillCount(row.status_mp, row.date, row.releaseDate ?? "");
  if (count === null) return row.status_mp === "Permanen" ? "1x (tanpa kontrak)" : "—";
  return `${count}x · tiap ${CONTRACT_MONTHS[row.status_mp]} bln${row.qty > 1 ? ` · ${count * row.qty} orang` : ""}`;
}

function rowProblem(row: CompositionRow): string | null {
  if (!row.date) return "Tanggal Pemenuhan belum diisi";
  if (row.noRelease) return null;
  if (!row.releaseDate) return "Tanggal Release belum diisi (atau centang No Release)";
  if (row.releaseDate <= row.date) return "Tanggal Release harus setelah Tanggal Pemenuhan";
  return null;
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
  const [sopDate, setSopDate] = useState(project?.start_date ?? "");
  const [rows, setRows] = useState<CompositionRow[]>(
    project ? project.rows.map((r) => fromNeedRow(r, project)) : [newProjectRow()]
  );
  const [step, setStep] = useState<"form" | "preview">("form");
  const [showErrors, setShowErrors] = useState(false);

  // Every row stays editable and removable until one of its demands is in
  // progress (a candidate mapped, verified or received). From then on its
  // qty can't go below the demands in progress, and its division / dept /
  // status are fixed so that history never gets reshuffled. A release that
  // already happened is fixed too.
  const originalById = new Map((project?.rows ?? []).map((r) => [r.id, r]));
  const idsByRow = project ? demandIdsByRow(project.rows, project.demand_ids) : new Map<string, string[]>();
  const lockedFor = (row: CompositionRow) => lockedDemandCount(idsByRow.get(row.id) ?? []);
  const isRowLocked = (row: CompositionRow) => lockedFor(row) > 0;
  const isReleaseLocked = (row: CompositionRow) => Boolean(originalById.get(row.id)?.released);
  const minQtyFor = (row: CompositionRow) => Math.max(1, lockedFor(row));

  const validRows = rows.filter((r) => r.division && r.dept && r.qty > 0);
  const problems = validRows
    .map((r) => ({ row: r, problem: rowProblem(r) }))
    .filter((p): p is { row: CompositionRow; problem: string } => p.problem !== null);
  const headerMissing = !name.trim() || !sopDate;
  const blocked = headerMissing || validRows.length === 0 || problems.length > 0;

  function goToPreview() {
    setShowErrors(true);
    if (!blocked) setStep("preview");
  }

  function register() {
    createProject({ name: name.trim(), sop_date: sopDate, rows: validRows.map(toNeedRow) });
    onClose();
  }

  function saveEdits() {
    if (!project) return;
    setShowErrors(true);
    if (blocked) return;
    const error = updateProject(project.id, {
      name: name.trim(),
      sop_date: sopDate,
      rows: validRows.map((r) => ({ ...toNeedRow(r), ...(originalById.has(r.id) ? { id: r.id } : {}) })),
    });
    if (error) {
      pushToast(error);
      return;
    }
    pushToast(`Project ${name.trim()} diperbarui.`, "success");
    onClose();
  }

  const title = isEdit ? `Edit Project: ${project!.name}` : step === "preview" ? "Preview Project" : "+ New Project";

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-6xl">
      {step === "form" || isEdit ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label="Nama Projek">
              <Input value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
            </Field>
            <Field label="Tanggal SOP">
              <Input type="date" value={sopDate} onChange={(e) => setSopDate(e.target.value)} />
            </Field>
          </div>

          <div>
            <h4 className="mb-1 text-xs font-semibold text-slate-500">Komposisi MP</h4>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              Tiap baris punya tanggal release sendiri. Pada tanggal itu, MP yang kontraknya masih ada masuk Supply Pool sebagai
              MP Excess, dan kontrak yang habis setelahnya tidak diganti. Centang <b className="font-semibold">No Release</b> bila
              MP tetap di shop: kebutuhannya terus dipenuhi seperti regular enrollment. MP Setting otomatis No Release.
            </p>
            <CompositionRowsEditor
              rows={rows}
              onChange={setRows}
              dateLabel="Tanggal Pemenuhan"
              withRole
              withRelease
              isRowLocked={isRowLocked}
              isReleaseLocked={isReleaseLocked}
              minQtyFor={minQtyFor}
            />
            {isEdit && (
              <p className="mt-2 text-xs text-slate-500">
                Semua baris bisa diubah atau dihapus. Baris yang sudah punya kandidat atau pemenuhan hanya bisa diubah qty (tidak
                kurang dari yang sudah berjalan) dan tanggal release-nya (sebelum rilis terjadi), supaya riwayatnya tidak hilang.
              </p>
            )}
          </div>

          {showErrors && (headerMissing || validRows.length === 0 || problems.length > 0) && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
            >
              <ul className="list-disc space-y-0.5 pl-4">
                {headerMissing && <li>Isi Nama Projek dan Tanggal SOP.</li>}
                {validRows.length === 0 && <li>Tambahkan minimal satu baris MP (divisi, department, qty).</li>}
                {problems.map(({ row, problem }) => (
                  <li key={row.id}>
                    {row.dept} · {row.status_mp}: {problem}
                  </li>
                ))}
              </ul>
            </div>
          )}

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
            <div className="text-xs text-slate-500">SOP {fmtDate(sopDate)}</div>
          </div>

          <TableWrap>
            <thead>
              <tr>
                <Th>Divisi</Th>
                <Th>Department</Th>
                <Th>Status MP</Th>
                <Th>Jenis MP</Th>
                <Th>Qty</Th>
                <Th>Tanggal Pemenuhan</Th>
                <Th>Tanggal Release</Th>
                <Th>Pengisian</Th>
              </tr>
            </thead>
            <tbody>
              {validRows.map((r) => (
                <tr key={r.id}>
                  <Td>{r.division}</Td>
                  <Td>{r.dept}</Td>
                  <Td>{r.status_mp}</Td>
                  <Td>{mpRoleLabel(r.mp_role)}</Td>
                  <Td>{r.qty}</Td>
                  <Td>{fmtDate(r.date)}</Td>
                  <Td>{r.noRelease ? <Badge tone="green">No Release · reguler</Badge> : fmtDate(r.releaseDate)}</Td>
                  <Td className="whitespace-nowrap">{fillLabel(r)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <p className="text-xs text-slate-500">
            Total kebutuhan awal: {validRows.reduce((sum, r) => sum + r.qty, 0)} orang. Demand awal langsung dibuat begitu
            di-register; demand pengganti muncul sendiri saat kontrak pengisinya habis sebelum tanggal release (berlabel nama
            projek).
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
