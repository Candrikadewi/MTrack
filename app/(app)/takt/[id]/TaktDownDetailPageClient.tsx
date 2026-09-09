"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { useStoreList } from "@/lib/useStore";
import { taktStore, utilPoolStore, demandStore } from "@/lib/repo";
import { fmtDate } from "@/lib/engine/compute";
import type { TaktDownPerson } from "@/lib/types";

function summarizeComposition(persons: TaktDownPerson[]): string {
  const counts = new Map<string, number>();
  for (const p of persons) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([type, n]) => `${n} ${type}`)
    .join(", ");
}

function BackLink() {
  return (
    <Link
      href="/takt"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
    >
      <ArrowLeft size={15} /> Kembali ke Takt Time Monitoring
    </Link>
  );
}

export function TaktDownDetailPageClient({ id }: { id: string }) {
  const cases = useStoreList(taktStore);
  const utilPool = useStoreList(utilPoolStore);
  const demands = useStoreList(demandStore);
  const [expandedDept, setExpandedDept] = useState<Set<string>>(new Set());

  const takt = cases.find((c) => c.id === id);

  if (!takt) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState text="Kasus Takt Down tidak ditemukan." />
      </div>
    );
  }

  const persons = takt.released_persons ?? [];
  const poolByNoreg = new Map(utilPool.filter((u) => takt.released_pool_ids.includes(u.id)).map((u) => [u.noreg, u]));
  // Where a utilized person actually went and since when — cross-referenced
  // from the Demand they became the replacement for (the same Demand
  // assignPoolEntryToDemand set their Util Pool entry to Assigned for).
  const demandByNoreg = new Map(demands.filter((d) => d.replacement_noreg).map((d) => [d.replacement_noreg, d]));

  const groups = new Map<string, { division: string; dept: string; persons: TaktDownPerson[] }>();
  for (const p of persons) {
    const key = `${p.div}|${p.dept}`;
    const g = groups.get(key) ?? { division: p.div, dept: p.dept, persons: [] };
    g.persons.push(p);
    groups.set(key, g);
  }

  function toggleDept(key: string) {
    setExpandedDept((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const totalUtilized = persons.filter((p) => poolByNoreg.get(p.noreg)?.status !== "Open").length;

  return (
    <div className="space-y-6">
      <BackLink />
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Takt Down — {takt.plant}</h1>
          <Badge tone="violet">{fmtDate(takt.date)}</Badge>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {takt.takt_before} menit → {takt.takt_after} menit · {persons.length} personil dilepas ·{" "}
          {totalUtilized}/{persons.length} sudah diutilisasi
        </p>
      </div>

      {groups.size === 0 ? (
        <EmptyState text="Tidak ada rincian personil." />
      ) : (
        <div className="space-y-3">
          {Array.from(groups.entries()).map(([key, g]) => {
            const utilized = g.persons.filter((p) => poolByNoreg.get(p.noreg)?.status !== "Open").length;
            const isExpanded = expandedDept.has(key);
            return (
              <Card key={key}>
                <button
                  type="button"
                  onClick={() => toggleDept(key)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown size={16} className="shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight size={16} className="shrink-0 text-slate-400" />
                    )}
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {g.division} · {g.dept}
                      </div>
                      <div className="text-xs text-slate-500">
                        {g.persons.length} orang — {summarizeComposition(g.persons)}
                      </div>
                    </div>
                  </div>
                  <Badge tone={utilized === g.persons.length ? "green" : "amber"}>
                    {utilized}/{g.persons.length} utilized
                  </Badge>
                </button>

                {isExpanded && (
                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                    {g.persons.map((p) => {
                      const pool = poolByNoreg.get(p.noreg);
                      const status = pool?.status ?? "Open";
                      const demand = demandByNoreg.get(p.noreg);
                      return (
                        <div
                          key={p.noreg}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800"
                        >
                          <div>
                            <span className="font-medium text-slate-700 dark:text-slate-200">{p.nama}</span>{" "}
                            <span className="text-slate-400">
                              ({p.noreg}) · {p.type}
                            </span>
                          </div>
                          <div className="text-xs">
                            {status === "Assigned" && demand ? (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                Diutilisasi ke {demand.div}/{demand.dept}
                                {demand.fulfillment_confirmed_date ? ` — ${fmtDate(demand.fulfillment_confirmed_date)}` : ""}
                              </span>
                            ) : status === "Released" ? (
                              <span className="text-slate-400">Natural Release</span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400">Belum diutilisasi</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
