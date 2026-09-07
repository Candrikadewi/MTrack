"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FullWidthTabs } from "@/components/ui/Tabs";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { TableWrap, Th, Td, EmptyState } from "@/components/ui/Table";
import { getActiveSnapshot, vokasiStore } from "@/lib/repo";
import { createTaktDown, updateTaktDown, taktDownRoleOf } from "@/lib/engine/actions";
import type { MpStatusKategori, Plant, TaktCase, TaktDownPerson, TaktDownPlanRow, TaktDownRole, UtilPoolEntry } from "@/lib/types";

interface Candidate {
  noreg: string;
  nama: string;
  div: string;
  dept: string;
  type: MpStatusKategori;
  role: TaktDownRole;
}

type DraftPlanRow = Omit<TaktDownPlanRow, "id"> & { id: string };

const emptyPlanRow = (): DraftPlanRow => ({
  id: crypto.randomUUID(),
  division: "",
  dept: "",
  status_mp: "PKWT",
  role: "Team Member",
  qty: 1,
});

/** Legacy cases created before plan_rows existed have no plan — synthesize
 * a starting plan from the actual released persons instead of handing the
 * editor an empty table. */
function planRowsFromPersons(persons: TaktDownPerson[]): DraftPlanRow[] {
  const groups = new Map<string, DraftPlanRow>();
  for (const p of persons) {
    const key = `${p.div}|${p.dept}|${p.type}|${p.role}`;
    const existing = groups.get(key);
    if (existing) existing.qty += 1;
    else groups.set(key, { id: crypto.randomUUID(), division: p.div, dept: p.dept, status_mp: p.type, role: p.role, qty: 1 });
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
  const [planRows, setPlanRows] = useState<DraftPlanRow[]>(() => {
    if (!editing) return [emptyPlanRow()];
    const rows = editing.plan_rows?.length ? editing.plan_rows : planRowsFromPersons(editing.released_persons ?? []);
    return rows.length ? rows.map((r) => ({ ...r })) : [emptyPlanRow()];
  });
  const [mode, setMode] = useState<"checklist" | "cari" | "bulk">("checklist");
  const [selected, setSelected] = useState<TaktDownPerson[]>(() => (editing?.released_persons ?? []).map((p) => ({ ...p })));

  const [query, setQuery] = useState("");
  const [filterDivs, setFilterDivs] = useState<string[]>([]);
  const [filterDepts, setFilterDepts] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<MpStatusKategori | "">("");
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState<{ added: number; notFound: string[] } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  function updatePlanRow(id: string, patch: Partial<DraftPlanRow>) {
    setPlanRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removePlanRow(id: string) {
    setPlanRows((prev) => prev.filter((r) => r.id !== id));
  }

  function loadCandidates(): Candidate[] {
    const snap = getActiveSnapshot();
    const fromEmployees: Candidate[] = (snap?.employees ?? []).map((e) => ({
      noreg: e.noreg,
      nama: e.nama,
      div: e.division,
      dept: e.dept,
      type: e.status_kontrak === "Permanen" ? "Permanen" : e.status_kontrak === "AKTI" ? "AKTI" : "PKWT",
      role: taktDownRoleOf(e.posisi_struktural),
    }));
    // VokasiRecord carries no posisi_struktural — apprentices default to
    // Team Member, the level Vokasi placements are actually at.
    const fromVokasi: Candidate[] = vokasiStore.list().map((v) => ({
      noreg: v.noreg,
      nama: v.nama,
      div: v.div,
      dept: v.dept,
      type: "Vokasi",
      role: "Team Member",
    }));
    return [...fromEmployees, ...fromVokasi];
  }

  const candidates = loadCandidates();
  const selectedNoregs = new Set(selected.map((s) => s.noreg));
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

  function addCandidates(cands: Candidate[]) {
    setSelected((prev) => {
      const existing = new Set(prev.map((s) => s.noreg));
      const toAdd = cands.filter((c) => !existing.has(c.noreg));
      return [...prev, ...toAdd];
    });
  }

  function removeCandidate(noreg: string) {
    if (!isRemovable(noreg)) return;
    setSelected((prev) => prev.filter((s) => s.noreg !== noreg));
  }

  const searchFiltered = query
    ? candidates.filter(
        (c) => c.noreg.toLowerCase().includes(query.toLowerCase()) || c.nama.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const divOptions = Array.from(new Set(candidates.map((c) => c.div).filter(Boolean))).sort();
  const deptOptions = Array.from(
    new Set(
      candidates.filter((c) => filterDivs.length === 0 || filterDivs.includes(c.div)).map((c) => c.dept).filter(Boolean)
    )
  ).sort();
  const checklistFiltered = candidates.filter(
    (c) =>
      (filterDivs.length === 0 || filterDivs.includes(c.div)) &&
      (filterDepts.length === 0 || filterDepts.includes(c.dept)) &&
      (filterType === "" || c.type === filterType)
  );
  const allFilteredSelected = checklistFiltered.length > 0 && checklistFiltered.every((c) => selectedNoregs.has(c.noreg));

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      const toRemove = new Set(checklistFiltered.map((c) => c.noreg).filter((n) => isRemovable(n)));
      setSelected((prev) => prev.filter((s) => !toRemove.has(s.noreg)));
    } else {
      addCandidates(checklistFiltered);
    }
  }

  function processBulkNoregs(raw: string) {
    const noregs = Array.from(new Set(raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)));
    const byNoreg = new Map(candidates.map((c) => [c.noreg.toLowerCase(), c]));
    const matched: Candidate[] = [];
    const notFound: string[] = [];
    for (const n of noregs) {
      const c = byNoreg.get(n.toLowerCase());
      if (c) matched.push(c);
      else notFound.push(n);
    }
    addCandidates(matched);
    setBulkResult({ added: matched.length, notFound });
  }

  async function handleBulkFile(file: File) {
    setBulkBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const noregKeyCandidates = ["noreg", "no reg", "nik", "employee id", "emp id", "id"];
      const values = rows.map((row) => {
        const keys = Object.keys(row);
        const key = keys.find((k) => noregKeyCandidates.includes(k.trim().toLowerCase())) ?? keys[0];
        return key ? String(row[key]) : "";
      });
      processBulkNoregs(values.join("\n"));
    } finally {
      setBulkBusy(false);
    }
  }

  function submit() {
    if (selected.length === 0) return;
    const validRows = planRows.filter((r) => r.division && r.dept && r.qty > 0);
    if (isEditing && editing) {
      updateTaktDown(editing.id, {
        plant,
        date,
        takt_before: taktBefore,
        takt_after: taktAfter,
        plan_rows: validRows,
        released_persons: selected,
      });
    } else {
      createTaktDown({
        plant,
        date,
        takt_before: taktBefore,
        takt_after: taktAfter,
        plan_rows: validRows.map((r) => ({ division: r.division, dept: r.dept, status_mp: r.status_mp, role: r.role, qty: r.qty })),
        released_persons: selected,
      });
    }
    onClose();
  }

  // Progress per plan row — informational, not enforced, so mapping can
  // proceed even when the exact composition still needs adjusting.
  function progressFor(row: DraftPlanRow): number {
    return selected.filter(
      (s) => s.div === row.division && s.dept === row.dept && s.type === row.status_mp && s.role === row.role
    ).length;
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
          <Field label="Takt Before (menit)">
            <Input type="number" step="0.01" value={taktBefore} onChange={(e) => setTaktBefore(Number(e.target.value))} />
          </Field>
          <Field label="Takt After (menit)">
            <Input type="number" step="0.01" value={taktAfter} onChange={(e) => setTaktAfter(Number(e.target.value))} />
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <StepDot active={step === "plan"} done={step === "names"} label="1. Rencana per Shop" onClick={() => setStep("plan")} />
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          <StepDot active={step === "names"} done={false} label="2. Mapping Name-by-Name" onClick={() => setStep("names")} />
        </div>

        {step === "plan" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Satu perubahan takt time biasanya berdampak ke beberapa shop sekaligus, dengan komposisi status MP
              (Permanen/Vokasi/Kontrak) dan Team Member/Leader yang berbeda-beda. Tentukan rencana per shop dulu di sini,
              baru pilih orangnya di langkah berikutnya.
            </p>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-500">Rencana Rilis per Shop</h4>
              <Button size="sm" onClick={() => setPlanRows((prev) => [...prev, emptyPlanRow()])}>
                + Baris
              </Button>
            </div>
            <div className="space-y-2">
              {planRows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 p-2 dark:border-slate-800"
                >
                  <div className="min-w-[150px] flex-1">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500">Divisi</span>
                    <Input value={row.division} onChange={(e) => updatePlanRow(row.id, { division: e.target.value })} />
                  </div>
                  <div className="min-w-[150px] flex-1">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500">Department</span>
                    <Input value={row.dept} onChange={(e) => updatePlanRow(row.id, { dept: e.target.value })} />
                  </div>
                  <div className="w-32">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500">Status MP</span>
                    <Select
                      value={row.status_mp}
                      onChange={(e) => updatePlanRow(row.id, { status_mp: e.target.value as MpStatusKategori })}
                    >
                      <option value="Vokasi">Vokasi</option>
                      <option value="PKWT">PKWT</option>
                      <option value="Permanen">Permanen</option>
                      <option value="AKTI">AKTI</option>
                    </Select>
                  </div>
                  <div className="w-36">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500">Role</span>
                    <Select value={row.role} onChange={(e) => updatePlanRow(row.id, { role: e.target.value as TaktDownRole })}>
                      <option value="Team Member">Team Member</option>
                      <option value="Leader">Leader</option>
                    </Select>
                  </div>
                  <div className="w-24">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500">Jumlah</span>
                    <Input
                      type="number"
                      min={1}
                      className="text-center text-base font-semibold"
                      value={row.qty}
                      onChange={(e) => updatePlanRow(row.id, { qty: Number(e.target.value) })}
                    />
                  </div>
                  {planRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePlanRow(row.id)}
                      className="mb-1.5 rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                      aria-label="Hapus baris"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={() => setStep("names")}>
                Lanjut ke Mapping Name-by-Name →
              </Button>
            </div>
          </div>
        )}

        {step === "names" && (
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-xs font-semibold text-slate-500">Progres Rencana per Shop</h4>
              <div className="flex flex-wrap gap-2">
                {planRows
                  .filter((r) => r.division && r.dept && r.qty > 0)
                  .map((row) => {
                    const done = progressFor(row);
                    return (
                      <span
                        key={row.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      >
                        {row.division} · {row.dept} · {row.status_mp} · {row.role}
                        <Badge tone={done >= row.qty ? "green" : "amber"}>
                          {done}/{row.qty}
                        </Badge>
                      </span>
                    );
                  })}
              </div>
            </div>

            <FullWidthTabs
              tabs={[
                { key: "checklist", label: "Checklist Tabel" },
                { key: "bulk", label: "Paste / Upload Noreg" },
                { key: "cari", label: "Cari Manual" },
              ]}
              active={mode}
              onChange={(k) => setMode(k as typeof mode)}
            />

            {mode === "checklist" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <MultiSelect
                    label="Divisi"
                    options={divOptions}
                    selected={filterDivs}
                    onChange={(v) => {
                      setFilterDivs(v);
                      setFilterDepts([]);
                    }}
                    placeholder="Semua Divisi"
                    className="w-52"
                  />
                  <MultiSelect
                    label="Department"
                    options={deptOptions}
                    selected={filterDepts}
                    onChange={setFilterDepts}
                    placeholder="Semua Department"
                    className="w-52"
                  />
                  <div className="w-40">
                    <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Status MP</span>
                    <Select value={filterType} onChange={(e) => setFilterType(e.target.value as MpStatusKategori | "")}>
                      <option value="">Semua</option>
                      <option value="Vokasi">Vokasi</option>
                      <option value="PKWT">PKWT</option>
                      <option value="Permanen">Permanen</option>
                      <option value="AKTI">AKTI</option>
                    </Select>
                  </div>
                </div>

                {checklistFiltered.length === 0 ? (
                  <EmptyState text="Tidak ada kandidat sesuai filter." />
                ) : (
                  <TableWrap maxHeightClass="max-h-[320px]">
                    <thead>
                      <tr>
                        <Th>
                          <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} />
                        </Th>
                        <Th>Noreg</Th>
                        <Th>Nama</Th>
                        <Th>Divisi</Th>
                        <Th>Department</Th>
                        <Th>Status MP</Th>
                        <Th>Role</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {checklistFiltered.map((c) => (
                        <tr key={c.noreg}>
                          <Td>
                            <input
                              type="checkbox"
                              checked={selectedNoregs.has(c.noreg)}
                              disabled={selectedNoregs.has(c.noreg) && !isRemovable(c.noreg)}
                              onChange={() => (selectedNoregs.has(c.noreg) ? removeCandidate(c.noreg) : addCandidates([c]))}
                            />
                          </Td>
                          <Td>{c.noreg}</Td>
                          <Td>{c.nama}</Td>
                          <Td>{c.div}</Td>
                          <Td>{c.dept}</Td>
                          <Td>{c.type}</Td>
                          <Td>{c.role}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
                <p className="text-xs text-slate-400">
                  {checklistFiltered.length} kandidat sesuai filter · centang untuk menambah/menghapus dari daftar lepas.
                </p>
              </div>
            )}

            {mode === "bulk" && (
              <div className="space-y-3">
                <Field label="Paste daftar noreg (satu per baris, atau pisah koma)">
                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    rows={6}
                    placeholder={"EMP0001\nEMP0002\nEMP0003\n..."}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" size="sm" disabled={!bulkText.trim()} onClick={() => processBulkNoregs(bulkText)}>
                    Proses Daftar
                  </Button>
                  <span className="text-xs text-slate-400">atau</span>
                  <label className="cursor-pointer text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                    Upload file Excel/CSV (kolom noreg)
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleBulkFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {bulkBusy && <span className="text-xs text-slate-400">Memproses...</span>}
                </div>
                {bulkResult && (
                  <div className="rounded-lg border border-slate-100 p-3 text-xs dark:border-slate-800">
                    <p className="text-emerald-600 dark:text-emerald-400">{bulkResult.added} noreg berhasil ditambahkan.</p>
                    {bulkResult.notFound.length > 0 && (
                      <p className="mt-1 text-amber-600 dark:text-amber-400">
                        {bulkResult.notFound.length} tidak ditemukan di data ZPAR/Vokasi aktif: {bulkResult.notFound.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {mode === "cari" && (
              <div className="space-y-2">
                <Field label="Cari Personil (noreg / nama)">
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ketik untuk mencari..." />
                </Field>
                {searchFiltered.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    {searchFiltered.slice(0, 20).map((c) => (
                      <button
                        key={c.noreg}
                        onClick={() => {
                          addCandidates([c]);
                          setQuery("");
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span>
                          {c.noreg} - {c.nama} <span className="text-slate-400">({c.dept})</span>
                        </span>
                        <span className="text-xs text-slate-400">
                          {c.type} · {c.role}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <h4 className="mb-2 text-xs font-semibold text-slate-500">Personil Terpilih ({selected.length})</h4>
              {selected.length === 0 ? (
                <p className="text-sm text-slate-400">Belum ada personil dipilih.</p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {selected.map((s) => {
                    const removable = isRemovable(s.noreg);
                    return (
                      <li
                        key={s.noreg}
                        className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-sm dark:border-slate-800"
                      >
                        <span>
                          {s.noreg} - {s.nama} ({s.type}, {s.role}, {s.dept})
                        </span>
                        {removable ? (
                          <button onClick={() => removeCandidate(s.noreg)} className="text-red-500 hover:text-red-700">
                            Hapus
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400" title="Sudah diutilisasi di Supply Pool, tidak bisa dihapus dari sini">
                            Sudah diutilisasi
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

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

function StepDot({ active, done, label, onClick }: { active: boolean; done: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : done
            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
            : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
      }`}
    >
      {label}
    </button>
  );
}
