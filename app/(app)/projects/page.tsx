"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { NewProjectModal } from "@/components/projects/NewProjectModal";
import { useStoreList } from "@/lib/useStore";
import { demandStore, projectStore } from "@/lib/repo";
import { autoProjectFinishCheck, projectSuppliedCount } from "@/lib/engine/actions";
import { fmtDate } from "@/lib/engine/compute";
import { useRole } from "@/lib/RoleContext";

export default function ProjectsPage() {
  const role = useRole();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    // Only Admin can write (RLS); Shop/HR just view, so skip the auto-check
    // to avoid optimistic local writes that the DB would reject.
    if (role === "admin") autoProjectFinishCheck();
  }, [role]);

  const projects = useStoreList(projectStore).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const demands = useStoreList(demandStore);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Project Monitoring</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Mendefinisikan kebutuhan MP — assignment kandidat dilakukan di Enrollment Monitoring.
          </p>
        </div>
        {role === "admin" && (
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            + New Project
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <EmptyState text="Belum ada project." />
      ) : (
        <div className="space-y-4">
          {projects.map((p) => {
            const needed = p.rows.reduce((sum, r) => sum + r.qty, 0);
            const supplied = projectSuppliedCount(p);
            const gap = needed - supplied;
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100">{p.name}</h3>
                      <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                    </div>
                    <div className="text-xs text-slate-500">
                      {fmtDate(p.start_date)} – {fmtDate(p.end_date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-slate-500">
                      Supplied: <span className="font-semibold text-slate-800 dark:text-slate-100">{supplied}</span> / {needed}
                    </span>
                    {gap <= 0 ? (
                      <Badge tone="green">✅ MP Terpenuhi</Badge>
                    ) : (
                      <Badge tone="amber">⚠️ Perlu {gap} MP lagi</Badge>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <TableWrap>
                    <thead>
                      <tr>
                        <Th>Divisi</Th>
                        <Th>Department</Th>
                        <Th>Status MP</Th>
                        <Th>Qty</Th>
                        <Th>Tanggal Pemenuhan</Th>
                        <Th>Fulfilled</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.rows.map((r) => {
                        const rowDemands = demands.filter(
                          (d) => p.demand_ids.includes(d.id) && d.div === r.division && d.dept === r.dept && d.fulfill_date === r.fulfill_date
                        );
                        const fulfilledCount = rowDemands.filter((d) => d.status === "Fulfilled").length;
                        return (
                          <tr key={r.id}>
                            <Td>{r.division}</Td>
                            <Td>{r.dept}</Td>
                            <Td>{r.status_mp}</Td>
                            <Td>{r.qty}</Td>
                            <Td>{fmtDate(r.fulfill_date)}</Td>
                            <Td>
                              {fulfilledCount}/{r.qty}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </TableWrap>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {role === "admin" && <NewProjectModal open={modalOpen} onClose={() => setModalOpen(false)} />}
    </div>
  );
}
