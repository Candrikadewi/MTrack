"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { FullWidthTabs } from "@/components/ui/Tabs";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { TableWrap, Th, Td, EmptyState } from "@/components/ui/Table";
import { getActiveSnapshot, vokasiStore } from "@/lib/repo";
import { createTaktDown } from "@/lib/engine/actions";
import type { MpStatusKategori, Plant } from "@/lib/types";

interface Candidate {
  noreg: string;
  nama: string;
  div: string;
  dept: string;
  type: MpStatusKategori;
}

export function TaktDownModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [plant, setPlant] = useState<Plant>("Plant 1");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [taktBefore, setTaktBefore] = useState(0);
  const [taktAfter, setTaktAfter] = useState(0);
  const [mode, setMode] = useState<"checklist" | "cari" | "bulk">("checklist");
  const [selected, setSelected] = useState<Candidate[]>([]);

  // Mode: cari manual (quick single add)
  const [query, setQuery] = useState("");

  // Mode: checklist
  const [filterDivs, setFilterDivs] = useState<string[]>([]);
  const [filterDepts, setFilterDepts] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<MpStatusKategori | "">("");

  // Mode: bulk paste/upload
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState<{ added: number; notFound: string[] } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  function loadCandidates(): Candidate[] {
    const snap = getActiveSnapshot();
    const fromEmployees: Candidate[] = (snap?.employees ?? []).map((e) => ({
      noreg: e.noreg,
      nama: e.nama,
      div: e.division,
      dept: e.dept,
      type: e.status_kontrak === "Permanen" ? "Permanen" : e.status_kontrak === "AKTI" ? "AKTI" : "PKWT",
    }));
    const fromVokasi: Candidate[] = vokasiStore.list().map((v) => ({
      noreg: v.noreg,
      nama: v.nama,
      div: v.div,
      dept: v.dept,
      type: "Vokasi",
    }));
    return [...fromEmployees, ...fromVokasi];
  }

  const candidates = open ? loadCandidates() : [];
  const selectedNoregs = new Set(selected.map((s) => s.noreg));

  function addCandidates(cands: Candidate[]) {
    setSelected((prev) => {
      const existing = new Set(prev.map((s) => s.noreg));
      const toAdd = cands.filter((c) => !existing.has(c.noreg));
      return [...prev, ...toAdd];
    });
  }

  function removeCandidate(noreg: string) {
    setSelected((prev) => prev.filter((s) => s.noreg !== noreg));
  }

  // --- Cari manual ---
  const searchFiltered = query
    ? candidates.filter(
        (c) => c.noreg.toLowerCase().includes(query.toLowerCase()) || c.nama.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  // --- Checklist ---
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
      const toRemove = new Set(checklistFiltered.map((c) => c.noreg));
      setSelected((prev) => prev.filter((s) => !toRemove.has(s.noreg)));
    } else {
      addCandidates(checklistFiltered);
    }
  }

  // --- Bulk paste/upload ---
  function processBulkNoregs(raw: string) {
    const noregs = Array.from(
      new Set(
        raw
          .split(/[\n,;]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
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

  function reset() {
    setSelected([]);
    setQuery("");
    setTaktBefore(0);
    setTaktAfter(0);
    setBulkText("");
    setBulkResult(null);
    setFilterDivs([]);
    setFilterDepts([]);
    setFilterType("");
  }

  function submit() {
    if (selected.length === 0) return;
    createTaktDown({
      plant,
      date,
      takt_before: taktBefore,
      takt_after: taktAfter,
      released_persons: selected.map((s) => ({ noreg: s.noreg, nama: s.nama, type: s.type, div: s.div, dept: s.dept })),
    });
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Takt Down: Lepas Personil" width="max-w-5xl">
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
                    <Th>Type</Th>
                  </tr>
                </thead>
                <tbody>
                  {checklistFiltered.map((c) => (
                    <tr key={c.noreg}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={selectedNoregs.has(c.noreg)}
                          onChange={() => (selectedNoregs.has(c.noreg) ? removeCandidate(c.noreg) : addCandidates([c]))}
                        />
                      </Td>
                      <Td>{c.noreg}</Td>
                      <Td>{c.nama}</Td>
                      <Td>{c.div}</Td>
                      <Td>{c.dept}</Td>
                      <Td>{c.type}</Td>
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
                    <span className="text-xs text-slate-400">{c.type}</span>
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
              {selected.map((s) => (
                <li
                  key={s.noreg}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-sm dark:border-slate-800"
                >
                  <span>
                    {s.noreg} - {s.nama} ({s.type}, {s.dept})
                  </span>
                  <button onClick={() => removeCandidate(s.noreg)} className="text-red-500 hover:text-red-700">
                    Hapus
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" onClick={submit} disabled={selected.length === 0}>
            Simpan Takt Down ({selected.length} orang)
          </Button>
        </div>
      </div>
    </Modal>
  );
}
