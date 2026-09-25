"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { parseKaizenLabel, removeKaizenPerson, updateKaizenBatch } from "@/lib/engine/actions";
import { pushToast } from "@/lib/toast";
import type { UtilPoolEntry } from "@/lib/types";

/** Edits one Kaizen batch (entries sharing a source label): its activity,
 * its release date, and who is in it. People already utilized stay. */
export function KaizenBatchModal({ label, entries, onClose }: { label: string; entries: UtilPoolEntry[]; onClose: () => void }) {
  const parts = parseKaizenLabel(label);
  const firstOpen = entries.find((e) => e.status === "Open") ?? entries[0];
  const [activity, setActivity] = useState(parts?.activity ?? "");
  const [releaseDate, setReleaseDate] = useState(firstOpen?.entered_pool_date ?? "");

  function save() {
    if (!activity.trim() || !releaseDate) return;
    const error = updateKaizenBatch(label, { activity: activity.trim(), releaseDate });
    if (error) {
      pushToast(error);
      return;
    }
    pushToast("Kaizen diperbarui.", "success");
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${label}`} width="max-w-2xl">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Activity">
            <Input value={activity} onChange={(e) => setActivity(e.target.value)} data-autofocus />
          </Field>
          <Field label="Tanggal Rilis">
            <Input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
          </Field>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold text-slate-500">MP di batch ini ({entries.length})</h4>
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800 dark:text-slate-100">
                    {e.nama} <span className="text-xs font-normal text-slate-500">{e.noreg}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {e.prev_dept} · {e.type}
                  </div>
                </div>
                {e.status === "Open" ? (
                  <button
                    type="button"
                    aria-label={`Keluarkan ${e.nama} dari batch`}
                    onClick={() => {
                      const error = removeKaizenPerson(e.id);
                      if (error) pushToast(error);
                    }}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <Badge tone="green">{e.status === "Assigned" ? "Diutilize" : e.status}</Badge>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">MP yang sudah diutilize tidak bisa dikeluarkan.</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" disabled={!activity.trim() || !releaseDate} onClick={save}>
            Simpan Perubahan
          </Button>
        </div>
      </div>
    </Modal>
  );
}
