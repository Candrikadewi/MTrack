"use client";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { useStoreList } from "@/lib/useStore";
import { demandStore } from "@/lib/repo";
import { assignPoolEntryToDemand } from "@/lib/engine/actions";
import { demandStatusLabel } from "@/lib/engine/enrollment";
import type { DemandCategory, UtilPoolEntry } from "@/lib/types";

export function AssignModal({
  entry,
  category,
  onClose,
}: {
  entry: UtilPoolEntry | null;
  category: DemandCategory;
  onClose: () => void;
}) {
  const demands = useStoreList(demandStore);
  const open = entry !== null;
  const openDemands = entry
    ? demands
        .filter((d) => d.category === category && d.status === "Open")
        .sort((a, b) => (a.dept === entry.prev_dept ? -1 : 0) - (b.dept === entry.prev_dept ? -1 : 0))
    : [];

  return (
    <Modal open={open} onClose={onClose} title={`Assign ke ${category} Enrollment`} width="max-w-2xl">
      {!entry ? null : openDemands.length === 0 ? (
        <EmptyState text={`Tidak ada demand ${category} yang Open saat ini.`} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Pilih demand yang akan diisi oleh <b>{entry.nama}</b> ({entry.noreg}).
          </p>
          <TableWrap>
            <thead>
              <tr>
                <Th>Outgoing</Th>
                <Th>Asal</Th>
                <Th>Divisi</Th>
                <Th>Department</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {openDemands.map((d) => (
                <tr key={d.id}>
                  <Td>{d.outgoing_nama || d.outgoing_label}</Td>
                  <Td>{demandStatusLabel(d)}</Td>
                  <Td>{d.div}</Td>
                  <Td className={d.dept === entry.prev_dept ? "font-semibold text-blue-600" : ""}>{d.dept}</Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        assignPoolEntryToDemand(entry.id, d.id);
                        onClose();
                      }}
                    >
                      Pilih
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      )}
    </Modal>
  );
}
