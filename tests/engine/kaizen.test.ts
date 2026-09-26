import { describe, expect, it } from "vitest";
import { deleteKaizenBatch, parseKaizenLabel, removeKaizenPerson, updateKaizenBatch } from "@/lib/engine/actions";
import { utilPoolStore } from "@/lib/repo";
import { poolEntry } from "../helpers/fixtures";

const LABEL = "Kaizen 2026 Labor A/F - Assy (Line balancing)";

describe("Kaizen batches", () => {
  it("reads the parts of a batch label", () => {
    expect(parseKaizenLabel(LABEL)).toEqual({ year: "2026", group: "A/F", div: "Assy", activity: "Line balancing" });
  });

  it("renames the activity and moves the release date of every open entry", () => {
    utilPoolStore.insert(poolEntry({ id: "u1" }));
    utilPoolStore.insert(poolEntry({ id: "u2", noreg: "026002" }));
    expect(updateKaizenBatch(LABEL, { activity: "Layout baru", releaseDate: "2026-10-01" })).toBeNull();
    const entries = utilPoolStore.list();
    expect(entries.every((e) => e.source_label === "Kaizen 2026 Labor A/F - Assy (Layout baru)")).toBe(true);
    expect(entries.every((e) => e.entered_pool_date === "2026-10-01")).toBe(true);
  });

  it("only removes people who haven't been utilized yet", () => {
    utilPoolStore.insert(poolEntry({ id: "u1" }));
    utilPoolStore.insert(poolEntry({ id: "u2", noreg: "026002", status: "Assigned" }));
    expect(removeKaizenPerson("u2")).not.toBeNull();
    expect(removeKaizenPerson("u1")).toBeNull();
    expect(utilPoolStore.list().map((e) => e.id)).toEqual(["u2"]);
  });

  it("deleting a batch keeps the utilized people and reports them", () => {
    utilPoolStore.insert(poolEntry({ id: "u1" }));
    utilPoolStore.insert(poolEntry({ id: "u2", noreg: "026002", status: "Assigned" }));
    expect(deleteKaizenBatch(LABEL)).toBe(1);
    expect(utilPoolStore.list().map((e) => e.id)).toEqual(["u2"]);
  });
});
