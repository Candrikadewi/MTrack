"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
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
import type { Demand, MpStatusKategori, Project } from "@/lib/types";

const MP_STATUS_TONE: Record<MpStatusKategori, "green" | "amber" | "violet"> = {
  Permanen: "green",
  Vokasi: "violet",
  PKWT: "amber",
  AKTI: "amber",
};

export function ProjectsPageClient() {
  const role = useRole();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Only Admin can write (RLS); Shop/HR just view, so skip the auto-check
    // to avoid optimistic local writes that the DB would reject.
    if (role === "admin") autoProjectFinishCheck();
  }, [role]);

  const projects = useStoreList(projectStore).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const demands = useStoreList(demandStore);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Project Monitoring</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Mendefinisikan kebutuhan MP. Candidate mapping dilakukan di menu Demand Pool.
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
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              demands={demands}
              role={role}
              isExpanded={expanded.has(p.id)}
              onToggle={() => toggle(p.id)}
              onEdit={() => setEditingProject(p)}
            />
          ))}
        </div>
      )}

      {role === "admin" && modalOpen && <NewProjectModal open onClose={() => setModalOpen(false)} />}
      {role === "admin" && editingProject && (
        <NewProjectModal open onClose={() => setEditingProject(null)} project={editingProject} />
      )}
    </div>
  );
}

function ProjectCard({
  project: p,
  demands,
  role,
  isExpanded,
  onToggle,
  onEdit,
}: {
  project: Project;
  demands: Demand[];
  role: ReturnType<typeof useRole>;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const needed = p.rows.reduce((sum, r) => sum + r.qty, 0);
  const supplied = projectSuppliedCount(p);
  const gap = needed - supplied;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {isExpanded ? (
            <ChevronDown size={16} className="shrink-0 text-slate-400" />
          ) : (
            <ChevronRight size={16} className="shrink-0 text-slate-400" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{p.name}</h3>
              <Badge tone={statusTone(p.status)}>{p.status}</Badge>
            </div>
            <div className="text-xs text-slate-500">
              {fmtDate(p.start_date)} - {fmtDate(p.end_date)}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">
            Supplied: <span className="font-semibold text-slate-800 dark:text-slate-100">{supplied}</span> / {needed}
          </span>
          {gap <= 0 ? (
            <Badge tone="green">✅ MP Terpenuhi</Badge>
          ) : (
            <Badge tone="amber">⚠️ Perlu {gap} MP lagi</Badge>
          )}
          {role === "admin" && (
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Pencil size={13} /> Edit
            </Button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
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
                    <Td>
                      <Badge tone={MP_STATUS_TONE[r.status_mp]}>{r.status_mp}</Badge>
                    </Td>
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
      )}
    </Card>
  );
}
