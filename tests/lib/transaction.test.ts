import { describe, expect, it } from "vitest";
import { createProject, deleteProject } from "@/lib/engine/actions";
import { demandStore, projectStore } from "@/lib/repo";
import { transaction } from "@/lib/storage";
import { getToasts } from "@/lib/toast";
import { calls, setRpcResponder } from "../helpers/fakeSupabase";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function register() {
  return createProject({
    name: "737D",
    sop_date: "2026-10-01",
    rows: [
      {
        division: "Assy",
        dept: "Assy 1",
        status_mp: "PKWT",
        mp_role: "Project",
        qty: 2,
        fulfill_date: "2026-10-01",
        release_date: "2027-12-31",
        no_release: false,
      },
    ],
  });
}

describe("transactions", () => {
  it("save a project and its demands in one database call", async () => {
    register();
    await settle();
    const sent = calls.filter((c) => c.op === "rpc:apply_changes");
    expect(sent).toHaveLength(1);
    const ops = (sent[0].payload as { ops: { op: string; table: string }[] }).ops;
    expect(ops.map((o) => `${o.op} ${o.table}`)).toEqual([
      "insert projects",
      "insert demands",
      "insert demands",
      "update projects",
    ]);
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(0);
  });

  it("roll everything back when the database refuses any of it", async () => {
    setRpcResponder(() => ({ data: null, error: { message: "new row violates row-level security policy" } }));
    const project = register();
    expect(projectStore.get(project.id)).toBeDefined(); // shown straight away
    await settle();
    expect(projectStore.get(project.id)).toBeUndefined();
    expect(demandStore.list()).toHaveLength(0);
    expect(getToasts().at(-1)?.message).toMatch(/Perubahan dibatalkan/);
  });

  it("bring deleted rows back when a delete is refused", async () => {
    const project = register();
    await settle();
    setRpcResponder(() => ({ data: null, error: { message: "permission denied" } }));
    deleteProject(project.id);
    expect(projectStore.get(project.id)).toBeUndefined();
    await settle();
    expect(projectStore.get(project.id)).toBeDefined();
    expect(demandStore.list()).toHaveLength(2);
  });

  it("fall back to saving one by one before migration_15 is run", async () => {
    setRpcResponder((fn) =>
      fn === "apply_changes"
        ? { data: null, error: { message: "Could not find the function public.apply_changes(ops) in the schema cache" } }
        : { data: null, error: null }
    );
    const project = register();
    await settle();
    expect(calls.filter((c) => c.op === "insert").map((c) => c.table)).toEqual(["projects", "demands", "demands"]);
    expect(projectStore.get(project.id)).toBeDefined();
  });

  it("undo what was already applied if the action itself throws", () => {
    expect(() =>
      transaction(() => {
        register();
        throw new Error("boom");
      })
    ).toThrow("boom");
    expect(projectStore.list()).toHaveLength(0);
    expect(demandStore.list()).toHaveLength(0);
  });
});
