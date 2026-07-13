"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { TaktUpModal } from "@/components/takt/TaktUpModal";
import { TaktDownModal } from "@/components/takt/TaktDownModal";
import { useStoreList } from "@/lib/useStore";
import { demandStore, taktStore, utilPoolStore } from "@/lib/repo";
import { fmtDate } from "@/lib/engine/compute";

export default function TaktPage() {
  const [upOpen, setUpOpen] = useState(false);
  const [downOpen, setDownOpen] = useState(false);

  const cases = useStoreList(taktStore).sort((a, b) => b.date.localeCompare(a.date));
  const demands = useStoreList(demandStore);
  const utilPool = useStoreList(utilPoolStore);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Takt Time Monitoring</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Takt Up membuat Demand di Enrollment. Takt Down langsung ke Utilization Pool.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setDownOpen(true)}>
            + Takt Down
          </Button>
          <Button variant="primary" onClick={() => setUpOpen(true)}>
            + Takt Up
          </Button>
        </div>
      </div>

      {cases.length === 0 ? (
        <EmptyState text="Belum ada kasus Takt Time." />
      ) : (
        <Card title="Riwayat Kasus">
          <TableWrap>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Plant</Th>
                <Th>Kategori</Th>
                <Th>Takt Before</Th>
                <Th>Takt After</Th>
                <Th>Detail</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const isUp = c.category === "up";
                const ok = isUp
                  ? demands.filter((d) => c.demand_ids.includes(d.id)).every((d) => d.status === "Fulfilled")
                  : utilPool.filter((u) => c.released_pool_ids.includes(u.id)).every((u) => u.status !== "Open");
                return (
                  <tr key={c.id}>
                    <Td>{fmtDate(c.date)}</Td>
                    <Td>{c.plant}</Td>
                    <Td>
                      <Badge tone={isUp ? "blue" : "violet"}>{isUp ? "Takt Up" : "Takt Down"}</Badge>
                    </Td>
                    <Td>{c.takt_before}s</Td>
                    <Td>{c.takt_after}s</Td>
                    <Td>
                      {isUp
                        ? `${c.demand_ids.length} demand dibuat`
                        : `${c.released_pool_ids.length} personil dilepas`}
                    </Td>
                    <Td>
                      {ok ? (
                        <Badge tone="green">✅ {isUp ? "MP Terpenuhi" : "Semua Diutilisasi"}</Badge>
                      ) : (
                        <Badge tone="amber">⚠️ {isUp ? "Perlu Supply" : "Belum Diutilisasi"}</Badge>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}

      <TaktUpModal open={upOpen} onClose={() => setUpOpen(false)} />
      <TaktDownModal open={downOpen} onClose={() => setDownOpen(false)} />
    </div>
  );
}
