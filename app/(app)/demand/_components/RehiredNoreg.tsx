"use client";
// Linking a rehired Vokasi alumnus to their new ZPAR noreg: strict checks first, the admin
// picks when they aren't enough.
import { useState } from "react";
import { fmtDate } from "@/lib/engine/compute";
import { findRehiredEmployee, isRehiredAlumnus, linkedZparNoreg, linkRehiredNoreg, rehireCandidates } from "@/lib/engine/actions";
import { pushToast } from "@/lib/toast";
import { useRole } from "@/lib/RoleContext";
import type { Demand } from "@/lib/types";

/** A Vokasi alumnus mapped as PKWT New Hire signs under a new noreg. After
 * sign kontrak it shows the confirmed ZPAR noreg, or — until one is
 * confirmed — the same-name ZPAR candidates with the checks behind each,
 * for an admin to pick (or type the noreg when the name differs). */
export function RehiredNoreg({ demand: d }: { demand: Demand }) {
  const isAdmin = useRole() === "admin";
  const [editing, setEditing] = useState(false);
  const [manual, setManual] = useState("");
  if (!isRehiredAlumnus(d)) return null;
  const linked = linkedZparNoreg(d.replacement_noreg);
  if (!d.fulfillment_confirmed_date) {
    return <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Noreg ZPAR ditautkan setelah sign kontrak</div>;
  }
  if (linked && !editing) {
    const emp = findRehiredEmployee(d.replacement_noreg);
    return (
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        Noreg ZPAR: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{linked}</span>
        {!emp && <span>(belum di ZPAR aktif)</span>}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Ubah
          </button>
        )}
      </div>
    );
  }
  const candidates = rehireCandidates(d);
  const confirm = (noreg: string) => {
    linkRehiredNoreg(d.replacement_noreg, noreg);
    setEditing(false);
    setManual("");
    pushToast(`${d.replacement_nama || d.replacement_noreg} ditautkan ke noreg ZPAR ${noreg}.`, "success");
  };
  return (
    <div className="mt-1.5 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="font-semibold text-amber-800 dark:text-amber-200">Noreg ZPAR belum dikonfirmasi</div>
      {candidates.length === 0 ? (
        <p className="text-amber-800/80 dark:text-amber-200/80">
          Belum ada nama yang sama di ZPAR aktif. Tunggu ZPAR berikutnya, atau isi noreg-nya.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {candidates.map((c) => (
            <li key={c.employee.noreg} className="rounded-md bg-white/80 p-1.5 dark:bg-slate-900/60">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {c.employee.noreg} · {c.employee.dept || "-"} · masuk {fmtDate(c.employee.tgl_masuk)}
                </span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => confirm(c.employee.noreg)}
                    className="shrink-0 rounded-md bg-blue-600 px-2 py-0.5 font-semibold text-white hover:bg-blue-700"
                  >
                    Pakai
                  </button>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {c.checks.map((ch) => (
                  <span
                    key={ch.label}
                    className={`rounded-full px-1.5 py-0.5 ${
                      ch.ok
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300"
                    }`}
                  >
                    {ch.ok ? "✓" : "✕"} {ch.label}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {isAdmin && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) confirm(manual.trim());
          }}
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Noreg ZPAR lain"
            aria-label={`Noreg ZPAR untuk ${d.replacement_nama || d.replacement_noreg}`}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            disabled={!manual.trim()}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
          >
            Simpan
          </button>
          {editing && (
            <button type="button" onClick={() => setEditing(false)} className="px-1 text-slate-500 hover:underline">
              Batal
            </button>
          )}
        </form>
      )}
    </div>
  );
}
