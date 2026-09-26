import { afterEach, beforeEach, vi } from "vitest";
import { resetFakeSupabase } from "./helpers/fakeSupabase";
import { resetStores } from "./helpers/stores";

// Every store talks to Supabase through this one module; swap it for the
// in-memory fake so tests run offline and never write real data.
vi.mock("@/lib/supabase/client", async () => {
  const { fakeClient } = await import("./helpers/fakeSupabase");
  return { createClient: () => fakeClient };
});

beforeEach(() => {
  // Business rules depend on "today" (due months, overdue days), so every
  // test runs on the same fixed date. Only Date is faked: promises and
  // timers still run normally.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-25T08:00:00"));
  resetStores();
  resetFakeSupabase();
});

afterEach(() => {
  vi.useRealTimers();
});
