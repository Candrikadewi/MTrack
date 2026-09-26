import { describe, expect, it } from "vitest";
import { createProject, deleteProject, updateProject } from "@/lib/engine/actions";
import { demandStore, projectStore } from "@/lib/repo";
import type { ProjectMpNeedRow } from "@/lib/types";

function row(patch: Partial<ProjectMpNeedRow> = {}): Omit<ProjectMpNeedRow, "id"> {
  return {
    division: "Assy",
    dept: "Assy 1",
    status_mp: "PKWT",
    mp_role: "Project",
    qty: 2,
    fulfill_date: "2026-10-01",
    release_date: "2027-12-31",
    no_release: false,
    ...patch,
  };
}

function setup() {
  createProject({ name: "737D", sop_date: "2026-10-01", rows: [row(), row({ dept: "Assy 2", qty: 1 })] });
  const project = projectStore.list()[0];
  const demandsOf = () => demandStore.list().filter((d) => d.origin_ref === project.id);
  return { project, demandsOf };
}

describe("createProject", () => {
  it("opens one demand per MP and remembers which row each belongs to", () => {
    const { project, demandsOf } = setup();
    expect(demandsOf()).toHaveLength(3);
    expect(project.rows.map((r) => r.demand_ids?.length)).toEqual([2, 1]);
    expect(project.status).toBe("Ongoing");
  });
});

describe("updateProject", () => {
  it("refuses changes that would lose history of a row already in progress", () => {
    const { project } = setup();
    const inProgress = project.rows[0].demand_ids![0];
    demandStore.update(inProgress, { replacement_noreg: "X1", replacement_nama: "Luna" });
    const base = { name: "737D", sop_date: "2026-10-01" };

    expect(updateProject(project.id, { ...base, rows: [project.rows[1]] })).toMatch(/tidak bisa dihapus/);
    expect(updateProject(project.id, { ...base, rows: [{ ...project.rows[0], dept: "Assy 3" }, project.rows[1]] })).toMatch(
      /tidak bisa diubah/
    );
  });

  it("shrinks, removes and adds rows while keeping demands in progress", () => {
    const { project, demandsOf } = setup();
    const inProgress = project.rows[0].demand_ids![0];
    demandStore.update(inProgress, { replacement_noreg: "X1", replacement_nama: "Luna" });

    const error = updateProject(project.id, {
      name: "737D-X",
      sop_date: "2026-10-05",
      rows: [{ ...project.rows[0], qty: 1 }, { ...row({ dept: "Paint", qty: 3 }) }],
    });

    expect(error).toBeNull();
    const updated = projectStore.get(project.id)!;
    expect(updated.name).toBe("737D-X");
    expect(updated.rows.map((r) => `${r.dept}x${r.qty}`)).toEqual(["Assy 1x1", "Paintx3"]);
    expect(demandsOf()).toHaveLength(4);
    expect(demandStore.get(inProgress)).toBeDefined();
  });
});

describe("deleteProject", () => {
  it("removes untouched demands and keeps the ones in progress", () => {
    const { project, demandsOf } = setup();
    const inProgress = project.rows[0].demand_ids![0];
    demandStore.update(inProgress, { replacement_noreg: "X1", replacement_nama: "Luna" });

    deleteProject(project.id);

    expect(projectStore.get(project.id)).toBeUndefined();
    expect(demandsOf().map((d) => d.id)).toEqual([inProgress]);
  });
});
