import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSnapshotStore } from "@/lib/snapshots";
import { calls, failSelect, setTableRows } from "../helpers/fakeSupabase";
import { employee } from "../helpers/fixtures";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const snapshot = (id: string, period: string, isActive: boolean, count: number) => ({
  id,
  period,
  filename: `${period}.csv`,
  upload_date: `${period}-01T00:00:00Z`,
  is_active: isActive,
  employees: Array.from({ length: count }, (_, i) => employee({ noreg: `${period}-${i}` })),
  employee_count: count,
});

describe("snapshot store", () => {
  beforeEach(() => {
    // Stores only start in a browser.
    vi.stubGlobal("window", globalThis);
    setTableRows("zpar_snapshots", [
      snapshot("s1", "2026-07", false, 2),
      snapshot("s2", "2026-08", false, 3),
      snapshot("s3", "2026-09", true, 4),
    ]);
  });

  it("reads every snapshot's details but only the active one's employees", async () => {
    const store = createSnapshotStore();
    store.init();
    await settle();
    await settle();

    expect(store.ready()).toBe(true);
    const rows = store.list();
    expect(rows.map((s) => [s.period, s.employee_count, s.employees.length])).toEqual([
      ["2026-07", 2, 0],
      ["2026-08", 3, 0],
      ["2026-09", 4, 4],
    ]);
    const employeeReads = calls.filter((c) => c.op === "select" && String(c.payload).includes("employees"));
    expect(employeeReads).toHaveLength(1);
  });

  it("loads another month's employees when asked, once", async () => {
    const store = createSnapshotStore();
    store.init();
    await settle();
    await settle();

    await Promise.all([store.loadEmployees(["s1"]), store.loadEmployees(["s1"])]);
    expect(store.get("s1")?.employees).toHaveLength(2);
    expect(store.employeesLoaded("s2")).toBe(false);
    expect(calls.filter((c) => c.op === "select" && String(c.payload).includes("employees"))).toHaveLength(2);
  });

  it("reads every column, as before, until migration_17 adds employee_count", async () => {
    failSelect(/employee_count/, "column zpar_snapshots.employee_count does not exist");
    const store = createSnapshotStore();
    store.init();
    await settle();
    await settle();

    expect(store.ready()).toBe(true);
    expect(store.list().map((s) => s.employees.length)).toEqual([2, 3, 4]);
  });

  it("doesn't keep a page loading forever when the active employees can't be read", async () => {
    failSelect(/employees/, "network down");
    const store = createSnapshotStore();
    store.init();
    await settle();
    await settle();

    expect(store.ready()).toBe(true);
    expect(store.list().find((s) => s.is_active)?.employees).toEqual([]);
  });
});

describe("PKWT reviews after switching the active snapshot", () => {
  it("wait for the new snapshot's employees instead of finding none", async () => {
    vi.stubGlobal("window", globalThis);
    const kontrak = employee({ noreg: "026001", status_kontrak: "Kontrak 1.1", tgl_masuk: "2024-10-01" });
    setTableRows("zpar_snapshots", [
      { ...snapshot("aug", "2026-08", false, 0), employees: [kontrak], employee_count: 1 },
      snapshot("sep", "2026-09", true, 2),
    ]);
    // Fresh modules, so the stores really read from the (fake) database
    // instead of the test stand-ins from tests/setup.ts.
    vi.resetModules();
    const repo = await import("@/lib/repo");
    const { generatePkwtReviews } = await import("@/lib/engine/actions");
    repo.zparStore.init();
    repo.pkwtReviewStore.init();
    await settle();
    await settle();
    expect(repo.zparStore.employeesLoaded("aug")).toBe(false);

    repo.activateSnapshot("aug"); // "Use This Data" on August
    const run = await generatePkwtReviews();

    expect(run).toMatchObject({ period: "2026-08", eligible: 1, created: 1 });
  });
});
