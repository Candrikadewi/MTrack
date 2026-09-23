"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { Field, Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FullWidthTabs } from "@/components/ui/Tabs";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { TableWrap, Th, Td, EmptyState } from "@/components/ui/Table";
import type { CompositionRow } from "@/components/takt/CompositionRowsEditor";
import { getActiveSnapshot, vokasiStore } from "@/lib/repo";
import { isPermanenForRatio, type MpStatusKategori, type TaktDownPerson } from "@/lib/types";

function loadCandidates(matchesLabor?: (laborType: string) => boolean): TaktDownPerson[] {
  const snap = getActiveSnapshot();
  const keep = (laborType: string) => !matchesLabor || matchesLabor(laborType);
  const fromEmployees: TaktDownPerson[] = (snap?.employees ?? [])
    .filter((e) => keep(e.labor_type))
    .map((e) => ({
      noreg: e.noreg,
      nama: e.nama,
      div: e.division,
      dept: e.dept,
      type: e.status_kontrak === "AKTI" ? "AKTI" : isPermanenForRatio(e.status_kontrak) ? "Permanen" : "PKWT",
    }));
  const fromVokasi: TaktDownPerson[] = vokasiStore
    .list()
    .filter((v) => keep(v.labor_type))
    .map((v) => ({
      noreg: v.noreg,
      nama: v.nama,
      div: v.div,
      dept: v.dept,
      type: "Vokasi",
    }));
  return [...fromEmployees, ...fromVokasi];
}

function matchesRow(p: TaktDownPerson, row: CompositionRow): boolean {
  return p.div === row.division && p.dept === row.dept && p.type === row.status_mp;
}

/** The plan row a picked person counts toward: the row they were picked
 * for, else the first row with the same division/dept/status MP. */
export function resolvePlanRow(p: TaktDownPerson, rows: CompositionRow[]): CompositionRow | undefined {
  return (p.plan_row_id ? rows.find((r) => r.id === p.plan_row_id) : undefined) ?? rows.find((r) => matchesRow(p, r));
}

/** Two-step release flow header shared by Takt Down and Kaizen: step 1 plans
 * the release per shop and status MP, step 2 picks the actual people. */
export function StepNav({
  step,
  onStep,
}: {
  step: "plan" | "names";
  onStep: (step: "plan" | "names") => void;
}) {
  return (
    <nav aria-label="Langkah" className="flex items-center gap-2">
      <StepDot active={step === "plan"} done={step === "names"} label="1. Rencana per Shop" onClick={() => onStep("plan")} />
      <div aria-hidden className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      <StepDot active={step === "names"} done={false} label="2. Mapping Name-by-Name" onClick={() => onStep("names")} />
    </nav>
  );
}

