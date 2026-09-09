"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { useStoreList } from "@/lib/useStore";
import { projectStore, demandStore } from "@/lib/repo";
import { fmtDate } from "@/lib/engine/compute";
import type { Demand, ProjectMpNeedRow } from "@/lib/types";

function summarizeComposition(rows: ProjectMpNeedRow[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.status_mp, (counts.get(r.status_mp) ?? 0) + r.qty);
  return Array.from(counts.entries())
    .map(([status, n]) => `${n} ${status}`)
    .join(", ");
}

function BackLink() {
  return (
    <Link
      href="/projects"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
    >
      <ArrowLeft size={15} /> Kembali ke Project Monitoring
    </Link>
  );
}

export function ProjectDetailPageClient({ id }: { id: string }) {
  const projects = useStoreList(projectStore);
  const demands = useStoreList(demandStore);
  const [expandedGroup, setExpandedGroup] = useState<Set<string>>(new Set());

  const project = projects.find((p) => p.id === id);

  if (!project) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState text="Project tidak ditemukan." />
      </div>
    );
  }

  const groups = new Map<string, { division: string; dept: string; rows: ProjectMpNeedRow[] }>();
  for (const r of project.rows) {
    const key = `${r.division}|${r.dept}`;
    const g = groups.get(key) ?? { division: r.division, dept: r.dept, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }

  function toggleGroup(key: string) {
    setExpandedGroup((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const needed = project.rows.reduce((sum, r) => sum + r.qty, 0);
  const supplied = demands.filter((d) => project.demand_ids.includes(d.id) && d.status === "Fulfilled").length;

  return (
    <div className="space-y-6">
      <BackLink />
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{project.name}</h1>
          <Badge tone={statusTone(project.status)}>{project.status}</Badge>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {fmtDate(project.start_date)} - {fmtDate(project.end_date)} · Supplied {supplied}/{needed}
        </p>
      </div>

      {groups.size === 0 ? (
        <EmptyState text="Tidak ada rincian kebutuhan." />
      ) : (
        <div className="space-y-3">
          {Array.from(groups.entries()).map(([key, g]) => {
            const rowDemands = demands.filter(
              (d) => project.demand_ids.includes(d.id) && d.div === g.division && d.dept === g.dept
            );
            const totalQty = g.rows.reduce((sum, r) => sum + r.qty, 0);
            const fulfilled = rowDemands.filter((d) => d.status === "Fulfilled").length;
            const isExpanded = expandedGroup.has(key);
            return (
              <Card key={key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
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
                        {totalQty} orang — {summarizeComposition(g.rows)}
                      </div>
                    </div>
                  </div>
                  <Badge tone={fulfilled === totalQty ? "green" : "amber"}>
                    {fulfilled}/{totalQty} fulfilled
                  </Badge>
                </button>

                {isExpanded && (
                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                    {rowDemands.map((d) => (
                      <DemandKeteranganRow key={d.id} demand={d} />
                    ))}
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

function DemandKeteranganRow({ demand: d }: { demand: Demand }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
      <div>
        {d.replacement_nama ? (
          <>
            <span className="font-medium text-slate-700 dark:text-slate-200">{d.replacement_nama}</span>{" "}
            <span className="text-slate-400">({d.replacement_noreg})</span>
          </>
        ) : (
          <span className="text-slate-400">Belum diisi</span>
        )}
      </div>
      <div className="text-xs">
        {d.status === "Fulfilled" ? (
          <span className="text-emerald-600 dark:text-emerald-400">
            Fulfilled{d.fulfillment_confirmed_date ? ` — ${fmtDate(d.fulfillment_confirmed_date)}` : ""}
          </span>
        ) : (
          <span className="text-amber-600 dark:text-amber-400">Open</span>
        )}
      </div>
    </div>
  );
}
