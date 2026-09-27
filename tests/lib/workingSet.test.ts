import { describe, expect, it } from "vitest";
import { createStore } from "@/lib/storage";
import type { Demand } from "@/lib/types";
import { answerWorkingSetsWithRpcResponder, calls, setRpcResponder, setTableRows } from "../helpers/fakeSupabase";
import { demand } from "../helpers/fixtures";

// A table read as a working set (migration_20): the browser keeps only
// what the database function returns, and reads older rows on demand.

describe("working-set store", () => {
  it("reads the working set instead of the whole table", async () => {
    setTableRows("demands", [demand({ id: "d1" })]);
    const store = createStore<Demand>("demands", { workingSet: "demands_working_set" });
    await store.load();
    expect(store.list().map((d) => d.id)).toEqual(["d1"]);
    expect(calls.some((c) => c.op === "rpc:demands_working_set")).toBe(true);
    expect(calls.some((c) => c.op === "select" && c.table === "demands")).toBe(false);
    expect(store.complete()).toBe(false);
  });

  it("reads the whole table while migration_20 hasn't been run", async () => {
    setTableRows("demands", [demand({ id: "d1" }), demand({ id: "d2" })]);
    answerWorkingSetsWithRpcResponder(true);
    setRpcResponder((fn) => ({
      data: null,
      error: { message: `Could not find the function public.${fn} without parameters in the schema cache` },
    }));
    const store = createStore<Demand>("demands", { workingSet: "demands_working_set" });
    await store.load();
    expect(store.list()).toHaveLength(2);
    expect(store.complete()).toBe(true);
  });

  it("adds older rows on demand and keeps them when the working set is read again", async () => {
    setTableRows("demands", [demand({ id: "d1", dept: "Assy 1" }), demand({ id: "old", dept: "Paint 1" })]);
    answerWorkingSetsWithRpcResponder(true);
    setRpcResponder(() => ({ data: [demand({ id: "d1", dept: "Assy 1" })], error: null }));
    const store = createStore<Demand>("demands", { workingSet: "demands_working_set" });
    await store.load();
    expect(store.list().map((d) => d.id)).toEqual(["d1"]);

    const rows = await store.fetchWhere((q) => q.eq("dept", "Paint 1"));
    expect(rows.map((d) => d.id)).toEqual(["old"]);
    expect(store.get("old")?.dept).toBe("Paint 1");

    await store.load();
    expect(store.list().map((d) => d.id)).toEqual(["d1", "old"]);
  });

  it("replaces a cached row with the fresher copy instead of doubling it", async () => {
    setTableRows("demands", [demand({ id: "d1", dept: "Assy 2" })]);
    const store = createStore<Demand>("demands", { workingSet: "demands_working_set" });
    store.insert(demand({ id: "d1", dept: "Assy 1" }));
    await store.fetchWhere((q) => q.eq("id", "d1"));
    expect(store.list()).toHaveLength(1);
    expect(store.get("d1")?.dept).toBe("Assy 2");
  });

  it("does not repeat a query made under the same key", async () => {
    setTableRows("demands", [demand({ id: "d1" })]);
    const store = createStore<Demand>("demands", { workingSet: "demands_working_set" });
    await store.fetchWhere((q) => q.eq("id", "d1"), { once: "d1" });
    await store.fetchWhere((q) => q.eq("id", "d1"), { once: "d1" });
    expect(calls.filter((c) => c.op === "select" && c.table === "demands")).toHaveLength(1);
  });
});
