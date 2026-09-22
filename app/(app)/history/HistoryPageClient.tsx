"use client";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Table";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { fmtDate } from "@/lib/engine/compute";
import { useStoreList } from "@/lib/useStore";
import { demandStore, projectStore, taktStore, utilPoolStore } from "@/lib/repo";
import type { Plant, Project, TaktCase, UtilPoolEntry } from "@/lib/types";

type Jenis = "Project" | "Takt Up" | "Takt Down" | "Kaizen";

interface HistoryRow {
  div: string;
  dept: string;
}

interface HistoryBatch {
  id: string;
  jenis: Jenis;
  label: string;
  meta: string;
  plant?: Plant;
  statusLabel: string;
  closureMonth: string;
  rows: HistoryRow[];
  totalQty: number;
}

function monthOf(date: string): string {
  return date ? date.slice(0, 7) : "";
}

function buildHistoryBatches(
  projects: Project[],
  taktCases: TaktCase[],
  demands: ReturnType<typeof demandStore.list>,
  poolEntries: UtilPoolEntry[]
): HistoryBatch[] {
  const batches: HistoryBatch[] = [];

  for (const p of projects) {
    if (p.status !== "Finish") continue;
    batches.push({
      id: `project-${p.id}`,
      jenis: "Project",
      label: p.name,
      meta: `${fmtDate(p.start_date)} — ${fmtDate(p.end_date)}`,
      statusLabel: "Finish",
      closureMonth: monthOf(p.end_date),
      rows: p.rows.map((r) => ({ div: r.division, dept: r.dept })),
      totalQty: p.rows.reduce((sum, r) => sum + r.qty, 0),
    });
  }

  for (const t of taktCases) {
    const linkedDemands = demands.filter((d) => t.demand_ids.includes(d.id));
    const linkedPool = poolEntries.filter((e) => t.released_pool_ids.includes(e.id));
    if (t.category === "up") {
      if (linkedDemands.length === 0 || !linkedDemands.every((d) => d.status === "Fulfilled")) continue;
      const closureDates = linkedDemands.map((d) => d.fulfillment_confirmed_date).filter(Boolean);
      batches.push({
        id: `takt-${t.id}`,
        jenis: "Takt Up",
        label: `Takt Up — ${t.plant}`,
        meta: fmtDate(t.date),
        plant: t.plant,
        statusLabel: "MP Terpenuhi",
        closureMonth: monthOf(closureDates.length ? closureDates.sort().slice(-1)[0] : t.date),
        rows: (t.need_rows ?? []).map((r) => ({ div: r.division, dept: r.dept })),
        totalQty: (t.need_rows ?? []).reduce((sum, r) => sum + r.qty, 0),
      });
    } else {
      if (linkedPool.length === 0 || !linkedPool.every((e) => e.status !== "Open")) continue;
      const closureDates = linkedPool.map((e) => e.entered_pool_date).filter(Boolean);
      const rows = t.plan_rows?.length
        ? t.plan_rows.map((r) => ({ div: r.division, dept: r.dept }))
        : (t.released_persons ?? []).map((p) => ({ div: p.div, dept: p.dept }));
      batches.push({
        id: `takt-${t.id}`,
        jenis: "Takt Down",
        label: `Takt Down — ${t.plant}`,
        meta: fmtDate(t.date),
        plant: t.plant,
        statusLabel: "Semua Diutilisasi",
        closureMonth: monthOf(closureDates.length ? closureDates.sort().slice(-1)[0] : t.date),
        rows,
        totalQty: rows.length,
      });
    }
  }

  const kaizenGroups = new Map<string, UtilPoolEntry[]>();
  for (const e of poolEntries) {
    if (e.source !== "Kaizen") continue;
    const list = kaizenGroups.get(e.source_label) ?? [];
    list.push(e);
    kaizenGroups.set(e.source_label, list);
  }
  for (const [label, list] of kaizenGroups) {
    if (!list.every((e) => e.status !== "Open")) continue;
    const closureDates = list.map((e) => e.entered_pool_date).filter(Boolean).sort();
    batches.push({
      id: `kaizen-${label}`,
      jenis: "Kaizen",
      label,
      meta: `${list.length} personil`,
      statusLabel: "Diutilisasi",
      closureMonth: monthOf(closureDates.slice(-1)[0] ?? ""),
      rows: list.map((e) => ({ div: e.prev_div, dept: e.prev_dept })),
      totalQty: list.length,
    });
  }

  return batches.sort((a, b) => b.closureMonth.localeCompare(a.closureMonth));
}

