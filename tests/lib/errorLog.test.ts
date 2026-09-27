import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorFromUnknown, logError, resetErrorLog } from "@/lib/errorLog";
import { groupErrors, type ErrorRow } from "@/lib/errorGroups";
import { demandStore } from "@/lib/repo";
import { calls, setWriteResponder } from "../helpers/fakeSupabase";
import { demand } from "../helpers/fixtures";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const logged = () =>
  calls.filter((c) => c.table === "app_errors" && c.op === "insert").map((c) => c.payload as Record<string, unknown>);

describe("error log", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { href: "https://camp.test/demand" } });
    vi.stubGlobal("navigator", { userAgent: "test" });
    resetErrorLog();
  });

  it("records an error with where it happened", () => {
    logError({ source: "client", message: "x is undefined", stack: "at Demand" });
    expect(logged()).toEqual([
      expect.objectContaining({
        source: "client",
        message: "x is undefined",
        stack: "at Demand",
        url: "https://camp.test/demand",
      }),
    ]);
  });

  it("sends the same error once a minute and at most 20 per page load", () => {
    logError({ source: "client", message: "same" });
    logError({ source: "client", message: "same" });
    for (let i = 0; i < 30; i++) logError({ source: "client", message: `different ${i}` });
    expect(logged()).toHaveLength(20);
  });

  it("ignores browser noise", () => {
    logError({ source: "client", message: "ResizeObserver loop completed with undelivered notifications." });
    logError({ source: "client", message: "boom", stack: "at chrome-extension://abc/content.js" });
    expect(logged()).toHaveLength(0);
  });

  it("stops trying once the table turns out to be missing", async () => {
    setWriteResponder((table) =>
      table === "app_errors"
        ? { data: null, error: { message: 'relation "public.app_errors" does not exist' } }
        : { data: null, error: null }
    );
    logError({ source: "client", message: "first" });
    await settle();
    logError({ source: "client", message: "second" });
    expect(logged()).toHaveLength(1);
  });

  it("records saves the database refused", async () => {
    setWriteResponder((table) =>
      table === "demands" ? { data: null, error: { message: "permission denied" } } : { data: null, error: null }
    );
    demandStore.insert(demand({ id: "d1" }));
    await settle();
    expect(logged()).toEqual([expect.objectContaining({ source: "save", message: "demands: permission denied" })]);
  });

  it("turns anything thrown into a message", () => {
    expect(errorFromUnknown(new TypeError("bad"))).toMatchObject({ message: "bad" });
    expect(errorFromUnknown("plain")).toEqual({ message: "plain" });
    expect(errorFromUnknown({ code: 1 })).toEqual({ message: '{"code":1}' });
  });
});

describe("groupErrors", () => {
  const row = (id: string, message: string, at: string, user: string | null = "u1"): ErrorRow => ({
    id,
    created_at: at,
    user_id: user,
    source: "save",
    message,
    stack: null,
    url: `/page-${id}`,
    context: {},
  });

  it("folds repeats into one problem with a count, newest first", () => {
    const groups = groupErrors([
      row("1", "demands: denied", "2026-09-20T10:00:00Z", "u1"),
      row("2", "demands: denied", "2026-09-25T10:00:00Z", "u2"),
      row("3", "projects: denied", "2026-09-22T10:00:00Z", null),
    ]);
    expect(groups.map((g) => [g.message, g.count, g.people, g.lastUrl])).toEqual([
      ["demands: denied", 2, 2, "/page-2"],
      ["projects: denied", 1, 0, "/page-3"],
    ]);
    expect(groups[0].firstSeen).toBe("2026-09-20T10:00:00Z");
  });
});
