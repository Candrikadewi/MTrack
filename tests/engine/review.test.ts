import { describe, expect, it } from "vitest";
import { setReviewResults } from "@/lib/engine/actions";
import { pkwtReviewStore } from "@/lib/repo";
import { calls, setRpcResponder } from "../helpers/fakeSupabase";
import { review } from "../helpers/fixtures";

describe("setReviewResults (bulk review)", () => {
  it("saves every selected review and skips ones that already have the result", async () => {
    pkwtReviewStore.insert(review({ id: "a" }));
    pkwtReviewStore.insert(review({ id: "b" }));
    pkwtReviewStore.insert(review({ id: "c", review_result: "Continue" }));

    const result = await setReviewResults(["a", "b", "c"], "Continue");

    expect(result).toEqual({ saved: 2, failed: 0 });
    expect(pkwtReviewStore.list().every((r) => r.review_result === "Continue")).toBe(true);
    expect(calls.filter((c) => c.op === "rpc:set_review_result")).toHaveLength(2);
  });

  it("puts a review back when the database refuses it", async () => {
    pkwtReviewStore.insert(review({ id: "a" }));
    pkwtReviewStore.insert(review({ id: "b" }));
    setRpcResponder((_fn, args) =>
      (args as { p_review_id: string }).p_review_id === "b"
        ? { data: null, error: { message: "denied" } }
        : { data: null, error: null }
    );

    const result = await setReviewResults(["a", "b"], "Terminate");

    expect(result).toEqual({ saved: 1, failed: 1 });
    expect(pkwtReviewStore.get("a")?.review_result).toBe("Terminate");
    expect(pkwtReviewStore.get("b")?.review_result).toBe("");
  });
});
