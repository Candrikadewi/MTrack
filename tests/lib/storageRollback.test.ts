import { describe, expect, it } from "vitest";
import { demandStore } from "@/lib/repo";
import { getToasts } from "@/lib/toast";
import { setWriteResponder } from "../helpers/fakeSupabase";
import { demand } from "../helpers/fixtures";

const refuse = (op: string) =>
  setWriteResponder((_table, writeOp) =>
    writeOp === op ? { data: null, error: { message: "permission denied" } } : { data: null, error: null }
  );

/** Lets the (fake) database answer. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a write the database refuses", () => {
  it("puts an update back and tells the person", async () => {
    demandStore.insert(demand({ id: "d1", dept: "Assy 1" }));
    await settle();
    refuse("update");

    demandStore.update("d1", { dept: "Paint 1" });
    expect(demandStore.get("d1")?.dept).toBe("Paint 1"); // shown right away
    await settle();

    expect(demandStore.get("d1")?.dept).toBe("Assy 1");
    expect(getToasts().at(-1)?.message).toMatch(/Gagal menyimpan demand: permission denied/);
  });

  it("doesn't undo a later edit of the same field", async () => {
    demandStore.insert(demand({ id: "d1", dept: "Assy 1" }));
    await settle();
    let first = true;
    setWriteResponder((_t, op) => {
      if (op === "update" && first) {
        first = false;
        return { data: null, error: { message: "timeout" } };
      }
      return { data: null, error: null };
    });

    demandStore.update("d1", { dept: "Paint 1" }); // will fail
    demandStore.update("d1", { dept: "Paint 2" }); // will succeed
    await settle();

    expect(demandStore.get("d1")?.dept).toBe("Paint 2");
  });

  it("removes an insert that didn't save", async () => {
    refuse("insert");
    demandStore.insert(demand({ id: "d1" }));
    await settle();
    expect(demandStore.get("d1")).toBeUndefined();
  });

  it("brings back a row whose delete didn't go through", async () => {
    demandStore.insert(demand({ id: "d1" }));
    await settle();
    refuse("delete");
    demandStore.remove("d1");
    expect(demandStore.get("d1")).toBeUndefined();
    await settle();
    expect(demandStore.get("d1")).toBeDefined();
  });

  it("insertManyPersisted rolls back and returns the error for its caller to report", async () => {
    refuse("insert");
    const before = getToasts().length;
    const error = await demandStore.insertManyPersisted([demand({ id: "a" }), demand({ id: "b" })]);
    expect(error).toBe("permission denied");
    expect(demandStore.list()).toHaveLength(0);
    expect(getToasts()).toHaveLength(before);
  });
});
