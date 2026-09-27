import { describe, expect, it } from "vitest";
import { archiveSearchFilter } from "@/lib/archive";
import { beforeWorkingSet, inChunks, monthBounds, workingSetSince } from "@/lib/history";

describe("working-set line", () => {
  it("starts on the first day of the month 12 months ago, like the database", () => {
    expect(workingSetSince(new Date("2026-09-25T08:00:00"))).toBe("2025-09-01");
    expect(workingSetSince(new Date("2026-01-01T00:00:00"))).toBe("2025-01-01");
  });

  it("tells whether a date or month is older than that", () => {
    const today = new Date("2026-09-25T08:00:00");
    expect(beforeWorkingSet("2025-08", today)).toBe(true);
    expect(beforeWorkingSet("2025-08-31", today)).toBe(true);
    expect(beforeWorkingSet("2025-09", today)).toBe(false);
    expect(beforeWorkingSet("2025-09-01", today)).toBe(false);
    expect(beforeWorkingSet("", today)).toBe(false);
  });

  it("knows a month's first and last day", () => {
    expect(monthBounds("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });

  it("splits a long filter into short requests, without repeats", async () => {
    const seen: string[][] = [];
    const out = await inChunks(["a", "b", "a", "c", "", "d", "e"], async (chunk) => (seen.push(chunk), chunk), 2);
    expect(seen).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(out).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("archive search", () => {
  it("matches the text in every search column and drops what would break the filter", () => {
    expect(archiveSearchFilter("pkwt_reviews", "Budi, (S.)")).toBe(
      'noreg.ilike."*Budi S.*",nama.ilike."*Budi S.*",dept.ilike."*Budi S.*"'
    );
    expect(archiveSearchFilter("demands", "  ")).toBeNull();
  });
});
