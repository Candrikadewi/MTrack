"use client";
import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/StatTile";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { useStoreList } from "@/lib/useStore";
import { utilPoolStore } from "@/lib/repo";
import { contractRemainingLabel, contractUrgency, fmtDate, poolLeadTimeDays } from "@/lib/engine/compute";
import { naturalRelease } from "@/lib/engine/actions";
import { useRole } from "@/lib/RoleContext";
import type { UtilPoolEntry } from "@/lib/types";

const urgencyClass: Record<string, string> = {
  red: "text-red-600 font-semibold",
  orange: "text-amber-600 font-semibold",
  green: "text-emerald-600",
  none: "text-slate-500",
};

interface SourceSummary {
  label: string;
  total: number;
  utilized: number;
  open: number;
  avgLeadTimeDays: number;
}

function summarizeBySource(entries: UtilPoolEntry[]): SourceSummary[] {
  const groups = new Map<string, UtilPoolEntry[]>();
  for (const e of entries) {
    const list = groups.get(e.source_label) ?? [];
    list.push(e);
    groups.set(e.source_label, list);
  }
  return Array.from(groups.entries())
    .map(([label, list]) => ({
      label,
      total: list.length,
      utilized: list.filter((e) => e.status === "Assigned").length,
      open: list.filter((e) => e.status === "Open").length,
      avgLeadTimeDays: Math.round(
        list.reduce((sum, e) => sum + poolLeadTimeDays(e.entered_pool_date), 0) / list.length
      ),
    }))
    .sort((a, b) => b.total - a.total);
}

export function UtilPoolPageClient() {
  const role = useRole();
  const entries = useStoreList(utilPoolStore).sort((a, b) => b.entered_pool_date.localeCompare(a.entered_pool_date));

  const sourceSummaries = useMemo(() => summarizeBySource(entries), [entries]);
  const totalUtilized = entries.filter((e) => e.status === "Assigned").length;
  const totalUtilizedPct = entries.length > 0 ? (totalUtilized / entries.length) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Supply Pool</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Personil sementara tidak bertugas, dari Project Finish atau Takt Down. Entry yang masih Open bisa dipilih
          sebagai pengganti (MP Excess/MP Back Up) langsung dari Demand Pool.
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState text="Supply Pool kosong." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sourceSummaries.map((s) => (
              <SourceSummaryCard key={s.label} summary={s} />
            ))}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Total Utilisasi</div>
              <div className="mt-3">
                <ProgressBar percent={totalUtilizedPct} />
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {totalUtilized}/{entries.length} supply sudah diutilize (semua sumber)
              </div>
            </div>
          </div>

          <Card>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Noreg</Th>
                  <Th>Nama</Th>
                  <Th>Tipe</Th>
                  <Th>Sumber</Th>
                  <Th>Prev Dept</Th>
                  <Th>Tanggal Masuk Pool</Th>
                  <Th>Lead Time in Pool</Th>
                  <Th>Sisa Kontrak</Th>
                  <Th>Status</Th>
                  <Th>Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const urgency = contractUrgency(e.contract_end);
                  return (
                    <tr key={e.id}>
                      <Td>{e.noreg}</Td>
                      <Td>{e.nama}</Td>
                      <Td>{e.type}</Td>
                      <Td>{e.source_label}</Td>
                      <Td>{e.prev_dept}</Td>
                      <Td>{fmtDate(e.entered_pool_date)}</Td>
                      <Td>{poolLeadTimeDays(e.entered_pool_date)} hari</Td>
                      <Td className={urgencyClass[urgency]}>{contractRemainingLabel(e.contract_end)}</Td>
                      <Td>
                        <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                      </Td>
                      <Td>
                        {e.status === "Open" && role === "admin" && (
                          <Button size="sm" variant="danger" onClick={() => naturalRelease(e.id)}>
                            Natural Release
                          </Button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          </Card>
        </>
      )}
    </div>
  );
}

/** Per-source snapshot: how much supply this source has produced, how much
 * of it is currently deployed (Assigned) vs still waiting (Open) — bar width
 * covers the full total, so any gap after Utilized+Sisa is supply that left
 * the pool via Natural Release. */
function SourceSummaryCard({ summary }: { summary: SourceSummary }) {
  const { label, total, utilized, open, avgLeadTimeDays } = summary;
  const utilizedPct = total > 0 ? (utilized / total) * 100 : 0;
  const openPct = total > 0 ? (open / total) * 100 : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</div>
        <div className="text-xs text-slate-400">Total {total}</div>
      </div>
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="flex h-full">
          <div className="h-full bg-emerald-500" style={{ width: `${utilizedPct}%` }} />
          <div className="h-full bg-amber-400" style={{ width: `${openPct}%` }} />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> {utilized} diutilize
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> {open} sisa
        </span>
      </div>
      <div className="mt-2 text-xs text-slate-400">Avg lead time: {avgLeadTimeDays} hari</div>
    </div>
  );
}
