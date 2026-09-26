import { describe, expect, it } from "vitest";
import { createTaktUp, deleteTaktUp, updateTaktUp } from "@/lib/engine/actions";
import { demandStore, taktStore } from "@/lib/repo";

function setup() {
  createTaktUp({
    plant: "Plant 1",
    date: "2026-11-01",
    takt_before: 60,
    takt_after: 55,
    need_rows: [{ division: "Assy", dept: "Assy 1", status_mp: "PKWT", mp_role: "Project", qty: 2, fulfill_date: "2026-11-01" }],
  });
  return taktStore.list().find((t) => t.category === "up")!;
}

describe("Takt Up", () => {
  it("opens a demand per MP needed", () => {
    const takt = setup();
    expect(takt.demand_ids).toHaveLength(2);
  });

  it("updates the case and grows its demands with the qty", () => {
    const takt = setup();
    const error = updateTaktUp(takt.id, {
      plant: "Plant 2",
      date: "2026-11-02",
      takt_before: 60,
      takt_after: 50,
      rows: [{ ...takt.need_rows![0], qty: 4 }],
    });
    expect(error).toBeNull();
    expect(taktStore.get(takt.id)?.plant).toBe("Plant 2");
    expect(taktStore.get(takt.id)?.demand_ids).toHaveLength(4);
  });

  it("deletes the case with its untouched demands", () => {
    const takt = setup();
    expect(deleteTaktUp(takt.id)).toBe(true);
    expect(taktStore.get(takt.id)).toBeUndefined();
    expect(demandStore.list().filter((d) => d.origin_ref === takt.id)).toHaveLength(0);
  });
});
