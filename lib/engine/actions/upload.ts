// Upload Center: deleting one ZPAR snapshot or one Vokasi batch (never "delete all").
import { demandStore, vokasiStore, zparStore } from "../../repo";
import { pruneStaleVokasiDemands } from "./vokasiEnded";

export interface DeleteResult {
  ok: boolean;
  error?: string;
}

/** Refuses to delete the Active snapshot — every other page reads from it,
 * so silently leaving nothing active (or auto-picking a replacement) would
 * be a worse surprise than just asking the admin to activate another
 * period first. */
export function deleteZparSnapshot(id: string): DeleteResult {
  const snapshot = zparStore.get(id);
  if (!snapshot) return { ok: false, error: "Snapshot tidak ditemukan." };
  if (snapshot.is_active) {
    return { ok: false, error: "Tidak bisa menghapus snapshot yang sedang Active — aktifkan periode lain dulu." };
  }
  zparStore.remove(id);
  return { ok: true };
}

/** Refuses to delete a Vokasi batch once any of its records already
 * produced a VokasiEnded demand (ensureVokasiEndedDemands) — deleting the
 * source record out from under a live demand would orphan it. */
export function deleteVokasiBatch(batch: string): DeleteResult {
  const records = vokasiStore.list().filter((v) => v.batch === batch);
  if (records.length === 0) return { ok: false, error: "Batch tidak ditemukan." };
  const recordIds = new Set(records.map((r) => r.id));
  pruneStaleVokasiDemands();
  const hasLinkedDemand = demandStore.list().some((d) => d.origin_type === "VokasiEnded" && recordIds.has(d.origin_ref));
  if (hasLinkedDemand) {
    return { ok: false, error: "Batch ini sudah menghasilkan demand replacement, tidak bisa dihapus." };
  }
  for (const r of records) vokasiStore.remove(r.id);
  return { ok: true };
}
