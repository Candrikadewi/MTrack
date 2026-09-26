import { describe, expect, it } from "vitest";
import { currentMonthKey, todayKey } from "@/lib/dates";

describe("date keys", () => {
  it("use local time, so early morning is still today", () => {
    const earlyMorning = new Date(2026, 8, 25, 1, 30); // 25 Sep, 01:30 local
    expect(todayKey(earlyMorning)).toBe("2026-09-25");
    expect(currentMonthKey(earlyMorning)).toBe("2026-09");
  });
});
