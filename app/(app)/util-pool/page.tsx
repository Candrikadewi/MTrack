"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { AssignModal } from "@/components/utilpool/AssignModal";
import { useStoreList } from "@/lib/useStore";
import { utilPoolStore } from "@/lib/repo";
import { contractRemainingLabel, contractUrgency, fmtDate } from "@/lib/engine/compute";
import { naturalRelease } from "@/lib/engine/actions";
import { useRole } from "@/lib/RoleContext";
import type { DemandCategory, UtilPoolEntry } from "@/lib/types";

const urgencyClass: Record<string, string> = {
  red: "text-red-600 font-semibold",
  orange: "text-amber-600 font-semibold",
  green: "text-emerald-600",
  none: "text-slate-500",
};

export default function UtilPoolPage() {
  const role = useRole();
  const entries = useStoreList(utilPoolStore).sort((a, b) => b.entered_pool_date.localeCompare(a.entered_pool_date));
  const [assignTarget, setAssignTarget] = useState<{ entry: UtilPoolEntry; category: DemandCategory } | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Utilization Pool</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Personil sementara tidak bertugas, dari Project Finish atau Takt Down.
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState text="Utilization Pool kosong." />
      ) : (
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
                    <Td>
                      {e.source}: {e.source_label}
                    </Td>
                    <Td>{e.prev_dept}</Td>
                    <Td>{fmtDate(e.entered_pool_date)}</Td>
                    <Td className={urgencyClass[urgency]}>{contractRemainingLabel(e.contract_end)}</Td>
                    <Td>
                      <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                    </Td>
                    <Td>
                      {e.status === "Open" && role === "admin" && (
                        <div className="flex flex-wrap gap-1.5">
                          <Button size="sm" onClick={() => setAssignTarget({ entry: e, category: "PKWT" })}>
                            → PKWT
                          </Button>
                          <Button size="sm" onClick={() => setAssignTarget({ entry: e, category: "Vokasi" })}>
                            → Vokasi
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => naturalRelease(e.id)}>
                            Natural Release
                          </Button>
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}

      <AssignModal
        entry={assignTarget?.entry ?? null}
        category={assignTarget?.category ?? "Vokasi"}
        onClose={() => setAssignTarget(null)}
      />
    </div>
  );
}
