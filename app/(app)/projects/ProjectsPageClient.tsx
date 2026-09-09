"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { NewProjectModal } from "@/components/projects/NewProjectModal";
import { useStoreList } from "@/lib/useStore";
import { projectStore } from "@/lib/repo";
import { autoProjectFinishCheck, deleteProject, projectSuppliedCount } from "@/lib/engine/actions";
import { fmtDate } from "@/lib/engine/compute";
import { useRole } from "@/lib/RoleContext";
import type { Project } from "@/lib/types";

export function ProjectsPageClient() {
  const role = useRole();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  useEffect(() => {
    // Only Admin can write (RLS); Shop/HR just view, so skip the auto-check
    // to avoid optimistic local writes that the DB would reject.
    if (role === "admin") autoProjectFinishCheck();
  }, [role]);

  const projects = useStoreList(projectStore).sort((a, b) => b.start_date.localeCompare(a.start_date));

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
              role={role}
              onEdit={() => setEditingProject(p)}
              onDelete={
                role === "admin"
                  ? () => {
                      if (!confirm(`Hapus project "${p.name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
                      deleteProject(p.id);
                    }
                  : undefined
              }
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
  role,
  onEdit,
  onDelete,
}: {
  project: Project;
  role: ReturnType<typeof useRole>;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const needed = p.rows.reduce((sum, r) => sum + r.qty, 0);
  const supplied = projectSuppliedCount(p);
  const gap = needed - supplied;

  return (
    <Card>
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <Link href={`/projects/${p.id}`} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{p.name}</h3>
              <Badge tone={statusTone(p.status)}>{p.status}</Badge>
            </div>
            <div className="text-xs text-slate-500">
              {fmtDate(p.start_date)} - {fmtDate(p.end_date)} · Supplied {supplied}/{needed}
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {role === "admin" && (
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Pencil size={12} /> Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-red-900 dark:hover:bg-red-950 dark:hover:text-red-400"
            >
              <Trash2 size={12} /> Hapus
            </button>
          )}
          {gap <= 0 ? (
            <Badge tone="green">✅ MP Terpenuhi</Badge>
          ) : (
            <Badge tone="amber">⚠️ Perlu {gap} MP lagi</Badge>
          )}
        </div>
      </div>
    </Card>
  );
}
