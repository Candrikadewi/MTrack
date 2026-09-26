import { describe, expect, it } from "vitest";
import {
  computeReviewDate,
  computeVokasiEndedDate,
  contractUrgency,
  formatMinutesSecondsClock,
  projectFillCount,
  sisaHari,
  supplyDemandStatus,
} from "@/lib/engine/compute";

// "Today" is fixed at 2026-09-25 by tests/setup.ts.

describe("computeReviewDate", () => {
  it("is 24 months minus a day for Kontrak 1.x", () => {
    expect(computeReviewDate("2024-10-01", "Kontrak 1.1")).toBe("2026-09-30");
  });
  it("is 36 months minus a day for Kontrak 2", () => {
    expect(computeReviewDate("2024-10-01", "Kontrak 2")).toBe("2027-09-30");
  });
  it("is blank when the start date is missing or invalid", () => {
    expect(computeReviewDate("", "Kontrak 1.1")).toBe("");
    expect(computeReviewDate("not-a-date", "Kontrak 1.1")).toBe("");
  });
});

describe("computeVokasiEndedDate", () => {
  it("is six months minus a day", () => {
    expect(computeVokasiEndedDate("2026-04-01")).toBe("2026-09-30");
  });
});

describe("sisaHari", () => {
  it("counts days from today, negative when past", () => {
    expect(sisaHari("2026-09-30")).toBe(5);
    expect(sisaHari("2026-09-20")).toBe(-5);
  });
});

describe("supplyDemandStatus", () => {
  it("is Fulfilled Ontime when the shop received on or before the target", () => {
    expect(supplyDemandStatus("2026-09-20", "2026-10-10", "2026-09-19")).toBe("Fulfilled Ontime");
  });
  it("is Fulfilled but Delay when received after the target", () => {
    expect(supplyDemandStatus("2026-09-20", "2026-10-10", "2026-09-22")).toBe("Fulfilled but Delay");
  });
  it("is DELAY past the target and Need Replace ASAP past the deadline", () => {
    expect(supplyDemandStatus("2026-09-20", "2026-10-10", "")).toBe("DELAY");
    expect(supplyDemandStatus("2026-09-01", "2026-09-10", "")).toBe("Need Replace ASAP");
  });
  it("is Open before the target", () => {
    expect(supplyDemandStatus("2026-10-20", "2026-11-10", "")).toBe("Open");
  });
});

describe("contractUrgency", () => {
  it("is red within 30 days, orange within 60, green after, none for Permanen", () => {
    expect(contractUrgency("2026-10-10")).toBe("red");
    expect(contractUrgency("2026-11-10")).toBe("orange");
    expect(contractUrgency("2027-03-01")).toBe("green");
    expect(contractUrgency(null)).toBe("none");
  });
});

describe("projectFillCount", () => {
  it("counts one fill per contract that starts before the project ends", () => {
    // Vokasi contracts are 6 months: a 1-year project needs 2 people per seat.
    expect(projectFillCount("Vokasi", "2026-01-01", "2026-12-31")).toBe(2);
  });
  it("is null without a fixed contract length", () => {
    expect(projectFillCount("Permanen", "2026-01-01", "2026-12-31")).toBeNull();
  });
});

describe("formatMinutesSecondsClock", () => {
  it("formats seconds as m.ss", () => {
    expect(formatMinutesSecondsClock(125)).toBe("2.05");
  });
});
