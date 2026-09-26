// Editing and deleting a Kaizen batch (entries sharing one source label).
import { utilPoolStore } from "../../repo";
import { removePoolEntry } from "./pool";

const KAIZEN_LABEL = /^Kaizen (\d{4}) Labor (\S+) - (.*) \((.*)\)$/;

/** Parts of a Kaizen batch label ("Kaizen 2026 Labor A/F - Div (activity)"). */
export function parseKaizenLabel(label: string): { year: string; group: string; div: string; activity: string } | null {
  const m = KAIZEN_LABEL.exec(label);
  return m ? { year: m[1], group: m[2], div: m[3], activity: m[4] } : null;
}

/** Renames a Kaizen batch's activity and moves its release date. People
 * already utilized keep their entry as it is, except for the label, so the
 * batch stays one group. */
export function updateKaizenBatch(label: string, input: { activity: string; releaseDate: string }): string | null {
  const parts = parseKaizenLabel(label);
  if (!parts) return "Batch Kaizen tidak dikenali.";
  const entries = utilPoolStore.list().filter((e) => e.source === "Kaizen" && e.source_label === label);
  if (entries.length === 0) return "Batch Kaizen tidak ditemukan.";
  const nextLabel = `Kaizen ${input.releaseDate.slice(0, 4) || parts.year} Labor ${parts.group} - ${parts.div} (${input.activity})`;
  for (const e of entries) {
    utilPoolStore.update(e.id, {
      source_label: nextLabel,
      ...(e.status === "Open" && input.releaseDate ? { entered_pool_date: input.releaseDate } : {}),
    });
  }
  return null;
}

/** Takes one person back out of a Kaizen batch while still Open. */
export function removeKaizenPerson(entryId: string): string | null {
  const e = utilPoolStore.get(entryId);
  if (!e || e.source !== "Kaizen") return "Data tidak ditemukan.";
  if (e.status !== "Open") return "Sudah diutilize, tidak bisa dihapus.";
  removePoolEntry(e);
  return null;
}

/** Deletes a Kaizen batch: Open people are removed; anyone already
 * utilized stays in the pool. Returns how many were kept. */
export function deleteKaizenBatch(label: string): number {
  let kept = 0;
  for (const e of utilPoolStore.list().filter((x) => x.source === "Kaizen" && x.source_label === label)) {
    if (e.status === "Open") removePoolEntry(e);
    else kept++;
  }
  return kept;
}
