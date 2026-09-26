import { describe, expect, it } from "vitest";
import { demandMonthKey, fulfillmentRows, fulfillmentStage, reviewOutcome } from "@/lib/engine/dashboard";
import { demand, review } from "../helpers/fixtures";

describe("reviewOutcome", () => {
  it("counts Continue, Terminate and not yet filled", () => {
    const outcome = reviewOutcome([
      review({ id: "a", review_result: "Continue" }),
      review({ id: "b", review_result: "Terminate" }),
      review({ id: "c", review_result: "" }),
      review({ id: "d", review_result: "Continue" }),
    ]);
    expect(outcome).toEqual({ total: 4, continued: 2, terminated: 1, pending: 1 });
  });
});

describe("fulfillmentStage", () => {
  it("follows a demand from open to received", () => {
    expect(fulfillmentStage(demand())).toBe("open");
    expect(fulfillmentStage(demand({ replacement_noreg: "X" }))).toBe("candidate");
    expect(fulfillmentStage(demand({ replacement_noreg: "X", fulfillment_confirmed_date: "2026-09-01" }))).toBe("signed");
    expect(fulfillmentStage(demand({ replacement_noreg: "X", shop_confirmed_date: "2026-09-02" }))).toBe("received");
    expect(fulfillmentStage(demand({ replacement_status: "No Replace" }))).toBe("noReplace");
  });
});

describe("demandMonthKey", () => {
  it("puts PKWT Terminate / Vokasi Ended demands in their review / end month", () => {
    expect(
      demandMonthKey(demand({ origin_type: "PkwtTerminate", tgl_ended_outgoing: "2026-10-03", fulfill_date: "2026-09-19" }))
    ).toBe("2026-10");
  });
  it("puts other demands in their fulfilment month", () => {
    expect(demandMonthKey(demand({ origin_type: "Project", fulfill_date: "2026-11-01" }))).toBe("2026-11");
  });
});

describe("fulfillmentRows", () => {
  it("counts each stage cumulatively and treats No Replace as done", () => {
    const rows = fulfillmentRows(
      [
        demand({ id: "1", origin_type: "PkwtTerminate" }),
        demand({ id: "2", origin_type: "PkwtTerminate", replacement_noreg: "N" }),
        demand({
          id: "3",
          origin_type: "PkwtTerminate",
          replacement_noreg: "N",
          status: "Fulfilled",
          fulfillment_confirmed_date: "2026-09-01",
        }),
        demand({
          id: "4",
          origin_type: "PkwtTerminate",
          replacement_noreg: "N",
          status: "Fulfilled",
          fulfillment_confirmed_date: "2026-09-01",
          shop_confirmed_date: "2026-09-02",
        }),
        demand({ id: "5", origin_type: "PkwtTerminate", replacement_status: "No Replace" }),
        demand({ id: "6", origin_type: "PkwtTerminate", category: "Vokasi" }),
      ],
      "PKWT"
    );
    expect(rows).toEqual([
      { reason: "PKWT Terminate", demand: 5, candidate: 3, signed: 2, received: 1, noReplace: 1, done: 2, percent: 40 },
    ]);
  });
});
