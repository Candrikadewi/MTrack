import { describe, expect, it } from "vitest";
import { demandStore } from "@/lib/repo";
import { calls } from "../helpers/fakeSupabase";
import { demand } from "../helpers/fixtures";

describe("store writes", () => {
  it("sends a blank date as null, since Postgres rejects '' in a date column", () => {
    demandStore.insert(demand({ id: "d9", fulfillment_confirmed_date: "", shop_confirmed_date: "", outgoing_nama: "" }));
    const insert = calls.find((c) => c.table === "demands" && c.op === "insert");
    expect(insert?.payload).toMatchObject({ fulfillment_confirmed_date: null, shop_confirmed_date: null, outgoing_nama: "" });
  });

  it("updates the cache before the database answers (optimistic)", () => {
    demandStore.insert(demand({ id: "d9" }));
    demandStore.update("d9", { dept: "Paint 1" });
    expect(demandStore.get("d9")?.dept).toBe("Paint 1");
  });
});
