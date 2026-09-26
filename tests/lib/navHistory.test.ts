import { beforeEach, describe, expect, it, vi } from "vitest";

// navHistory keeps its stack in sessionStorage; give it a small in-memory
// window for these tests.
const storage = new Map<string, string>();
vi.stubGlobal("window", {
  sessionStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  },
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
});

const { navStackSnapshot, pageLabel, previousPath, recordVisit } = await import("@/lib/navHistory");

const back = (current: string) => previousPath(navStackSnapshot(), current);

describe("navHistory", () => {
  beforeEach(() => storage.clear());

  it("goes back to the page the person came from", () => {
    recordVisit("/dashboard");
    recordVisit("/demand");
    recordVisit("/projects/p1");
    expect(back("/projects/p1")).toBe("/demand");
    expect(pageLabel("/demand")).toBe("Demand");
  });

  it("pops instead of looping when the person goes back", () => {
    recordVisit("/demand");
    recordVisit("/projects");
    recordVisit("/projects/p1");
    recordVisit("/projects"); // back
    expect(back("/projects")).toBe("/demand");
  });

  it("works before the current page has been recorded", () => {
    recordVisit("/demand");
    expect(back("/projects")).toBe("/demand");
  });

  it("has no previous page when opened directly", () => {
    expect(back("/projects/p1")).toBeNull();
  });
});
