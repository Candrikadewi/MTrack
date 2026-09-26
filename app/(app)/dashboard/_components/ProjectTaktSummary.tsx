// Project and Takt Time Monitoring summaries on the Dashboard.
import Link from "next/link";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { fulfillmentStage } from "@/lib/engine/dashboard";
import { isDemandDue } from "@/lib/engine/enrollment";
import type { Demand, Plant, Project, TaktCase, UtilPoolEntry } from "@/lib/types";

export function ProjectSummaryBlock({ projects, demands }: { projects: Project[]; demands: Demand[] }) {
  const ongoing = projects.filter((p) => p.status === "Ongoing");
  const byId = new Map(demands.map((d) => [d.id, d]));
  return (
    <Card
      title="Project Monitoring"
      action={
        <Link href="/projects" className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
          Lihat semua →
        </Link>
      }
    >
      {ongoing.length === 0 ? (
        <EmptyState text="Tidak ada project Ongoing." />
      ) : (
        <ul className="-mx-2 divide-y divide-slate-100 dark:divide-slate-800">
          {ongoing.map((p) => {
            const list = p.demand_ids.map((id) => byId.get(id)).filter((d): d is Demand => d !== undefined && isDemandDue(d));
            const signed = list.filter((d) => d.status === "Fulfilled" || fulfillmentStage(d) === "noReplace").length;
            const gap = list.length - signed;
            return (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800 dark:text-slate-100">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      SOP {p.start_date} · {signed}/{list.length} terpenuhi
                    </div>
                    <div className="mt-1.5 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600"
                        style={{ width: `${list.length ? (signed / list.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  {gap <= 0 ? (
                    <Badge tone="green">✅ MP Terpenuhi</Badge>
                  ) : (
                    <Badge tone="amber">⚠️ Perlu {gap} MP lagi</Badge>
                  )}
                  <ChevronRight size={15} aria-hidden className="shrink-0 text-slate-400" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function taktMpDelta(t: TaktCase): number {
  if (t.category === "up") return (t.need_rows ?? []).reduce((sum, r) => sum + r.qty, 0);
  return -(t.released_persons?.length ?? t.released_pool_ids.length);
}

export function TaktSummaryBlock({
  taktCases,
  demands,
  utilPool,
}: {
  taktCases: TaktCase[];
  demands: Demand[];
  utilPool: UtilPoolEntry[];
}) {
  const plants: Plant[] = ["Plant 1", "Plant 2"];
  const todayStr = format(new Date(), "yyyy-MM-dd");
  return (
    <Card
      title="Takt Time Monitoring"
      action={
        <Link href="/takt" className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
          Lihat semua →
        </Link>
      }
    >
      <div className="space-y-4">
        {plants.map((plant) => {
          const cases = taktCases.filter((t) => t.plant === plant);
          const current = cases.filter((t) => t.date <= todayStr).sort((a, b) => b.date.localeCompare(a.date))[0];
          const next = cases.filter((t) => t.date > todayStr).sort((a, b) => a.date.localeCompare(b.date))[0];

          let needed = 0;
          let fulfilledCount = 0;
          if (next) {
            if (next.category === "up") {
              needed = (next.need_rows ?? []).reduce((sum, r) => sum + r.qty, 0);
              fulfilledCount = demands.filter((d) => next.demand_ids.includes(d.id) && d.status === "Fulfilled").length;
            } else {
              needed = next.released_persons?.length ?? 0;
              fulfilledCount = utilPool.filter((u) => next.released_pool_ids.includes(u.id) && u.status !== "Open").length;
            }
          }
          const kurang = needed - fulfilledCount;

          return (
            <div key={plant} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
              <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{plant}</div>

              {!current ? (
                <div className="text-xs text-slate-600 dark:text-slate-400">Belum ada Takt Time berjalan.</div>
              ) : (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Takt Saat Ini ({current.date})</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {current.takt_after} menit{" "}
                    {/* Positive delta means the takt change created a
                        manpower need (a gap to fill), not a win — matches
                        the amber "Perlu N MP lagi" convention used for the
                        same concept elsewhere on this page, instead of
                        rendering a new headcount ask as a success color. */}
                    <span className={taktMpDelta(current) > 0 ? "text-amber-600" : "text-emerald-600"}>
                      ({taktMpDelta(current) >= 0 ? "+" : ""}
                      {taktMpDelta(current)} MP)
                    </span>
                  </span>
                </div>
              )}

              <div className="mt-2 border-t border-dashed border-slate-100 pt-2 dark:border-slate-800">
                {!next ? (
                  <div className="text-xs text-slate-600 dark:text-slate-400">Belum ada rencana Next Takt Time Prep.</div>
                ) : (
                  <div className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Next Takt Time Prep</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {next.takt_after} menit · mulai {next.date}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-slate-500">Kebutuhan {needed} orang</span>
                      {kurang <= 0 ? (
                        <Badge tone="green">✅ MP Terpenuhi</Badge>
                      ) : (
                        <Badge tone="amber">⚠️ Kurang {kurang} MP</Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
