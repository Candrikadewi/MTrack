"use client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { useStoreList } from "@/lib/useStore";
import { utilPoolStore } from "@/lib/repo";
import { contractRemainingLabel, contractUrgency, fmtDate, poolLeadTimeDays } from "@/lib/engine/compute";
import { naturalRelease } from "@/lib/engine/actions";
import { useRole } from "@/lib/RoleContext";

const urgencyClass: Record<string, string> = {
  red: "text-red-600 font-semibold",
  orange: "text-amber-600 font-semibold",
  green: "text-emerald-600",
  none: "text-slate-500",
};

export default function UtilPoolPage() {
  const role = useRole();
  const entries = useStoreList(utilPoolStore).sort((a, b) => b.entered_pool_date.localeCompare(a.entered_pool_date));

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
                    <Td>
                      {e.source}: {e.source_label}
                    </Td>
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
      )}
    </div>
  );
}