function StepDot({ active, done, label, onClick }: { active: boolean; done: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "step" : undefined}
      className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
        active
          ? "bg-blue-600 text-white"
          : done
            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
      }`}
    >
      {label}
    </button>
  );
}

/** Step 2 of a release (Takt Down / Kaizen): pick the actual people, guided
 * by the per-shop plan from step 1. Progress per plan row is informational,
 * not enforced, so mapping can proceed while the plan is still being
 * adjusted. */
export function ReleaseMappingStep({
  planRows,
  selected,
  onChange,
  isRemovable = () => true,
  lockedLabel = "Sudah diutilisasi",
  laborTypeFilter,
}: {
  planRows: CompositionRow[];
  selected: TaktDownPerson[];
  onChange: (next: TaktDownPerson[] | ((prev: TaktDownPerson[]) => TaktDownPerson[])) => void;
  /** False for someone who can no longer be taken out of the release
   * (e.g. their Supply Pool entry is already backing a demand). */
  isRemovable?: (noreg: string) => boolean;
  lockedLabel?: string;
  /** Only offer candidates whose labor type matches (Kaizen labor group). */
  laborTypeFilter?: (laborType: string) => boolean;
}) {
  const [mode, setMode] = useState<"checklist" | "cari" | "bulk">("checklist");
  const [query, setQuery] = useState("");
  const [filterDivs, setFilterDivs] = useState<string[]>([]);
  const [filterDepts, setFilterDepts] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<MpStatusKategori | "">("");
  const [activePlanRowId, setActivePlanRowId] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState<{ added: number; notFound: string[] } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const candidates = loadCandidates(laborTypeFilter);
  const selectedNoregs = new Set(selected.map((s) => s.noreg));
  const validPlanRows = planRows.filter((r) => r.division && r.dept && r.qty > 0);

  /** Scopes the checklist to exactly one plan row's shop and status. */
  function focusPlanRow(row: CompositionRow) {
    setActivePlanRowId(row.id);
    setMode("checklist");
    setFilterDivs(row.division ? [row.division] : []);
    setFilterDepts(row.dept ? [row.dept] : []);
    setFilterType(row.status_mp);
  }

  function progressFor(row: CompositionRow): number {
    return selected.filter((s) => resolvePlanRow(s, validPlanRows)?.id === row.id).length;
  }

  const activeRow = validPlanRows.find((r) => r.id === activePlanRowId);
  const hasAmbiguousRows = validPlanRows.some((r, i) => validPlanRows.findIndex((o) => o.division === r.division && o.dept === r.dept && o.status_mp === r.status_mp) !== i);

  /** Picks made while a plan row is focused are pinned to that row, so two
   * rows with the same shop and status MP (different activities) stay apart. */
  function addCandidates(cands: TaktDownPerson[]) {
    onChange((prev) => {
      const existing = new Set(prev.map((s) => s.noreg));
      const fresh = cands
        .filter((c) => !existing.has(c.noreg))
        .map((c) => (activeRow && matchesRow(c, activeRow) ? { ...c, plan_row_id: activeRow.id } : c));
      return [...prev, ...fresh];
    });
  }

  function removeCandidate(noreg: string) {
    if (!isRemovable(noreg)) return;
    onChange((prev) => prev.filter((s) => s.noreg !== noreg));
  }

  const searchFiltered = query
    ? candidates.filter((c) => c.noreg.toLowerCase().includes(query.toLowerCase()) || c.nama.toLowerCase().includes(query.toLowerCase()))
    : [];

  const divOptions = Array.from(new Set(candidates.map((c) => c.div).filter(Boolean))).sort();
  const deptOptions = Array.from(
    new Set(candidates.filter((c) => filterDivs.length === 0 || filterDivs.includes(c.div)).map((c) => c.dept).filter(Boolean))
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
      onChange((prev) => prev.filter((s) => !toRemove.has(s.noreg)));
    } else {
      addCandidates(checklistFiltered);
    }
  }

  function processBulkNoregs(raw: string) {
    const noregs = Array.from(new Set(raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)));
    const byNoreg = new Map(candidates.map((c) => [c.noreg.toLowerCase(), c]));
    const matched: TaktDownPerson[] = [];
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

  return (
    <div className="space-y-4">
      {validPlanRows.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-400">Progres rencana per shop — klik untuk isi baris ini</h4>
          {hasAmbiguousRows && (
            <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
              Ada baris dengan divisi, department dan status MP yang sama. Klik barisnya dulu sebelum memilih orang supaya masuk ke baris
              (aktivitas) yang benar.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {validPlanRows.map((row) => {
              const done = progressFor(row);
              const active = activePlanRowId === row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => focusPlanRow(row)}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                    active
                      ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-300"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {row.division} · {row.dept} · {row.status_mp}
                  {row.activity ? ` · ${row.activity}` : ""}
                  <Badge tone={done >= row.qty ? "green" : "amber"}>
                    {done}/{row.qty}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
            <MultiSelect label="Department" options={deptOptions} selected={filterDepts} onChange={setFilterDepts} placeholder="Semua Department" className="w-52" />
            <label className="block w-40">
              <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Status MP</span>
              <Select value={filterType} onChange={(e) => setFilterType(e.target.value as MpStatusKategori | "")}>
                <option value="">Semua</option>
                <option value="Vokasi">Vokasi</option>
                <option value="PKWT">PKWT</option>
                <option value="Permanen">Permanen</option>
                <option value="AKTI">AKTI</option>
              </Select>
            </label>
          </div>

          {checklistFiltered.length === 0 ? (
            <EmptyState text="Tidak ada kandidat sesuai filter." />
          ) : (
            <TableWrap maxHeightClass="max-h-[320px]">
              <thead>
                <tr>
                  <Th>
                    <input
                      type="checkbox"
                      aria-label="Pilih semua kandidat sesuai filter"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                    />
                  </Th>
                  <Th>Noreg</Th>
                  <Th>Nama</Th>
                  <Th>Divisi</Th>
                  <Th>Department</Th>
                  <Th>Status MP</Th>
                </tr>
              </thead>
              <tbody>
                {checklistFiltered.map((c) => (
                  <tr key={c.noreg}>
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${c.nama} (${c.noreg})`}
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
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {checklistFiltered.length} kandidat sesuai filter · centang untuk menambah/menghapus dari daftar rilis.
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
            <span className="text-xs text-slate-500 dark:text-slate-400">atau</span>
            <label className="cursor-pointer text-xs font-medium text-blue-700 hover:underline dark:text-blue-400">
              Upload file Excel/CSV (kolom noreg)
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleBulkFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            {bulkBusy && <span className="text-xs text-slate-500 dark:text-slate-400">Memproses...</span>}
          </div>
          {bulkResult && (
            <div role="status" className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
              <p className="text-emerald-700 dark:text-emerald-400">{bulkResult.added} noreg berhasil ditambahkan.</p>
              {bulkResult.notFound.length > 0 && (
                <p className="mt-1 text-amber-700 dark:text-amber-400">
                  {bulkResult.notFound.length} tidak ditemukan di data ZPAR/Vokasi aktif
                  {laborTypeFilter ? " atau di luar labor type yang dipilih" : ""}: {bulkResult.notFound.join(", ")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {mode === "cari" && (
        <div className="space-y-2">
          <Field label="Cari personil (noreg / nama)">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ketik untuk mencari..." />
          </Field>
          {searchFiltered.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
              {searchFiltered.slice(0, 20).map((c) => (
                <button
                  key={c.noreg}
                  type="button"
                  onClick={() => {
                    addCandidates([c]);
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span>
                    {c.noreg} - {c.nama} <span className="text-slate-500 dark:text-slate-400">({c.dept})</span>
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{c.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-400">Personil terpilih ({selected.length})</h4>
        {selected.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada personil dipilih.</p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {selected.map((s) => {
              const row = validPlanRows.length ? resolvePlanRow(s, validPlanRows) : undefined;
              return (
                <li
                  key={s.noreg}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-800"
                >
                  <span>
                    {s.noreg} - {s.nama} ({s.type}, {s.div} · {s.dept})
                    {row?.activity && <span className="text-slate-500 dark:text-slate-400"> · {row.activity}</span>}
                    {validPlanRows.length > 0 && !row && (
                      <span className="ml-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">tidak ada di rencana</span>
                    )}
                  </span>
                  {isRemovable(s.noreg) ? (
                    <button
                      type="button"
                      onClick={() => removeCandidate(s.noreg)}
                      aria-label={`Hapus ${s.nama} dari daftar`}
                      className="rounded px-1.5 text-red-700 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Hapus
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500 dark:text-slate-400">{lockedLabel}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