const JENIS_TONE: Record<Jenis, "blue" | "violet" | "green" | "amber"> = {
  Project: "blue",
  "Takt Up": "blue",
  "Takt Down": "violet",
  Kaizen: "green",
};

export function HistoryPageClient() {
  const projects = useStoreList(projectStore);
  const taktCases = useStoreList(taktStore);
  const demands = useStoreList(demandStore);
  const poolEntries = useStoreList(utilPoolStore);

  const allBatches = useMemo(
    () => buildHistoryBatches(projects, taktCases, demands, poolEntries),
    [projects, taktCases, demands, poolEntries]
  );

  const [jenisFilter, setJenisFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [periodeFilter, setPeriodeFilter] = useState<string[]>([]);
  const [plantFilter, setPlantFilter] = useState<string[]>([]);
  const [divFilter, setDivFilter] = useState<string[]>([]);
  const [deptFilter, setDeptFilter] = useState<string[]>([]);

  const jenisOptions = Array.from(new Set(allBatches.map((b) => b.jenis))).sort();
  const statusOptions = Array.from(new Set(allBatches.map((b) => b.statusLabel))).sort();
  const periodeOptions = Array.from(new Set(allBatches.map((b) => b.closureMonth).filter(Boolean))).sort().reverse();
  const plantOptions = Array.from(new Set(allBatches.map((b) => b.plant).filter((p): p is Plant => Boolean(p)))).sort();
  const divOptions = Array.from(new Set(allBatches.flatMap((b) => b.rows.map((r) => r.div)).filter(Boolean))).sort();
  const deptOptions = Array.from(new Set(allBatches.flatMap((b) => b.rows.map((r) => r.dept)).filter(Boolean))).sort();

  const filtered = allBatches.filter((b) => {
    if (jenisFilter.length && !jenisFilter.includes(b.jenis)) return false;
    if (statusFilter.length && !statusFilter.includes(b.statusLabel)) return false;
    if (periodeFilter.length && !periodeFilter.includes(b.closureMonth)) return false;
    if (plantFilter.length && (!b.plant || !plantFilter.includes(b.plant))) return false;
    if (divFilter.length && !b.rows.some((r) => divFilter.includes(r.div))) return false;
    if (deptFilter.length && !b.rows.some((r) => deptFilter.includes(r.dept))) return false;
    return true;
  });

  function matchIndicator(b: HistoryBatch): string | null {
    if (divFilter.length === 0 && deptFilter.length === 0) return null;
    const matching = b.rows.filter(
      (r) => (divFilter.length === 0 || divFilter.includes(r.div)) && (deptFilter.length === 0 || deptFilter.includes(r.dept))
    );
    if (matching.length === 0) return null;
    const depts = Array.from(new Set(matching.map((r) => r.dept))).join(", ");
    return `✓ cocok: ${depts} (${matching.length} dari ${b.rows.length} baris)`;
  }

  function exportCsv() {
    const header = ["Jenis", "Batch", "Status", "Periode", "Plant", "Total Qty", "Meta"];
    const lines = [header.join(",")];
    for (const b of filtered) {
      lines.push(
        [b.jenis, b.label, b.statusLabel, b.closureMonth, b.plant ?? "-", String(b.totalQty), b.meta]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "History-Export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">History</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ledger Project/Takt Up/Takt Down/Kaizen yang sudah closed dan sudah lewat bulan berjalan.
          </p>
        </div>
        <Button variant="secondary" onClick={exportCsv}>
          Export
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <MultiSelect label="Jenis" options={jenisOptions} selected={jenisFilter} onChange={setJenisFilter} className="w-40" />
        <MultiSelect label="Status" options={statusOptions} selected={statusFilter} onChange={setStatusFilter} className="w-44" />
        <MultiSelect label="Periode" options={periodeOptions} selected={periodeFilter} onChange={setPeriodeFilter} className="w-40" />
        <MultiSelect label="Plant" options={plantOptions} selected={plantFilter} onChange={setPlantFilter} className="w-36" />
        <MultiSelect
          label="Divisi"
          options={divOptions}
          selected={divFilter}
          onChange={(v) => {
            setDivFilter(v);
            setDeptFilter([]);
          }}
          className="w-44"
        />
        <MultiSelect label="Department" options={deptOptions} selected={deptFilter} onChange={setDeptFilter} className="w-44" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="Tidak ada batch yang cocok dengan filter ini." />
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => {
            const indicator = matchIndicator(b);
            return (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={JENIS_TONE[b.jenis]}>{b.jenis}</Badge>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{b.label}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {b.meta} · {b.statusLabel} · Periode {b.closureMonth || "-"}
                  </div>
                  {indicator && <div className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">{indicator}</div>}
                </div>
                <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">{b.totalQty} MP</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
