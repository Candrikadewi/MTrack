// Vokasi SHOP values that aren't standard: the admin maps each once, reused on later uploads.
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { valueMappingStore } from "@/lib/repo";
import { genId } from "@/lib/storage";
import { VOKASI_SHOPS, type VokasiShopValue } from "@/lib/parseFile";
import type { ValueMapping } from "@/lib/types";

/** Standard shop for a raw value: itself when already standard, else the
 * confirmed mapping ("" = skip those rows), else undefined (unconfirmed). */
export function resolveShop(v: VokasiShopValue, mappings: ValueMapping[]): string | undefined {
  if (v.standard) return v.standard;
  return mappings.find((m) => m.dataset === "vokasi" && m.field === "shop" && m.normalized_raw === v.key)?.mapped_value;
}

function saveShopMapping(v: VokasiShopValue, mapped: string, mappings: ValueMapping[]) {
  const existing = mappings.find((m) => m.dataset === "vokasi" && m.field === "shop" && m.normalized_raw === v.key);
  const decided_at = new Date().toISOString();
  if (existing) valueMappingStore.update(existing.id, { mapped_value: mapped, decided_at });
  else
    valueMappingStore.insert({
      id: genId("valmap"),
      dataset: "vokasi",
      field: "shop",
      raw_value: v.raw,
      normalized_raw: v.key,
      mapped_value: mapped,
      decided_at,
    });
}

/** Non-standard SHOP spellings (e.g. "ASSEMMBLY") are never corrected
 * silently: each is shown with the closest standard shop and saved only
 * once confirmed, then reused on every later upload. */
export function ShopMappingPanel({ values, mappings }: { values: VokasiShopValue[]; mappings: ValueMapping[] }) {
  const nonStandard = values.filter((v) => !v.standard);
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (nonStandard.length === 0) return null;
  const pending = nonStandard.filter((v) => resolveShop(v, mappings) === undefined).length;
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Shop tidak standar ({nonStandard.length})</h4>
        {pending > 0 ? (
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{pending} perlu dikonfirmasi sebelum upload</span>
        ) : (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">Semua sudah dikonfirmasi</span>
        )}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Kemungkinan typo. Pilih Shop standar yang benar lalu konfirmasi — dipakai untuk menentukan Div/Dept dan disimpan untuk upload berikutnya.
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {nonStandard.map((v) => {
          const confirmed = resolveShop(v, mappings);
          const value = draft[v.key] ?? confirmed ?? v.suggestion;
          return (
            <li key={v.key} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  &ldquo;{v.raw}&rdquo; <span className="text-xs font-normal text-slate-500 dark:text-slate-400">· {v.count} baris</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {confirmed === undefined
                    ? `Dugaan: ${v.suggestion}`
                    : confirmed === ""
                      ? "Dikonfirmasi: bukan shop valid, baris dilewati"
                      : `Dikonfirmasi: ${confirmed}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={value}
                  aria-label={`Shop standar untuk ${v.raw}`}
                  onChange={(e) => setDraft((d) => ({ ...d, [v.key]: e.target.value }))}
                  className="w-48"
                >
                  {VOKASI_SHOPS.map((sh) => (
                    <option key={sh} value={sh}>
                      {sh}
                    </option>
                  ))}
                  <option value="">— bukan shop, lewati baris —</option>
                </Select>
                <Button
                  size="sm"
                  variant={confirmed === undefined ? "primary" : "secondary"}
                  disabled={confirmed === value}
                  onClick={() => saveShopMapping(v, value, mappings)}
                >
                  {confirmed === undefined ? "Konfirmasi" : "Simpan"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
