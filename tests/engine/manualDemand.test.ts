import { describe, expect, it } from "vitest";
import { createManualDemand, deleteManualDemand, isEditableDemand, updateManualDemand } from "@/lib/engine/actions";
import { demandStore } from "@/lib/repo";

const input = {
  category: "PKWT" as const,
  origin_type: "Resign" as const,
  outgoing_noreg: "026001",
  outgoing_nama: "Budi",
  div: "Assy",
  dept: "Assy 1",
  fulfill_date: "2026-10-15",
};

describe("manual demand", () => {
  it("can be edited and deleted while nobody is mapped to it", () => {
    const d = createManualDemand(input);
    expect(isEditableDemand(d)).toBe(true);

    expect(updateManualDemand(d.id, { ...input, dept: "Assy 2" })).toBeNull();
    expect(demandStore.get(d.id)?.dept).toBe("Assy 2");

    expect(deleteManualDemand(d.id)).toBeNull();
    expect(demandStore.get(d.id)).toBeUndefined();
  });

  it("is locked once a candidate is mapped", () => {
    const d = createManualDemand(input);
    demandStore.update(d.id, { replacement_noreg: "X1" });
    expect(isEditableDemand(demandStore.get(d.id)!)).toBe(false);
    expect(deleteManualDemand(d.id)).not.toBeNull();
    expect(demandStore.get(d.id)).toBeDefined();
  });
});
