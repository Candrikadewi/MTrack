"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { getActiveSnapshot, vokasiStore } from "@/lib/repo";
import { createTaktDown } from "@/lib/engine/actions";
import type { MpStatusKategori, Plant } from "@/lib/types";

interface Candidate {
  noreg: string;
  nama: string;
  dept: string;
  type: MpStatusKategori;
}

export function TaktDownModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [plant, setPlant] = useState<Plant>("Plant 1");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [taktBefore, setTaktBefore] = useState(0);
  const [taktAfter, setTaktAfter] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Candidate[]>([]);

  function loadCandidates(): Candidate[] {
    const snap = getActiveSnapshot();
    const fromEmployees: Candidate[] = (snap?.employees ?? []).map((e) => ({
      noreg: e.noreg,
      nama: e.nama,
      dept: e.dept,
      type: e.status_kontrak === "Permanen" ? "Permanen" : e.status_kontrak === "AKTI" ? "AKTI" : "PKWT",
    }));
    const fromVokasi: Candidate[] = vokasiStore.list().map((v) => ({
      noreg: v.noreg,
      nama: v.nama,
      dept: v.dept,
      type: "Vokasi",
    }));
    return [...fromEmployees, ...fromVokasi];
  }

  const candidates = open ? loadCandidates() : [];

  const filtered = query
    ? candidates.filter(
        (c) => c.noreg.toLowerCase().includes(query.toLowerCase()) || c.nama.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  function addCandidate(c: Candidate) {
    if (selected.some((s) => s.noreg === c.noreg)) return;
    setSelected((prev) => [...prev, c]);
    setQuery("");
  }

  function removeCandidate(noreg: string) {
    setSelected((prev) => prev.filter((s) => s.noreg !== noreg));
  }

  function reset() {
    setSelected([]);
    setQuery("");
    setTaktBefore(0);
    setTaktAfter(0);
  }

  function submit() {
    if (selected.length === 0) return;
    createTaktDown({
      plant,
      date,
      takt_before: taktBefore,
      takt_after: taktAfter,
      released_persons: selected.map((s) => ({ noreg: s.noreg, nama: s.nama, type: s.type, dept: s.dept })),
    });
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Takt Down — Lepas Personil" width="max-w-xl">
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

        <Field label="Cari Personil (noreg / nama)">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ketik untuk mencari..." />
        </Field>
        {filtered.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
            {filtered.slice(0, 20).map((c) => (
              <button
                key={c.noreg}
                onClick={() => addCandidate(c)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span>
                  {c.noreg} — {c.nama} <span className="text-slate-400">({c.dept})</span>
                </span>
                <span className="text-xs text-slate-400">{c.type}</span>
              </button>
            ))}
          </div>
        )}

        <div>
          <h4 className="mb-2 text-xs font-semibold text-slate-500">Personil Terpilih ({selected.length})</h4>
          {selected.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada personil dipilih.</p>
          ) : (
            <ul className="space-y-1">
              {selected.map((s) => (
                <li key={s.noreg} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-sm dark:border-slate-800">
                  <span>
                    {s.noreg} — {s.nama} ({s.type}, {s.dept})
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
            Simpan Takt Down
          </Button>
        </div>
      </div>
    </Modal>
  );
}
